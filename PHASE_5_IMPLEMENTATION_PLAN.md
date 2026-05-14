# Phase 5: Audit Hardening - Implementation Plan

**Phase:** 5 of 5 (Final Phase)  
**Status:** 📋 READY TO IMPLEMENT  
**Estimated Duration:** 2-3 hours  
**Dependencies:** ✅ Phase 1, 2, 3, 4 complete

---

## 🎯 Goals

### Primary Goal
Strengthen data integrity and audit trail by:
1. Replacing JavaScript float math with PostgreSQL NUMERIC for precision
2. Enforcing immutable audit at database level
3. Adding database triggers for state machine enforcement
4. Creating audit verification tools

### Business Value
- **Precision:** No rounding errors in financial calculations
- **Integrity:** Database-level enforcement prevents data corruption
- **Compliance:** Tamper-proof audit trail
- **Trust:** Verifiable financial records

---

## 📋 Implementation Tasks

### Task 1: Replace Float Math with NUMERIC ✅

**Goal:** Ensure precise financial calculations at database level

**Changes Needed:**

**1.1 Database Migration**
```sql
-- File: server/migrations/20260514_phase5_numeric_precision.sql

-- Update existing columns to NUMERIC
ALTER TABLE channel_user_payments 
  ALTER COLUMN amount_due TYPE NUMERIC(12,2),
  ALTER COLUMN amount_paid TYPE NUMERIC(12,2),
  ALTER COLUMN realized_amount TYPE NUMERIC(12,2),
  ALTER COLUMN deferred_amount TYPE NUMERIC(12,2);

ALTER TABLE channel_partner_advances
  ALTER COLUMN advance_amount TYPE NUMERIC(12,2);

ALTER TABLE billing_reconciliation_logs
  ALTER COLUMN total_collected TYPE NUMERIC(12,2),
  ALTER COLUMN total_realized TYPE NUMERIC(12,2),
  ALTER COLUMN total_deferred TYPE NUMERIC(12,2),
  ALTER COLUMN gross_commission TYPE NUMERIC(12,2),
  ALTER COLUMN partner_advances TYPE NUMERIC(12,2),
  ALTER COLUMN adjustments TYPE NUMERIC(12,2),
  ALTER COLUMN deductions TYPE NUMERIC(12,2),
  ALTER COLUMN net_commission TYPE NUMERIC(12,2);

ALTER TABLE channel_commission_logs
  ALTER COLUMN total_collection TYPE NUMERIC(12,2),
  ALTER COLUMN gross_commission TYPE NUMERIC(12,2),
  ALTER COLUMN adjustments TYPE NUMERIC(12,2),
  ALTER COLUMN deductions TYPE NUMERIC(12,2),
  ALTER COLUMN net_commission TYPE NUMERIC(12,2),
  ALTER COLUMN previous_balance TYPE NUMERIC(12,2),
  ALTER COLUMN total_payable TYPE NUMERIC(12,2),
  ALTER COLUMN paid_amount TYPE NUMERIC(12,2),
  ALTER COLUMN closing_balance TYPE NUMERIC(12,2);

ALTER TABLE channel_partner_users
  ALTER COLUMN monthly_rate TYPE NUMERIC(12,2);

-- Add check constraints for non-negative amounts
ALTER TABLE channel_user_payments
  ADD CONSTRAINT check_amounts_non_negative 
  CHECK (amount_due >= 0 AND amount_paid >= 0 AND realized_amount >= 0 AND deferred_amount >= 0);

ALTER TABLE channel_partner_advances
  ADD CONSTRAINT check_advance_positive 
  CHECK (advance_amount > 0);

-- Add check constraint for billing status consistency
ALTER TABLE channel_user_payments
  ADD CONSTRAINT check_billing_status_amounts
  CHECK (
    (billing_status = 'realized' AND deferred_amount = 0) OR
    (billing_status = 'deferred' AND realized_amount = 0) OR
    (billing_status = 'partial_deferred' AND realized_amount > 0 AND deferred_amount > 0)
  );
```

**1.2 Update Controller to Use NUMERIC**
- Remove `Math.round()` calls - let PostgreSQL handle precision
- Use `NUMERIC` in all SQL queries
- Ensure proper type casting

---

### Task 2: Enforce Immutable Audit ✅

**Goal:** Prevent modification or deletion of audit records at database level

**2.1 Create Immutable Audit Trigger**
```sql
-- File: server/migrations/20260514_phase5_immutable_audit.sql

-- Function to prevent updates/deletes on audit table
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger on reseller_financial_audit_log_immutable
CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE ON reseller_financial_audit_log_immutable
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
  BEFORE DELETE ON reseller_financial_audit_log_immutable
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Also protect billing_reconciliation_logs after approval
CREATE OR REPLACE FUNCTION prevent_approved_reconciliation_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.reconciliation_status = 'approved' THEN
    RAISE EXCEPTION 'Approved reconciliation records cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_approved_reconciliation_update
  BEFORE UPDATE ON billing_reconciliation_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_reconciliation_modification();

CREATE TRIGGER prevent_approved_reconciliation_delete
  BEFORE DELETE ON billing_reconciliation_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_reconciliation_modification();
```

