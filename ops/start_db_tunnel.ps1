param(
  [string]$PlinkPath,
  [string]$LogPath
)

if (-not $PlinkPath -or -not (Test-Path $PlinkPath)) {
  throw "Plink not found: $PlinkPath"
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sshKeyFile = $env:SSH_KEY_FILE
if (-not $sshKeyFile) { $sshKeyFile = Join-Path $root 'secrets\ssh_key' }
$useSshKey = $env:USE_SSH_KEY -eq '1' -and (Test-Path $sshKeyFile)
$sshExe = Get-Command -Name 'ssh.exe' -ErrorAction SilentlyContinue

$args = @(
  '-ssh',
  '-batch',
  '-P',
  '21098',
  '-l',
  'speeuvmq',
  '-pw',
  'Speednet@2015#',
  '-N',
  '-L',
  '5433:127.0.0.1:5432',
  '-keepalive',
  '60',
  '199.188.200.186'
)

$errLog = $LogPath + '.err'
if ($useSshKey -and $sshExe) {
  $sshArgs = @(
    '-N',
    '-L', '5433:127.0.0.1:5432',
    '-p', '21098',
    '-i', $sshKeyFile,
    '-o', 'BatchMode=yes',
    '-o', 'ServerAliveInterval=60',
    'speeuvmq@199.188.200.186'
  )
  Start-Process -WindowStyle Hidden -FilePath $sshExe.Source -ArgumentList $sshArgs -RedirectStandardOutput $LogPath -RedirectStandardError $errLog
}
else {
  Start-Process -WindowStyle Hidden -FilePath $PlinkPath -ArgumentList $args -RedirectStandardOutput $LogPath -RedirectStandardError $errLog
}
