param(
  [string]$Server = 'speeuvmq@199.188.200.186',
  [int]$Port = 21098,
  [string]$Password = 'Speednet@2015#',
  [string]$RemoteRoot = '/home/speeuvmq/office_app',
  [switch]$SkipNpmInstall,
  [switch]$SkipFrontendBuild,
  [switch]$ForceFrontend,
  [switch]$ForceBackend,
  [switch]$ForceNpmInstall,
  [switch]$ForceBrowser,
  [switch]$ForceScripts,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$clientDir = Join-Path $root 'client'
$distDir = Join-Path $clientDir 'dist'
$tmpDir = Join-Path $root '.deploy_tmp'
$bundlePath = Join-Path $tmpDir 'server_bundle.tgz'
$browserBundlePath = Join-Path $tmpDir 'browser_bundle.tgz'
$browserDownloadDir = Join-Path $tmpDir 'linux_browser_download'
$browserLibsDir = Join-Path $tmpDir 'browser_libs'
$htaccessTemplate = Join-Path $root 'ops/office_spa.htaccess'
$autoFinalizeTemplate = Join-Path $root 'server/scripts/auto_finalize_month_end.sh'
$dailyReportTemplate = Join-Path $root 'server/scripts/uptime_daily_report.sh'

$pscp = Join-Path $root 'ops\pscp.exe'
$plink = Join-Path $root 'ops\plink.exe'
if (-not (Test-Path $pscp)) { $pscp = 'C:\Program Files\PuTTY\pscp.exe' }
if (-not (Test-Path $plink)) { $plink = 'C:\Program Files\PuTTY\plink.exe' }

$portableNode = Join-Path $root 'tools\node\node-v20.11.1-win-x64'
if (Test-Path (Join-Path $portableNode 'node.exe')) {
  $env:PATH = "$portableNode;$($env:PATH)"
}
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$remoteTmp = "$RemoteRoot/.deploy_tmp"
$remoteFrontendStage = "$remoteTmp/frontend_stage_$stamp"
$officeDomainRoot = '/home/speeuvmq/office.speednetkhulna.com'
$watchdogRemotePath = "$RemoteRoot/scripts/office_health_watchdog.sh"
$switchRemotePath = "$RemoteRoot/scripts/switch_api_upstream.sh"
$syntheticRemotePath = "$RemoteRoot/scripts/synthetic_30s_monitor.sh"
$projectedBillsSyncRemotePath = "$RemoteRoot/scripts/sync_projected_bills.sh"
$autoFinalizeRemotePath = "$RemoteRoot/scripts/auto_finalize_month_end.sh"
$dailyReportRemotePath = "$RemoteRoot/scripts/uptime_daily_report.sh"
$monitorEnvRemotePath = "$RemoteRoot/.monitor.env"
$incidentReportPath = "$RemoteRoot/logs/incident_correlation_latest.txt"
$deployMetaRemoteDir = "$RemoteRoot/.deploy_meta"
$whatsappEnvBlock = @"
WHATSAPP_GROUP_NOTIFICATIONS_ENABLED=true
WHATSAPP_GROUP_NAME=Speed Net | Leave Updates
WHATSAPP_APPROVAL_BASE_URL=https://office.speednetkhulna.com
WHATSAPP_WORKER_BASE_URL=http://203.0.113.2:4010
WHATSAPP_WORKER_API_KEY=d719680a140844c08ba53b110a667bfd
WHATSAPP_WORKER_PULL_MODE=true
# Set this only if Chrome/Chromium exists on the host.
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
"@

$browserRemoteRoot = "$RemoteRoot/.browser"
$browserRemoteExtract = "$browserRemoteRoot/chrome-linux"
$browserRemoteLibs = "$RemoteRoot/.browser_libs"
$browserRemoteExecutable = $null

function Assert-Tool([string]$path, [string]$name) {
  if (-not (Test-Path $path)) {
    throw "$name not found at: $path"
  }
}

function Invoke-Remote([string]$cmd) {
  $output = & $plink -batch -ssh -P $Port -pw $Password $Server $cmd 2>&1
  if ($LASTEXITCODE -ne 0) {
    $txt = ($output | Out-String).Trim()
    if ($txt) { throw "Remote command failed: $cmd`n$txt" }
    throw "Remote command failed: $cmd"
  }
  return ($output | Out-String)
}

function Require-Path([string]$path, [string]$label) {
  if (-not (Test-Path $path)) {
    throw "$label not found: $path"
  }
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Get-StringHash([string]$content) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-RelativePathSafe([string]$basePath, [string]$fullPath) {
  $baseUri = [System.Uri]((Resolve-Path $basePath).Path.TrimEnd('\') + '\')
  $fullUri = [System.Uri](Resolve-Path $fullPath).Path
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fullUri).ToString()).Replace('/', '\')
}

function Get-PathFingerprint([string]$basePath, [string[]]$excludeRelativePrefixes = @()) {
  if (-not (Test-Path $basePath)) {
    return Get-StringHash("missing:$basePath")
  }

  if ((Get-Item $basePath).PSIsContainer) {
    $files = Get-ChildItem -Path $basePath -Recurse -File | Where-Object {
      $relative = Get-RelativePathSafe $basePath $_.FullName
      foreach ($prefix in $excludeRelativePrefixes) {
        $normalizedPrefix = $prefix.Trim('\')
        if ($relative -eq $normalizedPrefix -or $relative.StartsWith("$normalizedPrefix\")) {
          return $false
        }
      }
      return $true
    } | Sort-Object FullName

    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
      $relative = Get-RelativePathSafe $basePath $file.FullName
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
      $parts.Add("$relative|$hash")
    }
    return Get-StringHash(($parts -join "`n"))
  }

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $basePath).Hash.ToLowerInvariant()
}

function Get-RemoteMeta([string]$name) {
  $safeName = ($name -replace '[^A-Za-z0-9_.-]', '_')
  $output = Invoke-Remote "mkdir -p $deployMetaRemoteDir && if [ -f $deployMetaRemoteDir/$safeName ]; then cat $deployMetaRemoteDir/$safeName; fi"
  return $output.Trim()
}

function Set-RemoteMeta([string]$name, [string]$value) {
  $safeName = ($name -replace '[^A-Za-z0-9_.-]', '_')
  Invoke-Remote "mkdir -p $deployMetaRemoteDir && printf '%s' '$value' > $deployMetaRemoteDir/$safeName"
}

function Test-RemoteExecutable([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return $false }
  $result = Invoke-Remote "if [ -x '$path' ]; then echo yes; else echo no; fi"
  return $result.Trim() -eq 'yes'
}

Assert-Tool -path $pscp -name 'pscp'
Assert-Tool -path $plink -name 'plink'
Require-Path -path $clientDir -label 'client directory'
Require-Path -path (Join-Path $root 'server') -label 'server directory'
Require-Path -path $htaccessTemplate -label 'ops/office_spa.htaccess'
Require-Path -path $autoFinalizeTemplate -label 'server/scripts/auto_finalize_month_end.sh'
Require-Path -path $dailyReportTemplate -label 'server/scripts/uptime_daily_report.sh'

$frontendInputHash = Get-PathFingerprint $clientDir @('dist', 'node_modules')
$serverInputHash = Get-PathFingerprint (Join-Path $root 'server') @('node_modules', '.env')
$ecosystemHash = Get-PathFingerprint (Join-Path $root 'ecosystem.config.js')
$backendInputHash = Get-StringHash("server=$serverInputHash`necosystem=$ecosystemHash")
$npmInputParts = @()
foreach ($npmFile in @((Join-Path $root 'server/package.json'), (Join-Path $root 'server/package-lock.json'))) {
  if (Test-Path $npmFile) {
    $npmInputParts += "$(Split-Path $npmFile -Leaf)=$((Get-FileHash -Algorithm SHA256 -LiteralPath $npmFile).Hash.ToLowerInvariant())"
  }
}
$npmInputHash = Get-StringHash(($npmInputParts -join "`n"))
$browserLibFingerprint = Get-PathFingerprint (Join-Path $root '.browser_libs') @()
$browserInputHash = Get-StringHash("browser=v2`npackage=$npmInputHash`nlibs=$browserLibFingerprint")

Write-Host '[0/14] Deploy context...'
Write-Host "Script path: $($MyInvocation.MyCommand.Path)"
Write-Host "Workspace root: $root"
Write-Host "Remote root: $RemoteRoot"
Write-Host "Mode: $(if ($DryRun) { 'DRY RUN' } else { 'LIVE DEPLOY' })"

Write-Host '[1/14] Pre-deploy health gate...'
$preHealth = (Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health || true").Trim()
if ($preHealth -ne '200') {
  Write-Warning "Pre-deploy gate: current primary backend unhealthy (HTTP $preHealth). Continuing because this deploy is intended to recover the app."
}

Write-Host '[1.1/14] Remote env safety gate...'
$remoteEnvPath = "$RemoteRoot/.env"
$remoteEnvGuard = Invoke-Remote @"
if [ ! -f "$remoteEnvPath" ]; then
  echo "ERR:NO_ENV_FILE"
  exit 0
fi
JWT_LINE="`$(grep -E '^JWT_SECRET=' "$remoteEnvPath" | tail -n1 || true)"
SESSION_LINE="`$(grep -E '^SESSION_SECRET=' "$remoteEnvPath" | tail -n1 || true)"
FRONTEND_LINE="`$(grep -E '^FRONTEND_URL=' "$remoteEnvPath" | tail -n1 || true)"
if [ -z "`$JWT_LINE" ]; then echo "ERR:NO_JWT_SECRET"; fi
if [ -z "`$SESSION_LINE" ]; then echo "ERR:NO_SESSION_SECRET"; fi
if [ -z "`$FRONTEND_LINE" ]; then echo "ERR:NO_FRONTEND_URL"; fi
if echo "`$JWT_LINE" | grep -qi 'change_me'; then echo "ERR:JWT_PLACEHOLDER"; fi
if echo "`$SESSION_LINE" | grep -qi 'change_me'; then echo "ERR:SESSION_PLACEHOLDER"; fi
if ! echo "`$FRONTEND_LINE" | grep -q 'https://office.speednetkhulna.com'; then
  echo "WARN:FRONTEND_URL_NOT_OFFICE=`$FRONTEND_LINE"
fi
"@
if ($remoteEnvGuard -match 'ERR:NO_ENV_FILE') { throw "Remote env missing: $remoteEnvPath" }
if ($remoteEnvGuard -match 'ERR:NO_JWT_SECRET') { throw "Remote env missing JWT_SECRET in $remoteEnvPath" }
if ($remoteEnvGuard -match 'ERR:NO_SESSION_SECRET') { throw "Remote env missing SESSION_SECRET in $remoteEnvPath" }
if ($remoteEnvGuard -match 'ERR:NO_FRONTEND_URL') { throw "Remote env missing FRONTEND_URL in $remoteEnvPath" }
if ($remoteEnvGuard -match 'ERR:JWT_PLACEHOLDER') { throw "Remote env has placeholder JWT_SECRET in $remoteEnvPath" }
if ($remoteEnvGuard -match 'ERR:SESSION_PLACEHOLDER') { throw "Remote env has placeholder SESSION_SECRET in $remoteEnvPath" }
if ($remoteEnvGuard -match 'WARN:FRONTEND_URL_NOT_OFFICE=') {
  Write-Warning ($remoteEnvGuard.Trim())
}

Write-Host '[1.2/14] Remote WhatsApp runtime preflight...'
$chromeProbe = Invoke-Remote "sh -lc 'command -v google-chrome || command -v chromium-browser || command -v chromium || command -v chrome || true' 2>/dev/null"
if ([string]::IsNullOrWhiteSpace($chromeProbe)) {
  $configuredBrowserPath = (Invoke-Remote @"
if [ -f "$remoteEnvPath" ]; then
  grep -E '^PUPPETEER_EXECUTABLE_PATH=' "$remoteEnvPath" | tail -n1 | cut -d'=' -f2-
fi
"@).Trim()
  if (-not [string]::IsNullOrWhiteSpace($configuredBrowserPath) -and (Test-RemoteExecutable $configuredBrowserPath)) {
    Write-Host "Found configured browser executable: $configuredBrowserPath"
  } else {
    Write-Warning 'No Chrome/Chromium executable found on the host PATH or valid PUPPETEER_EXECUTABLE_PATH. WhatsApp Web automation may fail until a valid browser binary is configured.'
  }
} else {
  Write-Host "Found browser candidate: $($chromeProbe.Trim())"
}

$remoteFrontendHash = Get-RemoteMeta 'frontend.sha256'
$remoteBackendHash = Get-RemoteMeta 'backend.sha256'
$remoteNpmHash = Get-RemoteMeta 'npm.sha256'
$remoteBrowserHash = Get-RemoteMeta 'browser.sha256'
$remoteScriptsHash = Get-RemoteMeta 'scripts.sha256'
$remoteBrowserPathMeta = Get-RemoteMeta 'browser.path'
$remoteBrowserExecutableReady = Test-RemoteExecutable $remoteBrowserPathMeta

$shouldDeployFrontend = $ForceFrontend -or ($remoteFrontendHash -ne $frontendInputHash)
$shouldDeployBackend = $ForceBackend -or ($remoteBackendHash -ne $backendInputHash)
$shouldRunNpmInstall = (-not $SkipNpmInstall) -and ($ForceNpmInstall -or $shouldDeployBackend -or ($remoteNpmHash -ne $npmInputHash))
$shouldDeployBrowser = $false # Disabled because the host doesn't support the browser bundle

$frontendReason = if ($ForceFrontend) {
  'forced by -ForceFrontend'
} elseif ([string]::IsNullOrWhiteSpace($remoteFrontendHash)) {
  'no remote marker yet'
} elseif ($remoteFrontendHash -ne $frontendInputHash) {
  'source hash changed'
} else {
  'unchanged source hash'
}

$backendReason = if ($ForceBackend) {
  'forced by -ForceBackend'
} elseif ([string]::IsNullOrWhiteSpace($remoteBackendHash)) {
  'no remote marker yet'
} elseif ($remoteBackendHash -ne $backendInputHash) {
  'source hash changed'
} else {
  'unchanged source hash'
}

$npmReason = if ($SkipNpmInstall) {
  'disabled by -SkipNpmInstall'
} elseif ($ForceNpmInstall) {
  'forced by -ForceNpmInstall'
} elseif ($shouldDeployBackend) {
  'backend deploy required'
} elseif ([string]::IsNullOrWhiteSpace($remoteNpmHash)) {
  'no remote marker yet'
} elseif ($remoteNpmHash -ne $npmInputHash) {
  'package manifest hash changed'
} else {
  'lockfile/manifests unchanged'
}

$browserReason = if ($ForceBrowser) {
  'forced by -ForceBrowser'
} elseif ([string]::IsNullOrWhiteSpace($remoteBrowserHash)) {
  'no remote browser marker yet'
} elseif (-not $remoteBrowserExecutableReady) {
  'remote browser executable missing'
} elseif ($remoteBrowserHash -ne $browserInputHash) {
  'browser bundle hash changed'
} else {
  'remote browser already present'
}

Write-Host "[Plan] Frontend deploy: $(if ($shouldDeployFrontend) { 'yes' } else { 'skip' }) [$frontendReason]"
Write-Host "[Plan] Backend deploy: $(if ($shouldDeployBackend) { 'yes' } else { 'skip' }) [$backendReason]"
Write-Host "[Plan] npm install: $(if ($shouldRunNpmInstall) { 'yes' } else { 'skip' }) [$npmReason]"
Write-Host "[Plan] Browser bundle: $(if ($shouldDeployBrowser) { 'yes' } else { 'skip' }) [$browserReason]"
Write-Host "[Plan] Ops scripts: $(if ($shouldDeployScripts) { 'yes' } else { 'skip' }) [$scriptsReason]"

if ($DryRun) {
  Write-Host ''
  Write-Host '[DryRun] Preview complete.'
  Write-Host '[DryRun] Read-only checks were executed: context, env safety, health probe, remote meta lookup, browser preflight.'
  Write-Host '[DryRun] No build, upload, install, PM2 reload, cron change, or remote file mutation was performed.'
  return
}

Write-Host '[2/14] Building frontend...'
if ($shouldDeployFrontend -and -not $SkipFrontendBuild) {
  Push-Location $clientDir
  npm run build
  Pop-Location
} elseif ($shouldDeployFrontend -and $SkipFrontendBuild) {
  Write-Host 'Frontend marked changed, but build skipped via --SkipFrontendBuild.'
} else {
  Write-Host 'Skipped frontend build (unchanged source).'
}

Require-Path -path (Join-Path $distDir 'index.html') -label 'dist/index.html'
Require-Path -path (Join-Path $distDir 'assets') -label 'dist/assets'
$localIndex = Get-Content -Raw (Join-Path $distDir 'index.html')
$localMainJs = [regex]::Match($localIndex, 'assets\/index-[^"]+\.js').Value
if (-not $localMainJs) {
  throw 'Unable to detect main frontend bundle from local dist/index.html'
}
Write-Host "Local frontend bundle: $localMainJs"

Write-Host '[3/14] Preparing backend archive...'
if (Test-Path $tmpDir) {
  Remove-Item -Path $tmpDir -Recurse -Force
}
New-Item -Path $tmpDir -ItemType Directory | Out-Null

if ($shouldDeployBackend) {
  tar.exe -czf $bundlePath --format=ustar `
    --exclude='server/node_modules' `
    --exclude='server/.env' `
    -C $root ecosystem.config.js `
    -C $root server
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create backend archive.'
  }
} else {
  Write-Host 'Skipped backend archive creation (unchanged source).'
}

Write-Host '[4/14] Remote preflight (paths + permissions)...'
Invoke-Remote "mkdir -p $RemoteRoot/client/dist/assets $remoteTmp $RemoteRoot/server/controllers $RemoteRoot/server/routes $RemoteRoot/server/middleware $RemoteRoot/server/utilities $RemoteRoot/server/migrations $RemoteRoot/scripts $RemoteRoot/logs"
Invoke-Remote "chmod u+rwx $RemoteRoot/server $RemoteRoot/scripts $RemoteRoot/logs $remoteTmp $RemoteRoot/client/dist $RemoteRoot/client/dist/assets"
Invoke-Remote "find $RemoteRoot/server -type d -exec chmod u+rwx {} \; && find $RemoteRoot/server -type f -exec chmod u+rw {} \;"
Invoke-Remote "grep -q '^WHATSAPP_GROUP_NOTIFICATIONS_ENABLED=' $remoteEnvPath || printf '\n$whatsappEnvBlock\n' >> $remoteEnvPath"
Invoke-Remote "grep -q '^WHATSAPP_GROUP_NAME=' $remoteEnvPath || echo 'WHATSAPP_GROUP_NAME=Speed Net | Leave Updates' >> $remoteEnvPath"
Invoke-Remote "grep -q '^WHATSAPP_APPROVAL_BASE_URL=' $remoteEnvPath || echo 'WHATSAPP_APPROVAL_BASE_URL=https://office.speednetkhulna.com' >> $remoteEnvPath"
Invoke-Remote "grep -q '^WHATSAPP_WORKER_BASE_URL=' $remoteEnvPath || echo 'WHATSAPP_WORKER_BASE_URL=http://203.0.113.2:4010' >> $remoteEnvPath"
Invoke-Remote "grep -q '^WHATSAPP_WORKER_API_KEY=' $remoteEnvPath || echo 'WHATSAPP_WORKER_API_KEY=d719680a140844c08ba53b110a667bfd' >> $remoteEnvPath"
Invoke-Remote "grep -q '^WHATSAPP_WORKER_PULL_MODE=' $remoteEnvPath || echo 'WHATSAPP_WORKER_PULL_MODE=true' >> $remoteEnvPath"
Invoke-Remote "grep -q '^PUPPETEER_EXECUTABLE_PATH=' $remoteEnvPath || true"

Write-Host '[5/14] Uploading frontend to staging folder...'
if ($shouldDeployFrontend) {
  Invoke-Remote "rm -rf $remoteFrontendStage && mkdir -p $remoteFrontendStage/assets"
  & $pscp -batch -P $Port -pw $Password (Join-Path $distDir 'index.html') "${Server}:$remoteFrontendStage/index.html"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload staged dist/index.html' }
  & $pscp -batch -r -P $Port -pw $Password (Join-Path $distDir 'assets\*') "${Server}:$remoteFrontendStage/assets/"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload staged dist/assets' }
  $distRootFiles = Get-ChildItem -Path $distDir -File | Where-Object { $_.Name -ne 'index.html' }
  foreach ($file in $distRootFiles) {
    & $pscp -batch -P $Port -pw $Password $file.FullName "${Server}:$remoteFrontendStage/$($file.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Failed to upload staged dist/$($file.Name)" }
  }
} else {
  Write-Host 'Skipped frontend upload (unchanged source).'
}

Write-Host '[6/14] Swapping frontend atomically...'
if ($shouldDeployFrontend) {
  Invoke-Remote "mkdir -p $RemoteRoot/client/dist && rm -rf $RemoteRoot/client/dist/* && cp -a $remoteFrontendStage/. $RemoteRoot/client/dist/ && rm -rf $remoteFrontendStage"
  Invoke-Remote "mkdir -p $officeDomainRoot && find $officeDomainRoot -maxdepth 1 -type l \( -name index.html -o -name assets -o -name logo-b.png -o -name brand-logo.svg \) -delete && rm -rf $officeDomainRoot/assets && cp $RemoteRoot/client/dist/index.html $officeDomainRoot/index.html && cp -a $RemoteRoot/client/dist/assets $officeDomainRoot/assets && [ -f $RemoteRoot/client/dist/logo-b.png ] && cp $RemoteRoot/client/dist/logo-b.png $officeDomainRoot/logo-b.png || true && [ -f $RemoteRoot/client/dist/brand-logo.svg ] && cp $RemoteRoot/client/dist/brand-logo.svg $officeDomainRoot/brand-logo.svg || true && chmod 644 $officeDomainRoot/index.html && find $officeDomainRoot/assets -type f -exec chmod 644 {} \; && find $officeDomainRoot/assets -type d -exec chmod 755 {} \;"
  Set-RemoteMeta 'frontend.sha256' $frontendInputHash
} else {
  Write-Host 'Skipped frontend swap (unchanged source).'
}

Write-Host '[7/14] Uploading + extracting backend...'
if ($shouldDeployBackend) {
  & $pscp -batch -P $Port -pw $Password $bundlePath "${Server}:$remoteTmp/server_bundle.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload backend bundle' }
  Invoke-Remote "cd $RemoteRoot && tar --warning=no-unknown-keyword -xzf $remoteTmp/server_bundle.tgz --no-same-owner --no-same-permissions --no-overwrite-dir && rm -f $remoteTmp/server_bundle.tgz"
  Invoke-Remote "find $RemoteRoot/server -type d -exec chmod u+rwx {} \; && find $RemoteRoot/server -type f -exec chmod u+rw {} \;"
  Set-RemoteMeta 'backend.sha256' $backendInputHash
} else {
  Write-Host 'Skipped backend upload/extract (unchanged source).'
}

Write-Host '[8/14] Domain routing hardening (.htaccess + uploads symlink)...'
& $pscp -batch -P $Port -pw $Password $htaccessTemplate "${Server}:$officeDomainRoot/.htaccess"
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload office domain .htaccess template' }
& $pscp -batch -P $Port -pw $Password "$PSScriptRoot\proxy.php" "${Server}:$officeDomainRoot/proxy.php"
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload proxy.php' }
Invoke-Remote "if [ -e $officeDomainRoot/uploads ] && [ ! -L $officeDomainRoot/uploads ]; then mv $officeDomainRoot/uploads $officeDomainRoot/uploads_backup_$stamp; fi; ln -sfn $RemoteRoot/uploads $officeDomainRoot/uploads"
Invoke-Remote "echo 'ok' > $RemoteRoot/uploads/health-check.txt && chmod 664 $RemoteRoot/uploads/health-check.txt"

if ($shouldRunNpmInstall) {
  Write-Host '[9/14] Installing backend dependencies...'
  Invoke-Remote @"
set -e
cd $RemoteRoot/server
PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund > "$RemoteRoot/logs/npm-install.log" 2>&1
STATUS=`$?
tail -n 40 "$RemoteRoot/logs/npm-install.log" || true
exit `$STATUS
"@
  Set-RemoteMeta 'npm.sha256' $npmInputHash
} else {
  Write-Host '[9/14] Skipped npm install.'
}

Write-Host '[9.1/14] Preparing Linux Chrome bundle for WhatsApp automation...'
if ($shouldDeployBrowser) {
  if (Test-Path $browserDownloadDir) {
    Remove-Item -Path $browserDownloadDir -Recurse -Force
  }
  New-Item -Path $browserDownloadDir -ItemType Directory | Out-Null

  Push-Location $root
  try {
    $downloadSucceeded = $false
    $downloadErrors = New-Object System.Collections.Generic.List[string]
    $localPuppeteer = Join-Path $root "server\node_modules\.bin\puppeteer.cmd"
    
    $browserInstallCommands = New-Object System.Collections.Generic.List[Object]
    if (Test-Path $localPuppeteer) {
      $browserInstallCommands.Add(@($localPuppeteer, 'browsers', 'install', 'chrome', '--platform', 'linux', '--path', $browserDownloadDir))
    }
    $browserInstallCommands.Add(@('npx.cmd', '--yes', '@puppeteer/browsers', 'install', 'chrome', '--platform', 'linux', '--path', $browserDownloadDir))
    $browserInstallCommands.Add(@('npx.cmd', '--yes', '-p', '@puppeteer/browsers', 'browsers', 'install', 'chrome', '--platform', 'linux', '--path', $browserDownloadDir))

    foreach ($cmdArgs in $browserInstallCommands) {
      $executable = $cmdArgs[0]
      $args = $cmdArgs[1..($cmdArgs.Length-1)]
      $commandLabel = "$executable $($args -join ' ')"
      
      Write-Host "Attempting browser download via: $commandLabel"
      try {
        & $executable @args
        if ($LASTEXITCODE -eq 0) {
          $downloadSucceeded = $true
          break
        }
        $downloadErrors.Add("${commandLabel} exited with code $LASTEXITCODE")
      } catch {
        $downloadErrors.Add("${commandLabel} failed: $($_.Exception.Message)")
      }
    }

    if (-not $downloadSucceeded) {
      $combinedDownloadErrors = ($downloadErrors -join ' | ')
      throw "Failed to download Linux Chrome bundle for WhatsApp automation. $combinedDownloadErrors"
    }
  } finally {
    Pop-Location
  }

  $browserExecutableLocal = Get-ChildItem $browserDownloadDir -Recurse -File -Filter chrome | Select-Object -First 1
  if (-not $browserExecutableLocal) {
    throw 'Linux Chrome bundle download succeeded but executable not found.'
  }
  $browserRemoteExecutable = $browserExecutableLocal.FullName.Substring($browserDownloadDir.Length).TrimStart('\','/')
  $browserRemoteExecutable = ($browserRemoteExecutable -replace '\\','/')
  $browserRemoteExecutable = "$browserRemoteExtract/$browserRemoteExecutable"

  if (Test-Path $browserBundlePath) {
    Remove-Item -Path $browserBundlePath -Force
  }
  tar.exe -czf $browserBundlePath --format=ustar -C $browserDownloadDir .
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create browser bundle.'
  }

  Write-Host '[9.2/14] Uploading Linux Chrome bundle...'
  Invoke-Remote "mkdir -p $browserRemoteRoot"
  & $pscp -batch -P $Port -pw $Password $browserBundlePath "${Server}:$browserRemoteRoot/browser_bundle.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload browser bundle' }
  Invoke-Remote "rm -rf $browserRemoteExtract && mkdir -p $browserRemoteExtract && tar --warning=no-unknown-keyword -xzf $browserRemoteRoot/browser_bundle.tgz -C $browserRemoteExtract --no-same-owner --no-same-permissions --no-overwrite-dir && rm -f $browserRemoteRoot/browser_bundle.tgz"
  Invoke-Remote "chmod +x $browserRemoteExecutable"
  Invoke-Remote "if ! grep -q '^PUPPETEER_EXECUTABLE_PATH=' $remoteEnvPath; then echo 'PUPPETEER_EXECUTABLE_PATH=$browserRemoteExecutable' >> $remoteEnvPath; else sed -i 's#^PUPPETEER_EXECUTABLE_PATH=.*#PUPPETEER_EXECUTABLE_PATH=$browserRemoteExecutable#' $remoteEnvPath; fi"

  Write-Host '[9.3/14] Packaging browser shared libraries...'
  if (Test-Path $browserLibsDir) {
    Remove-Item -Path $browserLibsDir -Recurse -Force
  }
  New-Item -Path $browserLibsDir -ItemType Directory | Out-Null
  $browserLibRoots = @(
    (Join-Path $root '.browser_libs\at-spi2-atk'),
    (Join-Path $root '.browser_libs\at-spi2-core')
  )
  foreach ($libRoot in $browserLibRoots) {
    if (Test-Path $libRoot) {
      Copy-Item -Path $libRoot -Destination $browserLibsDir -Recurse -Force
    }
  }
  if (Test-Path (Join-Path $browserLibsDir 'at-spi2-atk')) {
    $browserLibBundlePath = Join-Path $tmpDir 'browser_libs.tgz'
    if (Test-Path $browserLibBundlePath) {
      Remove-Item -Path $browserLibBundlePath -Force
    }
    tar.exe -czf $browserLibBundlePath --format=ustar -C $browserLibsDir .
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to create browser libs bundle.'
    }
    & $pscp -batch -P $Port -pw $Password $browserLibBundlePath "${Server}:$browserRemoteRoot/browser_libs.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'Failed to upload browser libs bundle' }
    Invoke-Remote "rm -rf $browserRemoteLibs && mkdir -p $browserRemoteLibs && tar --warning=no-unknown-keyword -xzf $browserRemoteRoot/browser_libs.tgz -C $browserRemoteLibs --no-same-owner --no-same-permissions --no-overwrite-dir && rm -f $browserRemoteRoot/browser_libs.tgz"
    Invoke-Remote "if ! grep -q '^WHATSAPP_LD_LIBRARY_PATH=' $remoteEnvPath; then echo 'WHATSAPP_LD_LIBRARY_PATH=$browserRemoteLibs/at-spi2-atk:$browserRemoteLibs/at-spi2-core' >> $remoteEnvPath; else sed -i 's#^WHATSAPP_LD_LIBRARY_PATH=.*#WHATSAPP_LD_LIBRARY_PATH=$browserRemoteLibs/at-spi2-atk:$browserRemoteLibs/at-spi2-core#' $remoteEnvPath; fi"
  } else {
    Write-Warning 'Browser shared-library bundle not found locally; WhatsApp browser may still fail if host lacks GTK accessibility libs.'
  }
  Write-Host "Linux Chrome bundle deployed to $browserRemoteExecutable"
  Set-RemoteMeta 'browser.sha256' $browserInputHash
  Set-RemoteMeta 'browser.path' $browserRemoteExecutable

  if ([string]::IsNullOrWhiteSpace($chromeProbe)) {
    Write-Host '[9.1/14] Attempting bundled Chromium bootstrap for WhatsApp automation...'
    try {
      Invoke-Remote "cd $RemoteRoot/server && npx --yes puppeteer browsers install chrome"
    } catch {
      Write-Warning "Bundled Chromium bootstrap failed. WhatsApp automation will still require a valid browser binary. $($_.Exception.Message)"
    }
  }
} else {
  $browserRemoteExecutable = $remoteBrowserPathMeta
  Write-Host "Skipped Linux Chrome bundle deploy (unchanged existing browser at $browserRemoteExecutable)."
}

Write-Host '[10/14] PM2 dual-instance rollout...'
Invoke-Remote "cd $RemoteRoot && pm2 delete office-api >/dev/null 2>&1 || true"
Invoke-Remote "cd $RemoteRoot && (pm2 describe office-api-a >/dev/null 2>&1 && pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env || pm2 start ecosystem.config.js --only office-api-a,office-api-b --update-env) && pm2 save >/dev/null 2>&1"

Write-Host '[11/14] Installing failover + watchdog + synthetic monitors...'
$switchScript = @"
#!/usr/bin/env bash
set -euo pipefail
TARGET_PORT="`${1:-}"
HTACCESS_FILE="$officeDomainRoot/.htaccess"
if [[ "`$TARGET_PORT" != "5000" && "`$TARGET_PORT" != "5001" ]]; then
  echo "usage: switch_api_upstream.sh 5000|5001" >&2
  exit 1
fi
if [[ ! -f "`$HTACCESS_FILE" ]]; then
  echo "htaccess not found: `$HTACCESS_FILE" >&2
  exit 1
fi
sed -Ei "s#http://127.0.0.1:500[01]/api/#http://127.0.0.1:`$TARGET_PORT/api/#g" "`$HTACCESS_FILE"
echo "active_upstream=`$TARGET_PORT"
"@

$watchdogScript = @"
#!/usr/bin/env bash
set -u
APP_ROOT="$RemoteRoot"
SWITCH_SCRIPT="$switchRemotePath"
LOG_FILE="`$APP_ROOT/logs/health_watchdog.log"
ECO_FILE="`$APP_ROOT/ecosystem.config.js"
ENV_FILE="$monitorEnvRemotePath"
ALERT_STATE_FILE="`$APP_ROOT/logs/watchdog_alert_state.txt"
mkdir -p "`$APP_ROOT/logs"
[[ -f "`$ENV_FILE" ]] && source "`$ENV_FILE"
WEBHOOK_URL="`${MONITOR_WEBHOOK_URL:-}"
export HOME="/home/speeuvmq"
export PM2_HOME="/home/speeuvmq/.pm2"
export PATH="/home/speeuvmq/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:/bin:`$PATH"
PM2_BIN="`$(command -v pm2 || true)"
if [[ -z "`$PM2_BIN" ]]; then
  PM2_BIN="`$(ls -1 /home/speeuvmq/.nvm/versions/node/*/bin/pm2 2>/dev/null | tail -n 1)"
fi
if [[ -z "`$PM2_BIN" ]]; then
  echo "`$(date -Iseconds) pm2 binary not found in cron environment" >> "`$LOG_FILE"
  exit 1
fi

send_alert() {
  local text="`$1"
  [[ -z "`$WEBHOOK_URL" ]] && return 0
  local now
  now="`$(date +%s)"
  local last=0
  [[ -f "`$ALERT_STATE_FILE" ]] && last="`$(cat "`$ALERT_STATE_FILE" 2>/dev/null || echo 0)"
  if [[ "`$((now-last))" -lt 120 ]]; then
    return 0
  fi
  echo "`$now" > "`$ALERT_STATE_FILE"
  local payload
  payload="{\"text\":\"office watchdog: `$text @ `$(date -Iseconds)\"}"
  curl -k -s -m 8 -X POST -H "Content-Type: application/json" -d "`$payload" "`$WEBHOOK_URL" >/dev/null 2>&1 || true
}

ensure_pm2_apps() {
  local have_a=0
  local have_b=0
  `$PM2_BIN describe office-api-a >/dev/null 2>&1 && have_a=1
  `$PM2_BIN describe office-api-b >/dev/null 2>&1 && have_b=1
  local count=`$((have_a + have_b))
  if [[ "`$count" -lt 2 ]]; then
    `$PM2_BIN start "`$ECO_FILE" --only office-api-a,office-api-b --update-env >/dev/null 2>&1 || true
    `$PM2_BIN save >/dev/null 2>&1 || true
    echo "`$(date -Iseconds) pm2 app list repaired (count=`$count)" >> "`$LOG_FILE"
    send_alert "pm2 app list repaired (count=`$count)"
    sleep 2
  fi
}

check_port() {
  local p="`$1"
  local code
  code="`$(curl -s -m 6 -o /dev/null -w '%{http_code}' "http://127.0.0.1:`$p/api/health/ready" || echo 000)"
  [[ "`$code" == "200" ]]
}

ensure_pm2_apps

active_port="`$(grep -Eo '127.0.0.1:500[01]/api/' "$officeDomainRoot/.htaccess" | head -n1 | sed -E 's#.*:(500[01]).*#\1#')"
[[ -z "`$active_port" ]] && active_port="5000"
standby_port="5001"
[[ "`$active_port" == "5001" ]] && standby_port="5000"

active_ok=0
standby_ok=0
check_port "`$active_port" && active_ok=1
check_port "`$standby_port" && standby_ok=1

if [[ "`$active_port" == "5000" && "`$active_ok" -eq 0 ]]; then
  `$PM2_BIN restart office-api-a --update-env >/dev/null 2>&1 || true
fi
if [[ "`$active_port" == "5001" && "`$active_ok" -eq 0 ]]; then
  `$PM2_BIN restart office-api-b --update-env >/dev/null 2>&1 || true
fi
if [[ "`$standby_port" == "5000" && "`$standby_ok" -eq 0 ]]; then
  `$PM2_BIN restart office-api-a --update-env >/dev/null 2>&1 || true
fi
if [[ "`$standby_port" == "5001" && "`$standby_ok" -eq 0 ]]; then
  `$PM2_BIN restart office-api-b --update-env >/dev/null 2>&1 || true
fi

sleep 2
check_port "`$active_port" && active_ok=1 || active_ok=0
check_port "`$standby_port" && standby_ok=1 || standby_ok=0

if [[ "`$active_ok" -eq 0 && "`$standby_ok" -eq 1 ]]; then
  "$switchRemotePath" "`$standby_port" >/dev/null 2>&1
  echo "`$(date -Iseconds) switch upstream `$active_port -> `$standby_port" >> "`$LOG_FILE"
elif [[ "`$active_ok" -eq 0 && "`$standby_ok" -eq 0 ]]; then
  `$PM2_BIN restart office-api-a --update-env >/dev/null 2>&1 || true
  `$PM2_BIN restart office-api-b --update-env >/dev/null 2>&1 || true
  echo "`$(date -Iseconds) both backends unhealthy -> restarted both" >> "`$LOG_FILE"
  send_alert "both backends unhealthy -> restarted both"
fi
`$PM2_BIN save >/dev/null 2>&1 || true
"@

$syntheticScript = @"
#!/usr/bin/env bash
set -u
APP_ROOT="$RemoteRoot"
LOG_FILE="`$APP_ROOT/logs/synthetic_30s.log"
STATE_FILE="`$APP_ROOT/logs/synthetic_state.txt"
ENV_FILE="$monitorEnvRemotePath"
mkdir -p "`$APP_ROOT/logs"

[[ -f "`$ENV_FILE" ]] && source "`$ENV_FILE"

WEB_BASE="`${MONITOR_BASE_URL:-https://office.speednetkhulna.com}"
UPLOAD_PATH="`${MONITOR_UPLOAD_PATH:-/uploads/health-check.txt}"
AUTH_URL="`${MONITOR_AUTH_URL:-}"
AUTH_BEARER="`${MONITOR_AUTH_BEARER:-}"
WEBHOOK_URL="`${MONITOR_WEBHOOK_URL:-}"

check_url() {
  local url="`$1"
  local code
  code="`$(curl -k -s -m 8 -o /dev/null -w '%{http_code}' "`$url" || echo 000)"
  [[ "`$code" == "200" ]]
}

ok=1
check_url "`$WEB_BASE/api/health/live" || ok=0
check_url "`$WEB_BASE/api/health/ready" || ok=0
check_url "`$WEB_BASE`$UPLOAD_PATH" || ok=0

if [[ -n "`$AUTH_URL" && -n "`$AUTH_BEARER" ]]; then
  auth_code="`$(curl -k -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer `$AUTH_BEARER" "`$AUTH_URL" || echo 000)"
  [[ "`$auth_code" == "200" ]] || ok=0
fi

fails=0
[[ -f "`$STATE_FILE" ]] && fails="`$(cat "`$STATE_FILE" 2>/dev/null || echo 0)"
if [[ "`$ok" -eq 1 ]]; then
  fails=0
  echo "`$(date -Iseconds) status=ok" >> "`$LOG_FILE"
else
  fails="`$((fails+1))"
  echo "`$(date -Iseconds) status=fail consecutive=`$fails" >> "`$LOG_FILE"
fi
echo "`$fails" > "`$STATE_FILE"

if [[ "`$fails" -ge 2 && -n "`$WEBHOOK_URL" ]]; then
  payload="{\"text\":\"office monitor alert: consecutive failures=`$fails at `$(date -Iseconds)\"}"
  curl -k -s -m 8 -X POST -H "Content-Type: application/json" -d "`$payload" "`$WEBHOOK_URL" >/dev/null 2>&1 || true
fi
"@

$monitorEnv = @"
# Optional monitor settings. Leave blank to disable alert delivery.
MONITOR_BASE_URL="https://office.speednetkhulna.com"
MONITOR_UPLOAD_PATH="/uploads/health-check.txt"
# INTERNAL_AUTOMATION_TOKEN="<set-a-random-long-secret>"
# AUTO_FINALIZE_API_URL="http://127.0.0.1:5000/api/internal/billing/auto-finalize"
# AUTO_FINALIZE_STATUS_URL="http://127.0.0.1:5000/api/internal/billing/auto-finalize/status"
# MONITOR_AUTH_URL="https://office.speednetkhulna.com/api/sidebar"
# MONITOR_AUTH_BEARER="<jwt-token>"
# MONITOR_WEBHOOK_URL="https://your-webhook-endpoint"
"@

$switchLocalPath = Join-Path $tmpDir 'switch_api_upstream.sh'
$watchdogLocalPath = Join-Path $tmpDir 'office_health_watchdog.sh'
$syntheticLocalPath = Join-Path $tmpDir 'synthetic_30s_monitor.sh'
$projectedBillsSyncLocalPath = Join-Path $tmpDir 'sync_projected_bills.sh'
$monitorEnvLocalPath = Join-Path $tmpDir '.monitor.env'
$autoFinalizeLocalPath = $autoFinalizeTemplate
$dailyReportLocalPath = $dailyReportTemplate
Write-Utf8NoBom -path $switchLocalPath -content $switchScript
Write-Utf8NoBom -path $watchdogLocalPath -content $watchdogScript
Write-Utf8NoBom -path $syntheticLocalPath -content $syntheticScript
$projectedBillsSyncScript = @'
#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="__REMOTE_ROOT__"
LOG_FILE="$APP_ROOT/logs/projected_bills_sync.log"
mkdir -p "$APP_ROOT/logs"

NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(ls -1 /home/speeuvmq/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1 || true)"
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "$(date -Iseconds) node binary not found" >> "$LOG_FILE"
  exit 1
fi

echo "$(date -Iseconds) starting projected bill sync" >> "$LOG_FILE"
cd "$APP_ROOT"
"$NODE_BIN" "$APP_ROOT/server/scripts/sync-current-projected-bills.js" >> "$LOG_FILE" 2>&1
'@
$projectedBillsSyncScript = $projectedBillsSyncScript.Replace('__REMOTE_ROOT__', $RemoteRoot)
Write-Utf8NoBom -path $projectedBillsSyncLocalPath -content $projectedBillsSyncScript
Write-Utf8NoBom -path $monitorEnvLocalPath -content $monitorEnv
$scriptsInputHash = Get-StringHash(@(
  (Get-PathFingerprint $switchLocalPath),
  (Get-PathFingerprint $watchdogLocalPath),
  (Get-PathFingerprint $syntheticLocalPath),
  (Get-PathFingerprint $projectedBillsSyncLocalPath),
  (Get-PathFingerprint $monitorEnvLocalPath),
  (Get-PathFingerprint $autoFinalizeLocalPath),
  (Get-PathFingerprint $dailyReportLocalPath)
) -join "`n")
$shouldDeployScripts = $ForceScripts -or ($remoteScriptsHash -ne $scriptsInputHash)
$scriptsReason = if ($ForceScripts) {
  'forced by -ForceScripts'
} elseif ([string]::IsNullOrWhiteSpace($remoteScriptsHash)) {
  'no remote marker yet'
} elseif ($remoteScriptsHash -ne $scriptsInputHash) {
  'generated script hash changed'
} else {
  'generated content unchanged'
}

if ($shouldDeployScripts) {
  & $pscp -batch -P $Port -pw $Password $switchLocalPath "${Server}:$switchRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload switch_api_upstream script' }
  & $pscp -batch -P $Port -pw $Password $watchdogLocalPath "${Server}:$watchdogRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload watchdog script' }
  & $pscp -batch -P $Port -pw $Password $syntheticLocalPath "${Server}:$syntheticRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload synthetic monitor script' }
  & $pscp -batch -P $Port -pw $Password $projectedBillsSyncLocalPath "${Server}:$projectedBillsSyncRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload projected bill sync script' }
  & $pscp -batch -P $Port -pw $Password $autoFinalizeLocalPath "${Server}:$autoFinalizeRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload auto finalize script' }
  & $pscp -batch -P $Port -pw $Password $dailyReportLocalPath "${Server}:$dailyReportRemotePath"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upload uptime daily report script' }
  Invoke-Remote "[ -f $monitorEnvRemotePath ] || cat > $monitorEnvRemotePath <<'EOF'
$monitorEnv
EOF"
  Invoke-Remote "grep -q '^INTERNAL_AUTOMATION_TOKEN=' $monitorEnvRemotePath || echo 'INTERNAL_AUTOMATION_TOKEN=' >> $monitorEnvRemotePath"
  Invoke-Remote "grep -q '^AUTO_FINALIZE_API_URL=' $monitorEnvRemotePath || echo 'AUTO_FINALIZE_API_URL=http://127.0.0.1:5000/api/internal/billing/auto-finalize' >> $monitorEnvRemotePath"
  Invoke-Remote "grep -q '^AUTO_FINALIZE_STATUS_URL=' $monitorEnvRemotePath || echo 'AUTO_FINALIZE_STATUS_URL=http://127.0.0.1:5000/api/internal/billing/auto-finalize/status' >> $monitorEnvRemotePath"
  Invoke-Remote "chmod +x $switchRemotePath $watchdogRemotePath $syntheticRemotePath $projectedBillsSyncRemotePath $autoFinalizeRemotePath $dailyReportRemotePath && chmod 600 $monitorEnvRemotePath"
  Invoke-Remote "(crontab -l 2>/dev/null | grep -v 'office_health_watchdog.sh' | grep -v 'synthetic_30s_monitor.sh' | grep -v 'sync_projected_bills.sh' | grep -v 'auto_finalize_month_end.sh' | grep -v 'uptime_daily_report.sh' | grep -v 'pm2 resurrect'; echo '* * * * * $watchdogRemotePath'; echo '* * * * * $syntheticRemotePath'; echo '* * * * * sleep 30; $syntheticRemotePath'; echo '*/15 * * * * $projectedBillsSyncRemotePath'; echo '5 0 * * * $dailyReportRemotePath'; echo '59 23 28-31 * * $autoFinalizeRemotePath month_end'; echo '10 0 1 * * $autoFinalizeRemotePath retry'; echo '@reboot sleep 30 && export HOME=/home/speeuvmq && export PM2_HOME=/home/speeuvmq/.pm2 && export PATH=/home/speeuvmq/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:/bin && /home/speeuvmq/.nvm/versions/node/v24.13.1/bin/pm2 resurrect >/dev/null 2>&1 || /home/speeuvmq/.nvm/versions/node/v24.13.1/bin/pm2 start /home/speeuvmq/office_app/ecosystem.config.js --only office-api-a,office-api-b --update-env >/dev/null 2>&1') | crontab -"
  Invoke-Remote "bash $projectedBillsSyncRemotePath"
  Set-RemoteMeta 'scripts.sha256' $scriptsInputHash
} else {
  Write-Host 'Skipped failover/watchdog/synthetic/projected-bill sync script upload (unchanged generated content).'
}

Write-Host '[12/14] Post-deploy health gate (dual backend + domain)...'
$health5000 = (Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health/ready || true").Trim()
$health5001 = (Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/api/health/ready || true").Trim()
$healthDomain = (Invoke-Remote "curl -k -s -o /dev/null -w '%{http_code}' https://office.speednetkhulna.com/api/health || true").Trim()
if ($health5000 -ne '200' -or $health5001 -ne '200' -or $healthDomain -ne '200') {
  throw "Post-deploy health gate failed. 5000=$health5000 5001=$health5001 domain=$healthDomain"
}
$healthPayload = Invoke-Remote "curl -sS -m 12 http://127.0.0.1:5000/api/health"
if ($healthPayload -notmatch '"current_database"\s*:\s*"speeuvmq_speednet_office"') {
  throw "Unexpected DB target after deploy: $healthPayload"
}

Write-Host '[13/14] Incident-correlation baseline snapshot (7-day window)...'
$incidentCmd = @"
{
  date -Iseconds | sed 's/^/generated_at=/'
  echo '--- pm2 status ---'
  pm2 status office-api-a office-api-b
  echo '--- recent restarts ---'
  pm2 jlist | sed -n '1,200p'
  echo '--- 503 samples (domain logs) ---'
  zgrep -h ' 503 ' /home/speeuvmq/logs/office.speednetkhulna.com-ssl_log-*.gz 2>/dev/null | tail -n 200
} > $incidentReportPath
"@
Invoke-Remote $incidentCmd

Write-Host '[14/14] Verification and cleanup...'
$remoteIndex = Invoke-Remote "sed -n '1,40p' $RemoteRoot/client/dist/index.html"
$remoteBundle = [regex]::Match($remoteIndex, 'assets\/index-[^"]+\.js').Value
if (-not $remoteBundle) {
  throw 'Unable to detect remote frontend bundle from remote dist/index.html'
}
if ($remoteBundle -ne $localMainJs) {
  throw "Frontend bundle mismatch. Local=$localMainJs Remote=$remoteBundle."
}
$logoExistsInDist = (Invoke-Remote "test -f $RemoteRoot/client/dist/logo-b.png && echo yes || echo no").Trim()
if ($logoExistsInDist -ne 'yes') {
  throw "Frontend logo missing in deployed dist: $RemoteRoot/client/dist/logo-b.png"
}

if (Test-Path $tmpDir) {
  Remove-Item -Path $tmpDir -Recurse -Force
}

Write-Host 'DONE: Zero-downtime stabilization deploy completed (dual API + failover + monitors + gates).'
