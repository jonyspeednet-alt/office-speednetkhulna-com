@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SpeedNet Ops Control Center
color 0A

:menu
cls
echo ==================================================
echo        SpeedNet Ops Control Center
echo ==================================================
echo.
echo   1. Full Deploy
echo   2. Dry Run Preview
echo   3. Local Run
echo   4. Prod Mode Local
echo   5. Open Logs Folder
echo   6. Exit
echo.
echo   Tip: Deploy = live server, Dry Run = preview only
echo.
choice /c 123456 /n /m "Select an option [1-6]: "
set "CHOICE=%ERRORLEVEL%"

if "%CHOICE%"=="1" goto fulldeploy
if "%CHOICE%"=="2" goto dryrun
if "%CHOICE%"=="3" goto localrun
if "%CHOICE%"=="4" goto prodlocal
if "%CHOICE%"=="5" goto openlogs
if "%CHOICE%"=="6" goto end
goto menu

:fulldeploy
cls
echo [ControlCenter] Running FULL DEPLOY...
call "%~dp0deploy_all_full.bat"
echo.
echo [ControlCenter] Returned from FULL DEPLOY.
pause
goto menu

:dryrun
cls
echo [ControlCenter] Running DRY RUN preview...
call "%~dp0deploy_all_full.bat" -DryRun
echo.
echo [ControlCenter] Returned from DRY RUN preview.
pause
goto menu

:localrun
cls
echo [ControlCenter] Running LOCAL stack...
call "%~dp0run_local.bat"
echo.
echo [ControlCenter] Returned from LOCAL run.
pause
goto menu

:prodlocal
cls
echo [ControlCenter] Running PROD MODE LOCAL...
call "%~dp0run_prod_mode_local.bat"
echo.
echo [ControlCenter] Returned from PROD MODE LOCAL.
pause
goto menu

:openlogs
cls
echo [ControlCenter] Opening logs folder...
start "" "%~dp0logs"
echo.
echo [ControlCenter] Logs folder opened.
pause
goto menu

:end
echo.
echo [ControlCenter] Closed.
endlocal
exit /b 0
