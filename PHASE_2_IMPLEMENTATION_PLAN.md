# Phase 2 Implementation Plan: Billing Period Separation

**Date:** May 13, 2026  
**Status:** 🚧 IN PROGRESS  
**Dependencies:** Phase 1 (Database schema ready)

---

## Overview

Phase 2 separates **service period** (which month the service covers) from **bill issue date** (when the bill was created). This enables:

1. **Accurate commission calculation** based on service month, not billing month
2. **Deferred billing tracking** for unpaid amounts carried forward
3. **Realized vs deferred revenue** distinction for financial reporting
4. **Partner advance reconciliation** against correct service periods

---

## Current Problem

**Example Scenario:**
```
User Ali's May service → Bill created June 5 → Currently recorded as June revenue
Problem: Commission calculated on June, but service was May
Result: Profit-share calculation confused; deferred bills not tracked
```

**Current Code Issues:**
1. `initMonthlyPayments()` - Creates bills for current month without service_period
2. `recordUserPayment()` - Records payments without billing_status tracking
3. `generateCommissionInternal()` - Calculates commission from `month` field (bill month, not service month)
4. `importChannelData()` - Excel import doesn't set service_period

---

## Phase 2 Changes

### 1. Update `initMonthlyPayments()` Function

**Current behavior:**
- Creates bills for `month` parameter
- Sets `month` field only (bill creation month)

**New behavior:**
- Set `service_period` = requested month (the service month)
- Set `bill_issued_date` = NOW() (when bill is created)
- Set `billing_status` = 'realized' if paid, 'deferred' if unpaid
- Set `realized_amount` and `deferred_amount` based on payment

**Code location:** Line 242-280

---

### 2. Update `recordUserPayment()` Function

**Current behavior:**
- Records payment with `month` field
- Sets `payment_status` = 'paid' or 'unpaid'

**New behavior:**
- Set `service_period` = month parameter (service month)
- Set `bill_issued_date` = NOW() if new, preserve if updating
- Set `billing_status` based on payment:
  - 'realized' if `amount_paid >= amount_due`
  - 'partial_deferred' if `0 < amount_paid < amount_due`
  - 'deferred' if `amount_paid = 0`
- Calculate `realized_amount` = amount_paid
- Calculate `deferred_amount` = amount_due - amount_paid

**Code location:** Line 297-320

---

### 3. Update `bulkRecordPayments()` Function

**Current behavior:**
- Bulk inserts payments with `month` field

**New behavior:**
- Same logic as `recordUserPayment()` but in bulk
- Set service_period, billing_status, realized/deferred amounts

**Code location:** Line 322-370

---

### 4. Update `generateCommissionInternal()` Function

**Current behavior:**
```sql
SELECT ... FROM channel_user_payments
WHERE reseller_id = $1 AND month = $2
```
- Uses `month` field (bill creation month)

**New behavior:**
```sql
SELECT ... FROM channel_user_payments
WHERE reseller_id = $1 AND service_period = $2
```
- Use `service_period` field (service month)
- Calculate commission only on `realized_amount` (paid bills)
- Track `deferred_amount` separately for reporting

**Code location:** Line 520-600

---

### 5. Update `importChannelData()` Function

**Current behavior:**
- Excel import sets `month` field only

**New behavior:**
- Set `service_period` = month parameter
- Set `bill_issued_date` = NOW()
- Set `billing_status` = 'realized' (since import assumes paid)
- Set `realized_amount` = receiveAmount
- Set `deferred_amount` = 0

**Code location:** Line 900-930

---

### 6. Update `getUserPayments()` Query

**Current behavior:**
```sql
WHERE cup.reseller_id = $1 AND cup.month = $2
```

**New behavior:**
```sql
WHERE cup.reseller_id = $1 AND cup.service_period = $2
```
- Query by service_period instead of month
- Display billing_status in results

**Code location:** Line 195-220

---

## Implementation Steps

