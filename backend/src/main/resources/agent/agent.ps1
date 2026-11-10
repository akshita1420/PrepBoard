# prepboard desktop helper: runs hidden in the background and asks the server once a minute
# whether to show the pixel car. The server decides (your nudge time, 9 pm, contest reminders).
$ErrorActionPreference = "Continue"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log = Join-Path $Dir "helper.log"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Log([string]$Text) {
    try {
        if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 200KB) { Remove-Item $Log -Force }
        Add-Content -Path $Log -Value ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text)
    } catch {}
}

# Only one helper at a time.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "prepboard-desktop-helper", [ref]$created)
if (-not $created) { exit 0 }

try {
    $config = Get-Content -Raw (Join-Path $Dir "config.json") | ConvertFrom-Json
    $secure = ConvertTo-SecureString $config.token
    $token = [System.Net.NetworkCredential]::new("", $secure).Password
} catch {
    Write-Log "Cannot read config.json - run install.cmd again. $($_.Exception.Message)"
    exit 1
}

$car = Join-Path $Dir "nudge-car.ps1"
Write-Log "helper started for $($config.user) -> $($config.server)"

while ($true) {
    try {
        $r = Invoke-RestMethod -Uri "$($config.server)/api/agent/poll" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 20
        if ($r.show) {
            Write-Log "showing car: $($r.title) / $($r.subtitle)"
            Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
                "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", "`"$car`"",
                "-Title", "`"$($r.title)`"", "-Subtitle", "`"$($r.subtitle)`"", "-Url", "`"$($config.server)`"")
        }
    } catch {
        $status = $null
        try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        if ($status -eq 401) {
            Write-Log "this laptop was unlinked from prepboard; run install.cmd again to relink"
            Start-Sleep -Seconds 600
            continue
        }
        # Offline or server restarting: just try again next minute.
    }
    # Check a few seconds after each minute starts, so nudges land on time.
    $now = Get-Date
    $wait = 65 - $now.Second
    if ($wait -gt 60) { $wait -= 60 }
    Start-Sleep -Seconds $wait
}
