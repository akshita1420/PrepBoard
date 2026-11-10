# prepboard desktop helper installer (run once, via install.cmd).
# Links this laptop to your prepboard account, installs into your user folder (no admin needed)
# and starts the helper with Windows. After this it runs silently; nothing to click ever again.
$ErrorActionPreference = "Stop"
$Server = "__PREPBOARD_SERVER__"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dir = Join-Path $env:LOCALAPPDATA "prepboard-helper"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  prepboard desktop helper" -ForegroundColor Yellow
Write-Host "  server: $Server"
Write-Host ""

# Files from a downloaded zip are marked as "from the internet"; clear that so they can run.
Get-ChildItem -Path $Here -File | Unblock-File -ErrorAction SilentlyContinue

$code = Read-Host "  Paste the code from prepboard (overview > nudge > desktop helper)"
try {
    $body = @{ code = $code; deviceName = $env:COMPUTERNAME } | ConvertTo-Json
    $link = Invoke-RestMethod -Method Post -Uri "$Server/api/agent/link" -ContentType "application/json" -Body $body -TimeoutSec 30
} catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host ""
    Write-Host "  Could not link: $msg" -ForegroundColor Red
    Write-Host "  Get a fresh code on the dashboard and run install.cmd again."
    exit 1
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# Stop an older copy of the helper before replacing its files.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*prepboard-helper*agent.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($f in "agent.ps1", "nudge-car.ps1", "uninstall.cmd", "README.txt") {
    Copy-Item -Force (Join-Path $Here $f) (Join-Path $Dir $f)
}

# The token is encrypted with Windows' per-user protection (DPAPI): only this Windows account can read it.
$secureToken = ConvertTo-SecureString $link.token -AsPlainText -Force | ConvertFrom-SecureString
@{ server = $Server; token = $secureToken; user = $link.leetcodeUsername } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Dir "config.json")

# Start with Windows, completely hidden (no console window flashing).
$vbs = Join-Path $Dir "start-helper.vbs"
$agentPath = Join-Path $Dir "agent.ps1"
@"
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$agentPath""", 0, False
"@ | Set-Content -Encoding ASCII $vbs

$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup "prepboard helper.lnk"))
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbs`""
$shortcut.WorkingDirectory = $Dir
$shortcut.Description = "prepboard desktop helper"
$shortcut.Save()

Start-Process wscript.exe -ArgumentList "`"$vbs`""

# Say hello with the car, so you know it works.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $Dir 'nudge-car.ps1')`"",
    "-Title", "`"PREPBOARD HELPER READY`"", "-Subtitle", "`"SEE YOU AT YOUR NUDGE TIME`"", "-Url", "`"$Server`"")

Write-Host ""
Write-Host "  Done! Linked to $($link.leetcodeUsername)." -ForegroundColor Green
Write-Host "  The helper now starts with Windows and shows the car at your nudge time and at 9 pm."
Write-Host "  You can close this window. To remove it later, run uninstall.cmd in $Dir"