### Step 1: Update Payment Recording Functions ✅
- [x] `initMonthlyPayments()` - Add service_period, billing_status, realized/deferred amounts
- [x] `recordUserPayment()` - Add service_period tracking and billing_status logic
- [x] `bulkRecordPayments()` - Same as recordUserPayment but bulk

### Step 2: Update Commission Calculation ✅
- [x] `generateCommissionInternal()` - Use service_period instead of month
- [x] Calculate commission on realized_amount only
- [x] Track deferred amounts separately

### Step 3: Update Query Functions ✅
- [x] `getUserPayments()` - Query by service_period
- [x] `getCommissionSummary()` - Use service_period for calculations

### Step 4: Update Import Function ✅
- [x] `importChannelData()` - Set service_period and billing_status

### Step 5: Add Helper Functions ✅
- [x] `calculateBillingStatus()` - Determine billing_status from amounts
- [x] `calculateRealizedDeferred()` - Split amounts into realized/deferred

---

## SQL Query Changes

### Before (Current):
```sql
-- Payment recording
INSERT INTO channel_user_payments (reseller_id, user_id, month, amount_due, amount_paid, payment_status)
VALUES ($1, $2, $3, $4, $5, $6)

-- Commission calculation
SELECT SUM(amount_paid) FROM channel_user_payments
WHERE reseller_id = $1 AND month = $2
```

### After (Phase 2):
```sql
-- Payment recording
INSERT INTO channel_user_payments (
  reseller_id, user_id, month, 
  service_period, bill_issued_date, billing_status,
  amount_due, amount_paid, 
  realized_amount, deferred_amount,
  payment_status
)
VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)

-- Commission calculation
SELECT SUM(realized_amount) FROM channel_user_payments
WHERE reseller_id = $1 AND service_period = $2 AND billing_status IN ('realized', 'partial_deferred')
```

---

## Backward Compatibility

### Existing Data Migration
- Phase 1 migration already added columns with defaults
- Existing records have `service_period = NULL` initially
- Need data backfill script to set `service_period = month` for existing records

### API Compatibility
- All existing API endpoints remain unchanged
- New fields added to responses (service_period, billing_status, realized_amount, deferred_amount)
- Frontend can ignore new fields initially

---

## Testing Checklist

### Unit Tests
- [ ] `initMonthlyPayments()` sets service_period correctly
- [ ] `recordUserPayment()` calculates billing_status correctly
- [ ] `generateCommissionInternal()` uses service_period
- [ ] Billing status transitions: unpaid → partial → paid

### Integration Tests
- [ ] Create bill for May service in June → service_period = May
- [ ] Record partial payment → billing_status = 'partial_deferred'
- [ ] Record full payment → billing_status = 'realized'
- [ ] Commission calculation uses service_period, not bill month

### Edge Cases
- [ ] Previous month dues carried forward
- [ ] Multiple partial payments in same month
- [ ] Excel import with mixed paid/unpaid
- [ ] Commission recalculation after payment update

---

## Rollback Plan

If Phase 2 causes issues:

1. **Database:** No rollback needed (new columns nullable)
2. **Code:** Revert controller changes, use `month` field again
3. **Data:** Existing data unaffected (service_period can be NULL)

---

## Success Criteria

✅ **Phase 2 Complete When:**
1. All payment recording functions set `service_period` and `billing_status`
2. Commission calculation uses `service_period` instead of `month`
3. Deferred amounts tracked separately from realized amounts
4. Excel import sets service_period correctly
5. All existing tests pass
6. New tests for billing_status transitions pass

---

## Next Phase Preview

**Phase 3: Partner Advances in Settlement**
- Integrate partner advances into commission calculation
- Deduct partner advances from settlement amount
- Add UI for advance recording and approval

**Phase 4: Reconciliation Workflow**
- Month-end reconciliation process
- Approval workflow for commission finalization
- Reconciliation report generation

---

**Document Version:** 1.0  
**Created:** 2026-05-13  
**Status:** Ready for implementation
