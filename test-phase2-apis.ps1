# Test Phase 2 APIs

$API_BASE = "https://office.speednetkhulna.com/api"
$RESELLER_ID = 1

Write-Host ""
Write-Host "========================================================================"
Write-Host " Testing Phase 2 APIs"
Write-Host "========================================================================"
Write-Host ""

Write-Host "API Base: $API_BASE" -ForegroundColor Cyan
Write-Host "Reseller ID: $RESELLER_ID" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "Test 1: API Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_BASE/health/ready" -Method Get
    Write-Host "[OK] API is healthy" -ForegroundColor Green
    Write-Host "  Status: $($health.status)" -ForegroundColor Gray
    Write-Host "  DB Latency: $($health.db_latency_ms)ms" -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Health check failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get Commission Summary
Write-Host "Test 2: Get Commission Summary (May 2026)..." -ForegroundColor Yellow
try {
    $summary = Invoke-RestMethod -Uri "$API_BASE/channel-partners/$RESELLER_ID/commission/summary?month=2026-05" -Method Get
    Write-Host "[OK] Commission summary retrieved" -ForegroundColor Green
    Write-Host "  Month: $($summary.month)" -ForegroundColor Gray
    Write-Host "  Total Collected: $($summary.total_collected)" -ForegroundColor Gray
    
    if ($summary.PSObject.Properties.Name -contains 'total_realized') {
        Write-Host "  [NEW] Total Realized: $($summary.total_realized)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] Total Realized field" -ForegroundColor Red
    }
    
    if ($summary.PSObject.Properties.Name -contains 'total_deferred') {
        Write-Host "  [NEW] Total Deferred: $($summary.total_deferred)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] Total Deferred field" -ForegroundColor Red
    }
    
    Write-Host "  Gross Commission: $($summary.gross_commission)" -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get User Payments
Write-Host "Test 3: Get User Payments (May 2026)..." -ForegroundColor Yellow
try {
    $payments = Invoke-RestMethod -Uri "$API_BASE/channel-partners/$RESELLER_ID/payments?month=2026-05" -Method Get
    $count = if ($payments -is [Array]) { $payments.Count } else { 1 }
    Write-Host "[OK] User payments retrieved ($count records)" -ForegroundColor Green
    
    if ($count -gt 0) {
        $firstPayment = if ($payments -is [Array]) { $payments[0] } else { $payments }
        Write-Host "  Sample payment:" -ForegroundColor Gray
        Write-Host "    User: $($firstPayment.user_name)" -ForegroundColor Gray
        Write-Host "    Amount Due: $($firstPayment.amount_due)" -ForegroundColor Gray
        Write-Host "    Amount Paid: $($firstPayment.amount_paid)" -ForegroundColor Gray
        
        if ($firstPayment.PSObject.Properties.Name -contains 'service_period') {
            Write-Host "    [NEW] Service Period: $($firstPayment.service_period)" -ForegroundColor Green
        } else {
            Write-Host "    [MISSING] Service Period field" -ForegroundColor Red
        }
        
        if ($firstPayment.PSObject.Properties.Name -contains 'billing_status') {
            Write-Host "    [NEW] Billing Status: $($firstPayment.billing_status)" -ForegroundColor Green
        } else {
            Write-Host "    [MISSING] Billing Status field" -ForegroundColor Red
        }
        
        if ($firstPayment.PSObject.Properties.Name -contains 'realized_amount') {
            Write-Host "    [NEW] Realized Amount: $($firstPayment.realized_amount)" -ForegroundColor Green
        } else {
            Write-Host "    [MISSING] Realized Amount field" -ForegroundColor Red
        }
        
        if ($firstPayment.PSObject.Properties.Name -contains 'deferred_amount') {
            Write-Host "    [NEW] Deferred Amount: $($firstPayment.deferred_amount)" -ForegroundColor Green
        } else {
            Write-Host "    [MISSING] Deferred Amount field" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "[FAIL] Failed: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================================================"
Write-Host " Testing Complete!"
Write-Host "========================================================================"
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - If all tests show [OK] and [NEW] markers, Phase 2 is working"
Write-Host "  - If any [FAIL] or [MISSING] appears, check PM2 logs"
Write-Host ""
Write-Host "Next: Proceed to Phase 3 (Partner Advances Integration)" -ForegroundColor Green
Write-Host ""
