@echo off
REM ============================================================
REM  SpeedNet Office - Service Startup Script
REM  This script starts all required services for the office
REM  management system to work properly.
REM ============================================================

setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo   Starting SpeedNet Office Services
echo ============================================================
echo.

REM Check if database tunnel is already running
netstat -ano | findstr ":5433.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Database tunnel is already running on port 5433
) else (
    echo [STARTING] Database tunnel...
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start_db_tunnel.ps1" -PlinkPath "%~dp0plink.exe" -LogPath "%~dp0logs\local-db-tunnel.log"
    timeout /t 3 /nobreak >nul
    
    netstat -ano | findstr ":5433.*LISTENING" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Database tunnel started successfully
    ) else (
        echo [ERROR] Failed to start database tunnel
        pause
        exit /b 1
    )
)

REM Check if watchdog is running
tasklist /FI "IMAGENAME eq powershell.exe" /FO CSV | findstr /C:"db_tunnel_watchdog" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Database tunnel watchdog is already running
) else (
    echo [STARTING] Database tunnel watchdog...
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0db_tunnel_watchdog.ps1\" -PlinkPath \"%~dp0plink.exe\" -LogPath \"%~dp0logs\local-db-tunnel.log\" -Port 5433' -PassThru"
    echo [OK] Database tunnel watchdog started
)

echo.
echo ============================================================
echo   All services started successfully!
echo ============================================================
echo.
echo   Database Tunnel: Port 5433
echo   Backend API:     http://localhost:5001
echo   Frontend:        http://localhost:5173
echo.
echo   Logs: %~dp0logs\
echo ============================================================
echo.

pause
