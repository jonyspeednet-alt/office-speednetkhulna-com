@echo off
setlocal

cd /d "%~dp0"
set "MODE=LIVE DEPLOY"
if /I "%~1"=="-DryRun" set "MODE=DRY RUN"
if /I "%~1"=="/DryRun" set "MODE=DRY RUN"
if /I "%~1"=="-dryrun" set "MODE=DRY RUN"
if /I "%~1"=="/dryrun" set "MODE=DRY RUN"
echo [FullDeploy] Script dir: %~dp0
echo [FullDeploy] Starting full deploy...
echo [FullDeploy] Mode: %MODE%
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" (
  echo [FullDeploy] ERROR: powershell.exe not found at %PS_EXE%
  pause
  exit /b 1
)

echo [FullDeploy] Using: %PS_EXE%
"%PS_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_all_full.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [FullDeploy] FAILED with exit code %EXIT_CODE%.
  echo [FullDeploy] Check the log/output above for the exact stage that failed.
  pause
  exit /b 1
)

echo [FullDeploy] SUCCESS.
pause
exit /b 0
