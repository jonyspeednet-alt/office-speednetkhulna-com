# Phase 3 Implementation Plan: Partner Advances Integration

**Date:** May 13, 2026  
**Status:** 🚧 IN PROGRESS  
**Dependencies:** Phase 1 (Database schema), Phase 2 (Billing period separation)

---

## Overview

Phase 3 integrates partner advance payments into the settlement calculation. When a partner pays a user's bill directly, this advance should be deducted from the partner's commission.

---

## Current Problem

**Scenario:**
```
User Ali owes 5000 BDT for May service
Partner pays 5000 BDT directly to Ali (advance payment)
System generates commission: 5000 * 10% = 500 BDT
Problem: Partner already paid 5000, but system still owes them 500 commission
Result: Partner gets double benefit (paid user + commission)
```

**Correct Behavior:**
```
User Ali owes 5000 BDT for May service
Partner pays 5000 BDT directly (advance payment)
System records advance: -5000 BDT
Commission calculation: 5000 * 10% = 500 BDT
Settlement: 500 - 5000 = -4500 BDT (partner owes company)
Result: Partner paid user, company deducts from commission
```

---

## Phase 3 Goals

1. **Record partner advances** - API to record when partner pays user directly
2. **Bulk import advances** - Import multiple advances from Excel
3. **Adjust settlement** - Deduct advances from commission payable
4. **Advance status tracking** - pending_adjustment → adjusted → reversed
5. **Reconciliation integration** - Include advances in month-end reconciliation

---

## Implementation Steps

### Step 1: Add Partner Advance API Endpoints ✅

**File:** `server/routes/channelPartnerRoutes.js`

**New Endpoints:**
```javascript
// Record single advance
POST /api/channel-partners/:resellerId/advances
Body: { user_id, advance_month, advance_amount, advance_type, notes }

// Record bulk advances
POST /api/channel-partners/:resellerId/advances/bulk
Body: { advances: [...] }

// Get pending advances
GET /api/channel-partners/:resellerId/advances/pending

// Apply advance to settlement
PATCH /api/channel-partners/:resellerId/advances/:advanceId/apply

// Dispute advance
PATCH /api/channel-partners/:resellerId/advances/:advanceId/dispute

// Reverse advance
PATCH /api/channel-partners/:resellerId/advances/:advanceId/reverse

// Get advance history
GET /api/channel-partners/:resellerId/advances/history?month=YYYY-MM
```

---

### Step 2: Update Commission Calculation ✅

**File:** `server/controllers/channelPartnerController.js`

**Function:** `generateCommissionInternal()`

**Changes:**
```javascript
// Current calculation
const grossCommission = totalRealized * (profitPct / 100);
const netCommission = grossCommission + adjustments - deductions;

// New calculation (include partner advances)
const grossCommission = totalRealized * (profitPct / 100);
const partnerAdvances = await getPartnerAdvancesForMonth(resellerId, month);
const netCommission = grossCommission + adjustments - deductions - partnerAdvances;
```

---

### Step 3: Update Settlement Statement ✅

**File:** `server/controllers/channelPartnerController.js`

**Function:** `getStatement()`

**Add partner advances to statement:**
```sql
UNION ALL
SELECT
  'advance'::text AS type,
  cpa.id,
  cpa.advance_amount AS amount,
  cpa.advance_month AS date,
  'অগ্রিম পেমেন্ট - ' || cpu.user_name AS description,
  TO_CHAR(cpa.advance_month, 'YYYY-MM') AS month
FROM channel_partner_advances cpa
JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
WHERE cpa.reseller_id = $1 AND cpa.settlement_status = 'adjusted'
```

---

### Step 4: Update Reconciliation Process ✅

**File:** `server/utilities/billingReconciliation.js`

**Function:** `initiateReconciliation()`

**Include partner advances in reconciliation:**
```javascript
// Get partner advances for the period
const advancesResult = await client.query(
  `SELECT COALESCE(SUM(advance_amount), 0) AS total_advances
   FROM channel_partner_advances
   WHERE reseller_id = $1 
   AND advance_month = $2 
   AND settlement_status = 'pending_adjustment'`,
  [resellerId, period]
);

const partnerAdvances = Number(advancesResult.rows[0].total_advances);

// Include in reconciliation log
await client.query(
  `INSERT INTO billing_reconciliation_logs (
    reseller_id, reconciliation_period, 
    partner_advances_this_period, ...
  ) VALUES ($1, $2, $3, ...)`,
  [resellerId, period, partnerAdvances, ...]
);
```

---

### Step 5: Add Excel Import for Advances ✅

**File:** `server/controllers/channelPartnerController.js`

**New Function:** `importPartnerAdvances()`

**Excel Format:**
```
| User Name | Advance Amount | Advance Month | Advance Type | Notes |
|-----------|----------------|---------------|--------------|-------|
| Ali       | 5000           | 2026-05       | self_paid    | ...   |
| Karim     | 3000           | 2026-05       | direct_payment | ... |
```

---

## Data Flow

### Recording an Advance

```
1. Partner pays user directly (outside system)
2. Admin records advance via API:
   POST /api/channel-partners/1/advances
   { user_id: 123, advance_month: '2026-05', advance_amount: 5000 }
3. System creates record:
   - settlement_status: 'pending_adjustment'
   - created_by: admin_user_id
4. Advance appears in pending advances list
```

### Month-End Reconciliation

