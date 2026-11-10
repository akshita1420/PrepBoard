# Run this yourself once: adds two SSH public keys to the VPS so no password is needed afterwards.
#   - id_ed25519.pub        : this laptop (so setup can be done from here)
#   - prepboard-deploy.pub  : GitHub Actions auto-deploy
# You'll be asked for the VPS root password once.
#
#   powershell -ExecutionPolicy Bypass -File scripts\add-ssh-keys-to-vps.ps1
param([string]$Server = "root@vps.aravindc.dev")

$keys = @(
    Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
    Get-Content "$env:USERPROFILE\.ssh\prepboard-deploy.pub"
)

Write-Host "Adding 2 SSH keys to $Server (type the VPS password when asked) ..." -ForegroundColor Yellow
# The remote command has no double quotes on purpose: Windows PowerShell 5 mangles them when calling ssh.
# tr strips the Windows line endings PowerShell adds when piping text.
$keys | ssh -o StrictHostKeyChecking=accept-new $Server "mkdir -p ~/.ssh; chmod 700 ~/.ssh; tr -d '\r' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; echo KEYS_ADDED"
