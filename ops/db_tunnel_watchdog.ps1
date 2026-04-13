param(
  [string]$PlinkPath,
  [string]$LogPath,
  [int]$Port = 5433
)

function Test-LocalPort($p) {
  $out = netstat -ano | Select-String -Pattern ":$p .*LISTENING"
  return [bool]$out
}

while ($true) {
  if (-not (Test-LocalPort $Port)) {
    & (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'start_db_tunnel.ps1') -PlinkPath $PlinkPath -LogPath $LogPath | Out-Null
  }
  Start-Sleep -Seconds 15
}
