# Phase 5 Deployment Script
# Deploys audit hardening to production

$ErrorActionPreference = "Stop"

Write-Host "=== Phase 5: Audit Hardening Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$SERVER = "199.188.200.186"
$PORT = "21098"
$USER = "speeuvmq"
$PASSWORD = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host "Server: ${SERVER}:${PORT}" -ForegroundColor Yellow
Write-Host "App Root: $APP_ROOT" -ForegroundColor Yellow
Write-Host ""

# Step 1: NUMERIC precision migration already completed
Write-Host "[1/8] NUMERIC precision migration already completed" -ForegroundColor Green
Write-Host ""

# Step 2: Upload and run immutable audit migration
Write-Host "[2/8] Running immutable audit migration..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server/migrations/20260514_phase5_immutable_audit.sql" "${USER}@${SERVER}:/tmp/phase5_immutable.sql"
$result = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f /tmp/phase5_immutable.sql 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to run immutable audit migration" -ForegroundColor Red
    Write-Host "Error output: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Immutable audit migration completed" -ForegroundColor Green
Write-Host ""

# Step 3: Upload and run state machine migration
Write-Host "[3/8] Running state machine migration..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server/migrations/20260514_phase5_state_machine.sql" "${USER}@${SERVER}:/tmp/phase5_state_machine.sql"
$result = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f /tmp/phase5_state_machine.sql 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to run state machine migration" -ForegroundColor Red
    Write-Host "Error output: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✓ State machine migration completed" -ForegroundColor Green
Write-Host ""

# Step 4: Upload and run audit verification migration
Write-Host "[4/8] Running audit verification migration..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server/migrations/20260514_phase5_audit_verification.sql" "${USER}@${SERVER}:/tmp/phase5_audit_verification.sql"
$result = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f /tmp/phase5_audit_verification.sql 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to run audit verification migration" -ForegroundColor Red
    Write-Host "Error output: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Audit verification migration completed" -ForegroundColor Green
Write-Host ""

# Step 5: Upload audit verification controller
Write-Host "[5/8] Uploading auditVerificationController.js..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\controllers\auditVerificationController.js" "${USER}@${SERVER}:${APP_ROOT}/server/controllers/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload auditVerificationController.js" -ForegroundColor Red
    exit 1
}
Write-Host "✓ auditVerificationController.js uploaded" -ForegroundColor Green
Write-Host ""

# Step 6: Upload audit verification routes
Write-Host "[6/8] Uploading auditVerificationRoutes.js..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\routes\auditVerificationRoutes.js" "${USER}@${SERVER}:${APP_ROOT}/server/routes/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload auditVerificationRoutes.js" -ForegroundColor Red
    exit 1
}
Write-Host "✓ auditVerificationRoutes.js uploaded" -ForegroundColor Green
Write-Host ""

# Step 7: Upload updated files
Write-Host "[7/8] Uploading updated files..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\routes\index.js" "${USER}@${SERVER}:${APP_ROOT}/server/routes/"
pscp -P $PORT -pw $PASSWORD "server\controllers\channelPartnerController.js" "${USER}@${SERVER}:${APP_ROOT}/server/controllers/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload updated files" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Updated files uploaded" -ForegroundColor Green
Write-Host ""

# Step 8: Restart PM2
Write-Host "[8/8] Restarting PM2..." -ForegroundColor Green
$result = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "cd ${APP_ROOT}; pm2 reload ecosystem.config.js --update-env 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to restart PM2" -ForegroundColor Red
    Write-Host "Error output: $result" -ForegroundColor Red
    exit 1
}
Write-Host "✓ PM2 restarted" -ForegroundColor Green
Write-Host ""

# Wait for server to start
Write-Host "Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verify deployment
Write-Host "Verifying deployment..." -ForegroundColor Yellow
$healthCheck = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "curl -s http://localhost:5000/api/health/ready"

if ($healthCheck -match '"status":"OK"') {
    Write-Host ""
    Write-Host "=== Phase 5 Deployment Complete ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "✓ All migrations executed" -ForegroundColor Green
    Write-Host "✓ All files uploaded" -ForegroundColor Green
    Write-Host "✓ PM2 restarted" -ForegroundColor Green
    Write-Host "✓ Health check passed" -ForegroundColor Green
    Write-Host ""
    Write-Host "New Features Available:" -ForegroundColor Cyan
    Write-Host "  - NUMERIC precision for financial calculations" -ForegroundColor White
    Write-Host "  - Immutable audit trail enforcement" -ForegroundColor White
    Write-Host "  - State machine enforcement for reconciliations" -ForegroundColor White
    Write-Host "  - Audit verification tools" -ForegroundColor White
    Write-Host ""
    Write-Host "API Endpoints:" -ForegroundColor Cyan
    Write-Host "  GET /api/audit/reconciliation/:id/verify" -ForegroundColor White
    Write-Host "  GET /api/audit/reseller/:id/log-completeness" -ForegroundColor White
    Write-Host "  GET /api/audit/reseller/:id/integrity-check" -ForegroundColor White
    Write-Host "  GET /api/audit/financial-health" -ForegroundColor White
    Write-Host "  GET /api/audit/reseller/:id/log" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=== Deployment Complete with Warnings ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Files uploaded but health check did not return OK" -ForegroundColor Yellow
    Write-Host "Check PM2 logs for errors:" -ForegroundColor Yellow
    # Write-Host "  ssh -p $PORT `"$USER`"@"`$SERVER`"" -ForegroundColor White
    Write-Host '  pm2 logs office-api-a --lines 50' -ForegroundColor White
    Write-Host ""
}