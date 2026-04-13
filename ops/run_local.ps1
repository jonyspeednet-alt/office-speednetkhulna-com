param()

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $root 'ops\logs'
$clientDir = Join-Path $root 'client'
$serverDir = Join-Path $root 'server'
$plink = Join-Path $root 'ops\plink.exe'
if (-not (Test-Path $plink)) { $plink = 'C:\Program Files\PuTTY\plink.exe' }
$tunnelLog = Join-Path $logDir 'local-db-tunnel.log'
$tunnelWatchdogPid = Join-Path $logDir 'db-tunnel-watchdog.pid'

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$backendLog = Join-Path $logDir 'backend-local.log'
$backendErr = Join-Path $logDir 'backend-local.err.log'
$frontendLog = Join-Path $logDir 'frontend-local.log'
$frontendErr = Join-Path $logDir 'frontend-local.err.log'
$backendPidFile = Join-Path $logDir 'backend-local.pid'
$frontendPidFile = Join-Path $logDir 'frontend-local.pid'

$portableNode = Join-Path $root 'tools\node\node-v20.11.1-win-x64'
if (Test-Path (Join-Path $portableNode 'node.exe')) {
  $env:Path = "$portableNode;$env:Path"
}

function Test-LocalPort($port) {
  $out = netstat -ano | Select-String -Pattern ":$port .*LISTENING"
  return [bool]$out
}

function Get-ListeningPid($port) {
  $line = netstat -ano | Select-String -Pattern ":$port .*LISTENING" | Select-Object -First 1
  if (-not $line) { return $null }
  $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
  return $parts[-1]
}

function Write-Status($name, $port) {
  if (Test-LocalPort $port) {
    $procId = Get-ListeningPid $port
    if ($procId) {
      Write-Host "[Local][OK] $name running on port $port (PID $procId)"
    } else {
      Write-Host "[Local][OK] $name running on port $port"
    }
    return $true
  }
  Write-Host "[Local][WAIT] $name not running on port $port"
  return $false
}

Write-Host "[Local] Checking services..."
Write-Status "DB Tunnel" 5433 | Out-Null
Write-Status "Backend" 5001 | Out-Null
Write-Status "Frontend" 5173 | Out-Null

if (-not (Test-LocalPort 5433)) {
  if (-not (Test-Path $plink)) { throw "plink not found: $plink" }
  "[Local] Starting DB tunnel..." | Out-File -FilePath $tunnelLog -Encoding ascii
  & (Join-Path $root 'ops\start_db_tunnel.ps1') -PlinkPath $plink -LogPath $tunnelLog
  $ok = $false
  1..12 | ForEach-Object {
    Start-Sleep -Seconds 1
    if (Test-LocalPort 5433) { $ok = $true; return }
  }
  if (-not $ok) { throw "DB tunnel not established on localhost:5433" }
}

# Start watchdog to auto-restart tunnel if it dies
if (-not (Test-Path $tunnelWatchdogPid)) {
  $wd = Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File', (Join-Path $root 'ops\db_tunnel_watchdog.ps1'), '-PlinkPath', $plink, '-LogPath', $tunnelLog -PassThru
  $wd.Id | Out-File -FilePath $tunnelWatchdogPid -Encoding ascii
}
else {
  Write-Host "[Local] DB tunnel watchdog already running."
}

if (-not (Test-LocalPort 5001)) {
  $backend = Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c', "set APP_ENV=local && npm run dev" -WorkingDirectory $serverDir -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr -PassThru
  $backend.Id | Out-File -FilePath $backendPidFile -Encoding ascii
}
else {
  Write-Host "[Local] Backend already running (port 5001)."
}

if (-not (Test-LocalPort 5173)) {
  $frontend = Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c', "npm run dev" -WorkingDirectory $clientDir -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr -PassThru
  $frontend.Id | Out-File -FilePath $frontendPidFile -Encoding ascii
}
else {
  Write-Host "[Local] Frontend already running (port 5173)."
}

Write-Host "[Local] Backend:  http://localhost:5001"
Write-Host "[Local] Frontend: http://localhost:5173"
Write-Host "[Local] Logs:"
Write-Host "[Local]   Tunnel:   $tunnelLog"
Write-Host "[Local]   Backend:  $backendLog"
Write-Host "[Local]   Frontend: $frontendLog"

Start-Sleep -Seconds 2
try {
  Start-Process 'http://localhost:5173'
} catch {
  Write-Host "[Local] Could not auto-open frontend browser: $($_.Exception.Message)"
}