```
1. Admin initiates reconciliation:
   POST /api/channel-partners/1/reconciliation/initiate
   { month: '2026-05' }
2. System calculates:
   - Total realized: 50,000
   - Gross commission: 5,000 (10%)
   - Partner advances: 8,000
   - Net payable: 5,000 - 8,000 = -3,000 (partner owes company)
3. Admin approves reconciliation:
   PATCH /api/channel-partners/1/reconciliation/:logId/approve
4. System marks advances as 'adjusted'
5. Settlement statement shows:
   - Commission earned: +5,000
   - Partner advances: -8,000
   - Net settlement: -3,000
```

---

## API Request/Response Examples

### Record Single Advance

**Request:**
```http
POST /api/channel-partners/1/advances
Content-Type: application/json

{
  "user_id": 123,
  "advance_month": "2026-05",
  "advance_amount": 5000,
  "advance_type": "self_paid",
  "notes": "Partner paid user directly"
}
```

**Response:**
```json
{
  "success": true,
  "advance": {
    "id": 456,
    "reseller_id": 1,
    "user_id": 123,
    "advance_month": "2026-05-01",
    "advance_amount": 5000,
    "advance_type": "self_paid",
    "settlement_status": "pending_adjustment",
    "created_at": "2026-05-13T11:40:00Z"
  }
}
```

### Get Pending Advances

**Request:**
```http
GET /api/channel-partners/1/advances/pending
```

**Response:**
```json
{
  "success": true,
  "advances": [
    {
      "id": 456,
      "user_id": 123,
      "user_name": "Ali",
      "advance_month": "2026-05-01",
      "advance_amount": 5000,
      "advance_type": "self_paid",
      "settlement_status": "pending_adjustment",
      "created_at": "2026-05-13T11:40:00Z"
    }
  ],
  "total_pending": 5000
}
```

### Bulk Import Advances

**Request:**
```http
POST /api/channel-partners/1/advances/bulk
Content-Type: application/json

{
  "advances": [
    {
      "user_id": 123,
      "advance_month": "2026-05",
      "advance_amount": 5000,
      "advance_type": "self_paid"
    },
    {
      "user_id": 124,
      "advance_month": "2026-05",
      "advance_amount": 3000,
      "advance_type": "direct_payment"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 advances recorded",
  "total_amount": 8000
}
```

---

## Database Queries

### Get Partner Advances for Month

```sql
SELECT 
  cpa.id,
  cpa.user_id,
  cpu.user_name,
  cpa.advance_month,
  cpa.advance_amount,
  cpa.advance_type,
  cpa.settlement_status,
  cpa.notes,
  cpa.created_at
FROM channel_partner_advances cpa
JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
WHERE cpa.reseller_id = $1 
  AND cpa.advance_month = $2
  AND cpa.settlement_status = 'pending_adjustment'
ORDER BY cpa.created_at DESC;
```

### Calculate Total Advances for Settlement

```sql
SELECT 
  COALESCE(SUM(advance_amount), 0) AS total_advances
FROM channel_partner_advances
WHERE reseller_id = $1 
  AND advance_month = $2 
  AND settlement_status IN ('pending_adjustment', 'adjusted');
```

### Mark Advances as Adjusted

```sql
UPDATE channel_partner_advances
SET settlement_status = 'adjusted',
    resolved_by = $1,
    resolved_at = NOW()
WHERE reseller_id = $2 
  AND advance_month = $3 
  AND settlement_status = 'pending_adjustment';
```

---

## Testing Checklist

### Unit Tests
- [ ] Record single advance
- [ ] Record bulk advances
- [ ] Get pending advances
- [ ] Apply advance to settlement
- [ ] Dispute advance
- [ ] Reverse advance
- [ ] Calculate total advances

### Integration Tests
- [ ] Record advance → appears in pending list
- [ ] Initiate reconciliation → includes advances
- [ ] Approve reconciliation → marks advances as adjusted
- [ ] Settlement statement → shows advances
- [ ] Commission calculation → deducts advances

### Edge Cases
- [ ] Advance amount > commission earned
- [ ] Multiple advances for same user/month
- [ ] Advance for future month
- [ ] Reverse advance after reconciliation
- [ ] Dispute advance workflow

---

## Success Criteria

✅ **Phase 3 Complete When:**
1. All advance API endpoints working
2. Commission calculation includes advances
3. Settlement statement shows advances
4. Reconciliation process includes advances
5. Bulk import working
6. Advance status transitions working
7. All tests pass

---

## Files to Modify/Create

**Modify:**
- `server/controllers/channelPartnerController.js` - Add advance endpoints
- `server/routes/channelPartnerRoutes.js` - Add advance routes
- `server/utilities/billingReconciliation.js` - Include advances in reconciliation

**Already Created (Phase 1):**
- `server/utilities/partnerAdvanceManager.js` - Advance management utility
- `channel_partner_advances` table - Database table

**New (Optional):**
- `client/src/components/ResellerProfile/Tabs/AdvancesTab.jsx` - UI for advances

---

## Timeline

**Estimated Duration:** 2-3 days

**Day 1:**
- Add API endpoints
- Update commission calculation
- Update settlement statement

**Day 2:**
- Update reconciliation process
- Add bulk import
- Testing

**Day 3:**
- UI implementation (optional)
- Documentation
- Deployment

---

**Document Version:** 1.0  
**Created:** 2026-05-13  
**Status:** Ready for implementation