---

### Task 3: State Machine Enforcement ✅

**Goal:** Enforce valid state transitions at database level

**3.1 Create State Machine Trigger**
```sql
-- File: server/migrations/20260514_phase5_state_machine.sql

-- Function to enforce state transitions
CREATE OR REPLACE FUNCTION enforce_reconciliation_state_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- Valid transitions:
  -- NULL -> pending (initial creation)
  -- pending -> approved
  -- pending -> rejected
  -- rejected -> pending (re-initiation)
  -- approved -> (no transitions allowed)
  
  IF OLD.reconciliation_status IS NULL THEN
    -- Initial creation, allow only 'pending'
    IF NEW.reconciliation_status != 'pending' THEN
      RAISE EXCEPTION 'Initial reconciliation status must be pending';
    END IF;
  ELSIF OLD.reconciliation_status = 'pending' THEN
    -- From pending, can go to approved or rejected
    IF NEW.reconciliation_status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Pending reconciliation can only be approved or rejected';
    END IF;
  ELSIF OLD.reconciliation_status = 'rejected' THEN
    -- From rejected, can only go back to pending
    IF NEW.reconciliation_status != 'pending' THEN
      RAISE EXCEPTION 'Rejected reconciliation can only be re-initiated to pending';
    END IF;
  ELSIF OLD.reconciliation_status = 'approved' THEN
    -- From approved, no transitions allowed
    RAISE EXCEPTION 'Approved reconciliation cannot be changed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_reconciliation_states
  BEFORE UPDATE OF reconciliation_status ON billing_reconciliation_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_reconciliation_state_transitions();

-- Function to auto-update timestamps
CREATE OR REPLACE FUNCTION update_reconciliation_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reconciliation_status = 'approved' AND OLD.reconciliation_status != 'approved' THEN
    NEW.approved_at = CURRENT_TIMESTAMP;
  END IF;
  
  NEW.updated_at = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_reconciliation_timestamps
  BEFORE UPDATE ON billing_reconciliation_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_timestamps();
```

---

### Task 4: Audit Verification Tools ✅

**Goal:** Create tools to verify audit trail integrity

**4.1 Create Verification Functions**
```sql
-- File: server/migrations/20260514_phase5_audit_verification.sql

-- Function to verify reconciliation snapshot matches current data
CREATE OR REPLACE FUNCTION verify_reconciliation_snapshot(reconciliation_id INTEGER)
RETURNS TABLE(
  is_valid BOOLEAN,
  message TEXT,
  snapshot_total_realized NUMERIC,
  current_total_realized NUMERIC,
  snapshot_advances NUMERIC,
  current_advances NUMERIC
) AS $$
DECLARE
  rec RECORD;
  current_realized NUMERIC;
  current_advances NUMERIC;
BEGIN
  -- Get reconciliation record
  SELECT * INTO rec FROM billing_reconciliation_logs WHERE id = reconciliation_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Reconciliation not found', NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;
  
  -- Calculate current totals
  SELECT COALESCE(SUM(realized_amount), 0) INTO current_realized
  FROM channel_user_payments
  WHERE reseller_id = rec.reseller_id 
    AND service_period >= rec.reconciliation_month 
    AND service_period < rec.reconciliation_month + INTERVAL '1 month';
  
  SELECT COALESCE(SUM(advance_amount), 0) INTO current_advances
  FROM channel_partner_advances
  WHERE reseller_id = rec.reseller_id 
    AND advance_month >= rec.reconciliation_month 
    AND advance_month < rec.reconciliation_month + INTERVAL '1 month'
    AND settlement_status IN ('pending_adjustment', 'adjusted');
  
  -- Compare with snapshot
  IF rec.total_realized = current_realized AND rec.partner_advances = current_advances THEN
    RETURN QUERY SELECT TRUE, 'Snapshot matches current data', rec.total_realized, current_realized, rec.partner_advances, current_advances;
  ELSE
    RETURN QUERY SELECT FALSE, 'Snapshot does not match current data', rec.total_realized, current_realized, rec.partner_advances, current_advances;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check audit log completeness
CREATE OR REPLACE FUNCTION check_audit_log_completeness(
  reseller_id_param INTEGER,
  start_date DATE,
  end_date DATE
)
RETURNS TABLE(
  total_events INTEGER,
  missing_sequences INTEGER,
  first_event_id INTEGER,
  last_event_id INTEGER
) AS $$
DECLARE
  expected_count INTEGER;
  actual_count INTEGER;
  first_id INTEGER;
  last_id INTEGER;
BEGIN
  -- Get first and last event IDs
  SELECT MIN(id), MAX(id) INTO first_id, last_id
  FROM reseller_financial_audit_log_immutable
  WHERE reseller_id = reseller_id_param
    AND created_at BETWEEN start_date AND end_date;
  
  IF first_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- Count actual events
  SELECT COUNT(*) INTO actual_count
  FROM reseller_financial_audit_log_immutable
  WHERE reseller_id = reseller_id_param
    AND created_at BETWEEN start_date AND end_date;
  
  -- Expected count (if no gaps)
  expected_count := last_id - first_id + 1;
  
  RETURN QUERY SELECT actual_count, expected_count - actual_count, first_id, last_id;
END;
$$ LANGUAGE plpgsql;
```

