# Phase 1 Migration Runner via SSH (PowerShell)
# This script uploads and runs the Phase 1 migration on the remote server

$ErrorActionPreference = "Stop"

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"
$MIGRATION_FILE = "server\migrations\20260513_channel_partner_billing_standardization_phase1.sql"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 1 Migration - Remote Execution"
Write-Host "========================================================================"
Write-Host ""

# Step 1: Check migration file
Write-Host "Step 1: Checking migration file..."
if (!(Test-Path $MIGRATION_FILE)) {
    Write-Host "ERROR: Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Migration file found" -ForegroundColor Green
Write-Host ""

# Step 2: Read migration content
Write-Host "Step 2: Reading migration content..."
$migrationSQL = Get-Content $MIGRATION_FILE -Raw
Write-Host "OK: Migration loaded ($($migrationSQL.Length) bytes)" -ForegroundColor Green
Write-Host ""

# Step 3: Create a temporary script to run on server
Write-Host "Step 3: Preparing remote execution..."
$tempScript = @"
#!/bin/bash
cd $APP_ROOT
cat > /tmp/phase1_migration.sql << 'EOFMIGRATION'
$migrationSQL
EOFMIGRATION

echo "Running migration..."
PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f /tmp/phase1_migration.sql

if [ \$? -eq 0 ]; then
    echo ""
    echo "Migration successful! Verifying..."
    echo ""
    PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'channel_user_payments' AND column_name IN ('service_period', 'billing_status', 'realized_amount', 'deferred_amount') ORDER BY column_name;"
    echo ""
    echo "Cleaning up..."
    rm -f /tmp/phase1_migration.sql
    echo "Done!"
else
    echo "Migration failed!"
    exit 1
fi
"@

$tempScriptFile = "temp_migration_script.sh"
$tempScript | Out-File -FilePath $tempScriptFile -Encoding UTF8 -NoNewline

# Convert Windows line endings to Unix
(Get-Content $tempScriptFile -Raw) -replace "`r`n", "`n" | Set-Content $tempScriptFile -NoNewline

Write-Host "OK: Remote script prepared" -ForegroundColor Green
Write-Host ""

# Step 4: Execute via SSH using plink (PuTTY) if available, otherwise use ssh
Write-Host "Step 4: Executing migration on remote server..."
Write-Host ""

$plinkPath = "C:\Program Files\PuTTY\plink.exe"

if (Test-Path $plinkPath) {
    Write-Host "Using PuTTY plink..." -ForegroundColor Cyan
    $scriptContent = Get-Content $tempScriptFile -Raw
    $scriptContent | & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "bash -s"
} else {
    Write-Host "PuTTY not found. Using OpenSSH (you may need to enter password)..." -ForegroundColor Yellow
    Write-Host "Password: $SSH_PASS" -ForegroundColor Yellow
    Write-Host ""
    
    # Use ssh with password (requires manual entry or sshpass)
    Get-Content $tempScriptFile -Raw | ssh -p $SSH_PORT "$SSH_USER@$SSH_HOST" "bash -s"
}

# Clean up temp file
Remove-Item $tempScriptFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 1 Migration Complete!"
Write-Host "========================================================================"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run Phase 2 backfill: node server/scripts/phase2-backfill-data.js --confirm"
Write-Host "  2. Test the new billing flow"
Write-Host "  3. Proceed to Phase 3"
Write-Host ""
