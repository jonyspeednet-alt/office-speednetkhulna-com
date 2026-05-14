@echo off
REM Phase 1 Migration Runner via SSH
REM This script uploads and runs the Phase 1 migration on the remote server

echo.
echo ========================================================================
echo  Phase 1 Migration - Remote Execution
echo ========================================================================
echo.

set SSH_HOST=199.188.200.186
set SSH_PORT=21098
set SSH_USER=speeuvmq
set SSH_PASS=Speednet@2015#
set APP_ROOT=/home/speeuvmq/office_app
set MIGRATION_FILE=server\migrations\20260513_channel_partner_billing_standardization_phase1.sql

echo Step 1: Checking migration file...
if not exist "%MIGRATION_FILE%" (
    echo ERROR: Migration file not found: %MIGRATION_FILE%
    pause
    exit /b 1
)
echo OK: Migration file found
echo.

echo Step 2: Uploading migration to server...
echo Using SCP to upload file...
echo.

REM Upload migration file using scp
scp -P %SSH_PORT% "%MIGRATION_FILE%" %SSH_USER%@%SSH_HOST%:/tmp/phase1_migration.sql

if errorlevel 1 (
    echo.
    echo ERROR: Failed to upload migration file
    echo.
    echo Please ensure:
    echo   1. SSH client is installed (OpenSSH)
    echo   2. Server is accessible
    echo   3. Credentials are correct
    echo.
    pause
    exit /b 1
)

echo.
echo Step 3: Running migration on server...
echo.

REM Run migration via SSH
ssh -p %SSH_PORT% %SSH_USER%@%SSH_HOST% "cd %APP_ROOT% && PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f /tmp/phase1_migration.sql"

if errorlevel 1 (
    echo.
    echo ERROR: Migration failed
    echo Check the error messages above
    pause
    exit /b 1
)

echo.
echo Step 4: Verifying migration...
echo.

REM Verify migration
ssh -p %SSH_PORT% %SSH_USER%@%SSH_HOST% "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c \"SELECT column_name FROM information_schema.columns WHERE table_name = 'channel_user_payments' AND column_name IN ('service_period', 'billing_status', 'realized_amount', 'deferred_amount') ORDER BY column_name;\""

echo.
echo Step 5: Cleaning up...
ssh -p %SSH_PORT% %SSH_USER%@%SSH_HOST% "rm -f /tmp/phase1_migration.sql"

echo.
echo ========================================================================
echo  Phase 1 Migration Complete!
echo ========================================================================
echo.
echo Next steps:
echo   1. Run Phase 2 backfill: node server/scripts/phase2-backfill-data.js --confirm
echo   2. Test the new billing flow
echo   3. Proceed to Phase 3
echo.
pause
