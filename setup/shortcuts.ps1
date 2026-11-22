param([string]$dest)
$s = New-Object -ComObject WScript.Shell
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$icon = Join-Path $dest 'setup\gatepass.ico'

$desk = [Environment]::GetFolderPath('Desktop')
Get-ChildItem -Path $desk -Filter 'Start CodeSafe*.lnk' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
# remove old CodeSafe shortcuts (old project) so it does not start at boot
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $desk 'CodeSafe.lnk')
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'CodeSafe Background.lnk')
$l = $s.CreateShortcut((Join-Path $desk 'GatePass.lnk'))
$l.TargetPath = $wscript
$l.Arguments = '"' + (Join-Path $dest 'Open GatePass.vbs') + '"'
$l.WorkingDirectory = $dest
$l.IconLocation = $icon
$l.Description = 'GatePass - Blockchain-Based Hostel Outpass Verification System'
$l.Save()

$startup = [Environment]::GetFolderPath('Startup')
$k = $s.CreateShortcut((Join-Path $startup 'GatePass Background.lnk'))
$k.TargetPath = $wscript
$k.Arguments = '"' + (Join-Path $dest 'GatePass Background.vbs') + '"'
$k.WorkingDirectory = $dest
$k.IconLocation = $icon
$k.Save()
Write-Host '  Shortcuts created (Desktop + Windows Startup).'
