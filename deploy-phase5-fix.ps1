# deploy-phase5-fix.ps1
# Re-runs ONLY the two failed Phase 5 migrations:
#   - 20260514_phase5_immutable_audit.sql   (fixed: EXECUTE FUNCTION -> EXECUTE PROCEDURE)
#   - 20260514_phase5_state_machine.sql
#   - 20260514_phase5_audit_verification.sql (re-run for completeness)
#
# The NUMERIC precision migration already ran successfully, so we skip it.

$ErrorActionPreference = "Continue"

Write-Host "=== Phase 5 Fix: Deploying Failed Migrations ===" -ForegroundColor Cyan
Write-Host "Target server: PostgreSQL 10.23 (EXECUTE PROCEDURE syntax enforced)" -ForegroundColor Yellow
Write-Host ""

# Connection config
$SERVER   = "199.188.200.186"
$PORT     = "21098"
$RUSER    = "speeuvmq"
$PASSWORD = "Speednet@2015#"
$DB_USER  = "speeuvmq_speeuvmq"
$DB_NAME  = "speeuvmq_speednet_office"
$DB_PASS  = "speednet_office"

$results = @{}

# ── Helper: upload + run one migration ────────────────────────────────────────
function Run-Migration {
    param([string]$Label, [string]$LocalFile, [string]$RemoteFile)

    Write-Host "-- $Label" -ForegroundColor Cyan

    Write-Host "   Uploading..." -ForegroundColor Gray
    pscp -P $PORT -pw $PASSWORD $LocalFile "${RUSER}@${SERVER}:${RemoteFile}"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   UPLOAD FAILED" -ForegroundColor Red
        return $false
    }
    Write-Host "   Uploaded OK" -ForegroundColor Green

    Write-Host "   Running SQL on server..." -ForegroundColor Gray
    $cmd = "PGPASSWORD='$DB_PASS' psql -h localhost -p 5432 -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f $RemoteFile 2>&1"
    $out = plink -batch -P $PORT -pw $PASSWORD "${RUSER}@${SERVER}" $cmd
    Write-Host $out

    $hasError = ($out -match "ERROR|FATAL|error:")
    if ($hasError) {
        Write-Host "   SQL FAILED (see output above)" -ForegroundColor Red
        return $false
    }
    Write-Host "   Migration OK" -ForegroundColor Green
    Write-Host ""
    return $true
}

# ── Run migrations ─────────────────────────────────────────────────────────────
$ok1 = Run-Migration `
    -Label      "[1/3] Immutable Audit (fixed for PG10)" `
    -LocalFile  "server\migrations\20260514_phase5_immutable_audit.sql" `
    -RemoteFile "/tmp/phase5_immutable.sql"

$ok2 = Run-Migration `
    -Label      "[2/3] State Machine" `
    -LocalFile  "server\migrations\20260514_phase5_state_machine.sql" `
    -RemoteFile "/tmp/phase5_state_machine.sql"

$ok3 = Run-Migration `
    -Label      "[3/3] Audit Verification Functions & View" `
    -LocalFile  "server\migrations\20260514_phase5_audit_verification.sql" `
    -RemoteFile "/tmp/phase5_audit_verification.sql"

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Migration Summary ===" -ForegroundColor Cyan

if ($ok1) {
    Write-Host "  [OK] Immutable audit triggers deployed" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Immutable audit triggers" -ForegroundColor Red
}

if ($ok2) {
    Write-Host "  [OK] State machine triggers deployed" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] State machine triggers" -ForegroundColor Red
}

if ($ok3) {
    Write-Host "  [OK] Audit verification functions deployed" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Audit verification functions" -ForegroundColor Red
}

Write-Host ""

if ($ok1 -and $ok2 -and $ok3) {
    Write-Host "All migrations succeeded. Checking app health..." -ForegroundColor Green
    $health = plink -batch -P $PORT -pw $PASSWORD "${RUSER}@${SERVER}" "curl -s http://localhost:5000/api/health/ready"
    Write-Host "Health response: $health"

    Write-Host ""
    Write-Host "=== Phase 5 FULLY COMPLETE ===" -ForegroundColor Green
    Write-Host "Database-level enforcement now active:" -ForegroundColor White
    Write-Host "  * Immutable audit log (reseller_financial_audit_log_immutable)" -ForegroundColor White
    Write-Host "  * Locked-month payment & advance protection" -ForegroundColor White
    Write-Host "  * Approved reconciliation immutability" -ForegroundColor White
    Write-Host "  * Reconciliation state machine (pending->approved/rejected)" -ForegroundColor White
    Write-Host "  * Partner advance state machine" -ForegroundColor White
    Write-Host "  * Audit verification SQL functions" -ForegroundColor White
    Write-Host "  * channel_partner_financial_health view" -ForegroundColor White
} else {
    Write-Host "One or more migrations failed. Review the psql output above." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common causes on PostgreSQL 10:" -ForegroundColor Yellow
    Write-Host "  * Table does not exist -> run earlier migration first" -ForegroundColor Yellow
    Write-Host "  * column does not exist -> check Phase 1 migration ran" -ForegroundColor Yellow
    Write-Host "  * Syntax error -> all EXECUTE FUNCTION replaced with EXECUTE PROCEDURE" -ForegroundColor Yellow
}
