@echo off
rem Removes the prepboard desktop helper from this laptop.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | Where-Object { $_.CommandLine -like '*prepboard-helper*agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'prepboard helper.lnk')"
echo prepboard helper stopped and removed from startup.
echo You can now delete this folder: %LOCALAPPDATA%\prepboard-helper
pause