**4.2 Create Verification API Endpoint**
```javascript
// File: server/controllers/auditVerificationController.js

const pool = require('../utilities/db');

/**
 * Verify reconciliation snapshot integrity
 */
const verifyReconciliationSnapshot = async (req, res) => {
  try {
    const { reconciliationId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM verify_reconciliation_snapshot($1)',
      [reconciliationId]
    );
    
    const verification = result.rows[0];
    
    res.json({
      success: verification.is_valid,
      message: verification.message,
      details: {
        snapshot_total_realized: verification.snapshot_total_realized,
        current_total_realized: verification.current_total_realized,
        snapshot_advances: verification.snapshot_advances,
        current_advances: verification.current_advances
      }
    });
  } catch (error) {
    console.error('Error verifying reconciliation snapshot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify reconciliation snapshot',
      message: error.message
    });
  }
};

/**
 * Check audit log completeness
 */
const checkAuditLogCompleteness = async (req, res) => {
  try {
    const { resellerId } = req.params;
    const { start_date, end_date } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM check_audit_log_completeness($1, $2, $3)',
      [resellerId, start_date, end_date]
    );
    
    const check = result.rows[0];
    
    res.json({
      success: check.missing_sequences === 0,
      message: check.missing_sequences === 0 
        ? 'Audit log is complete' 
        : `Found ${check.missing_sequences} missing sequences`,
      details: {
        total_events: check.total_events,
        missing_sequences: check.missing_sequences,
        first_event_id: check.first_event_id,
        last_event_id: check.last_event_id
      }
    });
  } catch (error) {
    console.error('Error checking audit log completeness:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check audit log completeness',
      message: error.message
    });
  }
};

module.exports = {
  verifyReconciliationSnapshot,
  checkAuditLogCompleteness
};
```

---

## 📦 Files to Create/Modify

### New Files:
1. `server/migrations/20260514_phase5_numeric_precision.sql`
2. `server/migrations/20260514_phase5_immutable_audit.sql`
3. `server/migrations/20260514_phase5_state_machine.sql`
4. `server/migrations/20260514_phase5_audit_verification.sql`
5. `server/controllers/auditVerificationController.js`
6. `server/routes/auditVerificationRoutes.js`

### Modified Files:
1. `server/controllers/channelPartnerController.js` - Remove Math.round()
2. `server/routes/index.js` - Add audit verification routes

---

## 🧪 Testing Plan

### Database Tests
- [ ] Verify NUMERIC columns store precise values
- [ ] Test check constraints (negative amounts should fail)
- [ ] Test immutable audit trigger (updates/deletes should fail)
- [ ] Test state machine trigger (invalid transitions should fail)
- [ ] Test verification functions

### API Tests
- [ ] Verify reconciliation snapshot
- [ ] Check audit log completeness
- [ ] Test precision in commission calculations

### Integration Tests
- [ ] Try to modify approved reconciliation (should fail)
- [ ] Try to delete audit record (should fail)
- [ ] Try invalid state transition (should fail)

---

## 🚀 Deployment Steps

1. **Backup Database**
2. **Run Migrations** (4 SQL files)
3. **Deploy New Code** (controller, routes)
4. **Restart PM2**
5. **Verify** (run tests)

---

## ⚠️ Risks & Mitigations

### Risk 1: Data Type Conversion
**Impact:** Medium  
**Mitigation:** PostgreSQL handles NUMERIC conversion automatically, test thoroughly

### Risk 2: Trigger Performance
**Impact:** Low  
**Mitigation:** Triggers are simple and fast, minimal performance impact

### Risk 3: Breaking Changes
**Impact:** Low  
**Mitigation:** All changes are additive (constraints, triggers), existing code continues to work

---

## ✅ Success Criteria

Phase 5 complete when:
- [ ] All columns converted to NUMERIC
- [ ] Check constraints added
- [ ] Immutable audit triggers working
- [ ] State machine triggers working
- [ ] Verification functions created
- [ ] Verification API endpoints working
- [ ] All tests passing
- [ ] Deployed to production

---

**Document Version:** 1.0  
**Created:** 2026-05-14  
**Status:** Ready to implement
