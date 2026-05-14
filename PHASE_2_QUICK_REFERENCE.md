# Phase 2 Quick Reference Guide

**For Developers & Testers**

---

## What Changed?

### 🎯 Core Concept
**Service Period ≠ Bill Issue Date**

- **service_period** = Which month the service covers (e.g., May 2026)
- **bill_issued_date** = When the bill was created (e.g., June 5, 2026)
- **billing_status** = Payment status: 'realized', 'partial_deferred', or 'deferred'

---

## New Database Fields

### `channel_user_payments` Table

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `service_period` | DATE | Month the service covers | 2026-05-01 |
| `bill_issued_date` | DATE | When bill was created | 2026-06-05 |
| `billing_status` | VARCHAR | Payment status | 'realized' |
| `realized_amount` | NUMERIC | Amount actually paid | 3000.00 |
| `deferred_amount` | NUMERIC | Amount unpaid | 2000.00 |

---

## Billing Status Values

| Status | Meaning | Condition |
|--------|---------|-----------|
| `realized` | Fully paid | amount_paid >= amount_due |
| `partial_deferred` | Partially paid | 0 < amount_paid < amount_due |
| `deferred` | Unpaid | amount_paid = 0 |

---

## API Changes

### 1. Create Monthly Bills
**Endpoint:** `POST /api/channel-partners/:resellerId/payments/init`

**Request:**
```json
{
  "month": "2026-05"
}
```

**What happens:**
- Creates bills with `service_period = '2026-05'`
- Sets `bill_issued_date = NOW()`
- Sets `billing_status = 'deferred'` (unpaid initially)
- Sets `realized_amount = 0`, `deferred_amount = amount_due`

---

### 2. Record Payment
**Endpoint:** `POST /api/channel-partners/:resellerId/payments/record`

**Request:**
```json
{
  "user_id": 123,
  "month": "2026-05",
  "amount_paid": 3000,
  "payment_date": "2026-06-05",
  "note": "Partial payment"
}
```

**What happens:**
- Sets `service_period = '2026-05'`
- Calculates `billing_status` based on amount
- Sets `realized_amount = 3000`
- Sets `deferred_amount = amount_due - 3000`

---

### 3. Get Commission Summary
**Endpoint:** `GET /api/channel-partners/:resellerId/commission/summary?month=2026-05`

**Response (NEW FIELDS):**
```json
{
  "month": "2026-05",
  "total_collected": 50000,
  "total_realized": 45000,      // ← NEW: Actually paid
  "total_deferred": 5000,        // ← NEW: Unpaid
  "gross_commission": 4500,      // ← Calculated on realized, not collected
  "net_commission": 4500,
  ...
}
```

**Key Change:** Commission now calculated on `total_realized` (actually paid), not `total_collected`

---

### 4. Get User Payments
**Endpoint:** `GET /api/channel-partners/:resellerId/payments?month=2026-05`

**Response (NEW FIELDS):**
```json
[
  {
    "id": 123,
    "user_id": 456,
    "month": "2026-05",
    "service_period": "2026-05",        // ← NEW
    "bill_issued_date": "2026-06-05",   // ← NEW
    "billing_status": "partial_deferred", // ← NEW
    "amount_due": 5000,
    "amount_paid": 3000,
    "realized_amount": 3000,             // ← NEW
    "deferred_amount": 2000,             // ← NEW
    ...
  }
]
```

**Key Change:** Now queries by `service_period` instead of `month`

---

## Testing Scenarios

### Scenario 1: Full Payment
```javascript
// Create bill for May service
POST /api/channel-partners/1/payments/init
{ "month": "2026-05" }

// Record full payment
POST /api/channel-partners/1/payments/record
{
  "user_id": 123,
  "month": "2026-05",
  "amount_paid": 5000  // Full amount
}

// Expected result:
{
  "service_period": "2026-05",
  "billing_status": "realized",
  "realized_amount": 5000,
  "deferred_amount": 0
}
```

### Scenario 2: Partial Payment
```javascript
// Record partial payment
POST /api/channel-partners/1/payments/record
{
  "user_id": 123,
  "month": "2026-05",
  "amount_paid": 3000  // Partial amount (due: 5000)
}

// Expected result:
{
  "service_period": "2026-05",
  "billing_status": "partial_deferred",
  "realized_amount": 3000,
  "deferred_amount": 2000
}
```

### Scenario 3: Commission Calculation
```javascript
// Get commission for May
GET /api/channel-partners/1/commission/summary?month=2026-05

// Expected:
// - Uses service_period = '2026-05' (not bill creation month)
// - Commission calculated on realized_amount only
// - Deferred amounts tracked separately
```

---

## Database Queries

### Query by Service Period (NEW)
```sql
-- Get payments for May service (regardless of when bill was created)
SELECT * FROM channel_user_payments
WHERE reseller_id = 1 
  AND service_period = '2026-05-01';
```

### Query by Billing Status
```sql
-- Get all fully paid bills
SELECT * FROM channel_user_payments
WHERE reseller_id = 1 
  AND billing_status = 'realized';

-- Get all deferred bills
SELECT * FROM channel_user_payments
WHERE reseller_id = 1 
  AND billing_status IN ('deferred', 'partial_deferred');
```

### Calculate Realized vs Deferred
```sql
-- Summary of realized vs deferred for a month
SELECT 
  service_period,
  SUM(realized_amount) AS total_realized,
  SUM(deferred_amount) AS total_deferred,
  COUNT(*) FILTER (WHERE billing_status = 'realized') AS fully_paid_count,
  COUNT(*) FILTER (WHERE billing_status = 'partial_deferred') AS partial_paid_count,
  COUNT(*) FILTER (WHERE billing_status = 'deferred') AS unpaid_count
FROM channel_user_payments
WHERE reseller_id = 1 
  AND service_period = '2026-05-01'
GROUP BY service_period;
```

---

## Common Issues & Solutions

### Issue 1: Existing records have NULL service_period
**Solution:** Run backfill script
```bash
node server/scripts/phase2-backfill-data.js --confirm
```

### Issue 2: Commission calculation seems wrong
**Check:**
1. Are you querying by `service_period` or `month`?
2. Are you using `realized_amount` or `amount_paid`?
3. Have you run the backfill script for existing data?

### Issue 3: Billing status not updating
**Check:**
1. Is `amount_due` set correctly?
2. Is `amount_paid` being passed correctly?
3. Are helper functions (`calculateBillingStatus`) working?

---

## Rollback Plan

If Phase 2 causes issues:

1. **Code rollback:**
   ```bash
   git revert <phase2-commit-hash>
   ```

2. **Database:** No rollback needed (new columns are nullable)

3. **Queries:** Change back to using `month` instead of `service_period`

---

## Next Steps After Phase 2

### Phase 3: Partner Advances
- Integrate partner advances into settlement
- Deduct advances from commission payable
- Add UI for advance recording

### Phase 4: Reconciliation
- Month-end reconciliation workflow
- Approval process for commission
- Reconciliation report generation

---

## Support

**Questions?** Check:
1. `PHASE_2_IMPLEMENTATION_SUMMARY.md` - Detailed implementation docs
2. `PHASE_2_IMPLEMENTATION_PLAN.md` - Original plan
3. `server/controllers/channelPartnerController.js` - Source code with comments

---

**Last Updated:** 2026-05-13  
**Version:** 1.0
