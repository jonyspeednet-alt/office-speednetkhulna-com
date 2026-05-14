# Phase 4: Reconciliation Workflow - Implementation Plan

**Phase:** 4 of 5  
**Status:** 📋 PLANNING  
**Estimated Duration:** 2-3 days  
**Dependencies:** ✅ Phase 1, 2, 3 complete

---

## 🎯 Goals

### Primary Goal
Implement a month-end reconciliation workflow that:
1. Automatically calculates final commission for a month
2. Requires approval before payment
3. Generates reconciliation reports (PDF)
4. Maintains audit trail of all reconciliations
5. Prevents changes after reconciliation is approved

### Business Value
- **Accuracy:** Ensures all calculations are reviewed before payment
- **Audit Trail:** Complete history of all reconciliations
- **Automation:** Reduces manual work with auto-reconciliation
- **Transparency:** Clear reports for both company and partners

---

## 📋 Requirements

### Functional Requirements

#### 1. Reconciliation Initiation
- **Manual:** Admin can initiate reconciliation for any month
- **Automatic:** Cron job runs on 5th of each month for previous month
- **Validation:** Cannot reconcile if:
  - Month is in the future
  - Month already has approved reconciliation
  - Required data is missing

#### 2. Reconciliation Calculation
Calculate and lock:
- Total collected (realized amount)
- Total deferred amount
- Gross commission
- Partner advances
- Adjustments (if any)
- Deductions (if any)
- Net commission (final payable)

#### 3. Approval Workflow
- **States:** `pending` → `approved` / `rejected`
- **Approver:** Admin or authorized user
- **Actions:**
  - Approve: Locks the reconciliation, marks as final
  - Reject: Returns to pending, allows recalculation
  - Comment: Add notes during approval/rejection

#### 4. Report Generation
- **Format:** PDF
- **Content:**
  - Partner details
  - Month/period
  - Summary (collected, commission, advances, net)
  - Detailed breakdown (user-wise payments)
  - Advance details
  - Approval status and timestamp
- **Language:** Bengali (বাংলা) for partner-facing reports

#### 5. Data Locking
After approval:
- Cannot modify user payments for that month
- Cannot add/remove advances for that month
- Cannot regenerate commission for that month
- Can only view historical data

#### 6. Notifications
- Email to admin when reconciliation is pending
- Email to partner when reconciliation is approved
- Email to admin if reconciliation fails

---

## 🗄️ Database Schema

### Existing Table: `billing_reconciliation_logs`
Already created in Phase 1. Structure:
```sql
CREATE TABLE billing_reconciliation_logs (
  id SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES channel_partners(id),
  reconciliation_month DATE NOT NULL,
  
  -- Amounts
  total_collected NUMERIC(12,2) NOT NULL,
  total_realized NUMERIC(12,2) NOT NULL,
  total_deferred NUMERIC(12,2) NOT NULL,
  gross_commission NUMERIC(12,2) NOT NULL,
  partner_advances NUMERIC(12,2) DEFAULT 0,
  adjustments NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  net_commission NUMERIC(12,2) NOT NULL,
  
  -- Workflow
  reconciliation_status VARCHAR(50) DEFAULT 'pending',
  initiated_by INTEGER REFERENCES users(id),
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- Audit
  snapshot_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Status Values:**
- `pending` - Awaiting approval
- `approved` - Approved and locked
- `rejected` - Rejected, needs recalculation
- `cancelled` - Cancelled by admin

---

## 🔧 Implementation Tasks

### Task 1: Reconciliation Initiation API
**File:** `server/controllers/channelPartnerController.js`

**New Function:** `initiateReconciliation()`

**Logic:**
```javascript
async function initiateReconciliation(req, res) {
  const { resellerId } = req.params;
  const { month } = req.body; // YYYY-MM format
  const userId = req.user.id;
  
  // 1. Validate month
  if (isInFuture(month)) {
    return res.status(400).json({ error: 'Cannot reconcile future month' });
  }
  
  // 2. Check if already reconciled
  const existing = await checkExistingReconciliation(resellerId, month);
  if (existing && existing.status === 'approved') {
    return res.status(400).json({ error: 'Month already reconciled' });
  }
  
  // 3. Get commission summary
  const summary = await getCommissionSummary(resellerId, month);
  
  // 4. Get partner advances
  const advances = await getPartnerAdvancesForMonth(resellerId, month);
  
  // 5. Calculate net commission
  const netCommission = summary.gross_commission - advances;
  
  // 6. Create snapshot of all data
  const snapshot = {
    payments: await getUserPayments(resellerId, month),
    advances: await getAdvanceHistory(resellerId, month),
    summary: summary
  };
  
  // 7. Insert reconciliation record
  const reconciliation = await db.query(`
    INSERT INTO billing_reconciliation_logs (
      reseller_id, reconciliation_month,
      total_collected, total_realized, total_deferred,
      gross_commission, partner_advances, net_commission,
      reconciliation_status, initiated_by, snapshot_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
    RETURNING *
  `, [
    resellerId, month,
    summary.total_collected, summary.total_realized, summary.total_deferred,
    summary.gross_commission, advances, netCommission,
    userId, JSON.stringify(snapshot)
  ]);
  
  // 8. Send notification
  await sendReconciliationNotification(resellerId, reconciliation.id);
  
  return res.json({
    success: true,
    reconciliation: reconciliation.rows[0]
  });
}
```

**Endpoint:**
```
POST /api/channel-partners/:resellerId/reconciliation/initiate
Body: { month: "2026-05" }
```

---

### Task 2: Approval/Rejection API
**File:** `server/controllers/channelPartnerController.js`

**New Functions:** `approveReconciliation()`, `rejectReconciliation()`

**Logic:**
```javascript
async function approveReconciliation(req, res) {
  const { resellerId, reconciliationId } = req.params;
  const { notes } = req.body;
  const userId = req.user.id;
  
  // 1. Get reconciliation
  const reconciliation = await getReconciliation(reconciliationId);
  
  // 2. Validate status
  if (reconciliation.reconciliation_status !== 'pending') {
    return res.status(400).json({ error: 'Can only approve pending reconciliation' });
  }
  
  // 3. Update status
  await db.query(`
    UPDATE billing_reconciliation_logs
    SET reconciliation_status = 'approved',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [userId, reconciliationId]);
  
  // 4. Lock the month (update state machine)
  await db.query(`
    INSERT INTO channel_settlement_state_machine (
      reseller_id, settlement_month, current_state, locked_at
    ) VALUES ($1, $2, 'approved', CURRENT_TIMESTAMP)
    ON CONFLICT (reseller_id, settlement_month) 
    DO UPDATE SET current_state = 'approved', locked_at = CURRENT_TIMESTAMP
  `, [resellerId, reconciliation.reconciliation_month]);
  
  // 5. Generate PDF report
  const pdfPath = await generateReconciliationReport(reconciliation);
  
  // 6. Send notification
  await sendApprovalNotification(resellerId, reconciliationId, pdfPath);
  
  // 7. Log audit
  await auditLogger.logFinancialEvent({
    event_type: 'reconciliation_approved',
    reseller_id: resellerId,
    reconciliation_id: reconciliationId,
    user_id: userId,
    notes: notes
  });
  
  return res.json({
    success: true,
    message: 'Reconciliation approved',
    pdf_url: pdfPath
  });
}

async function rejectReconciliation(req, res) {
  const { resellerId, reconciliationId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  
  // 1. Validate
  const reconciliation = await getReconciliation(reconciliationId);
  if (reconciliation.reconciliation_status !== 'pending') {
    return res.status(400).json({ error: 'Can only reject pending reconciliation' });
  }
  
  // 2. Update status
  await db.query(`
    UPDATE billing_reconciliation_logs
    SET reconciliation_status = 'rejected',
        rejection_reason = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [reason, reconciliationId]);
  
  // 3. Log audit
  await auditLogger.logFinancialEvent({
    event_type: 'reconciliation_rejected',
    reseller_id: resellerId,
    reconciliation_id: reconciliationId,
    user_id: userId,
    reason: reason
  });
  
  return res.json({
    success: true,
    message: 'Reconciliation rejected'
  });
}
```

**Endpoints:**
```
POST /api/channel-partners/:resellerId/reconciliation/:reconciliationId/approve
Body: { notes: "Approved for payment" }

POST /api/channel-partners/:resellerId/reconciliation/:reconciliationId/reject
Body: { reason: "Incorrect advance amount" }
```

---

### Task 3: Reconciliation List & Details API
**File:** `server/controllers/channelPartnerController.js`

**New Functions:** `getReconciliations()`, `getReconciliationDetails()`

**Logic:**
```javascript
async function getReconciliations(req, res) {
  const { resellerId } = req.params;
  const { status, limit = 10 } = req.query;
  
  let query = `
    SELECT 
      brl.*,
      u1.name AS initiated_by_name,
      u2.name AS approved_by_name
    FROM billing_reconciliation_logs brl
    LEFT JOIN users u1 ON u1.id = brl.initiated_by
    LEFT JOIN users u2 ON u2.id = brl.approved_by
    WHERE brl.reseller_id = $1
  `;
  
  const params = [resellerId];
  
  if (status) {
    query += ` AND brl.reconciliation_status = $2`;
    params.push(status);
  }
  
  query += ` ORDER BY brl.reconciliation_month DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  const result = await db.query(query, params);
  
  return res.json({
    success: true,
    data: result.rows
  });
}

async function getReconciliationDetails(req, res) {
  const { reconciliationId } = req.params;
  
  const result = await db.query(`
    SELECT 
      brl.*,
      cp.name AS partner_name,
      cp.profit_share_pct,
      u1.name AS initiated_by_name,
      u2.name AS approved_by_name
    FROM billing_reconciliation_logs brl
    JOIN channel_partners cp ON cp.id = brl.reseller_id
    LEFT JOIN users u1 ON u1.id = brl.initiated_by
    LEFT JOIN users u2 ON u2.id = brl.approved_by
    WHERE brl.id = $1
  `, [reconciliationId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reconciliation not found' });
  }
  
  return res.json({
    success: true,
    data: result.rows[0]
  });
}
```

**Endpoints:**
```
GET /api/channel-partners/:resellerId/reconciliation/list?status=pending&limit=10
GET /api/channel-partners/:resellerId/reconciliation/:reconciliationId
```

---

### Task 4: PDF Report Generation
**File:** `server/utilities/reportGenerator.js` (NEW)

**Dependencies:**
```bash
npm install pdfkit
```

**Function:** `generateReconciliationReport()`

**Logic:**
```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function generateReconciliationReport(reconciliation) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const fileName = `reconciliation_${reconciliation.reseller_id}_${reconciliation.reconciliation_month}.pdf`;
  const filePath = path.join(__dirname, '../reports', fileName);
  
  // Ensure reports directory exists
  if (!fs.existsSync(path.join(__dirname, '../reports'))) {
    fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
  }
  
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  
  // Header
  doc.fontSize(20).text('মাসিক নিষ্পত্তি রিপোর্ট', { align: 'center' });
  doc.fontSize(16).text('Monthly Settlement Report', { align: 'center' });
  doc.moveDown();
  
  // Partner Info
  doc.fontSize(12).text(`Partner: ${reconciliation.partner_name}`);
  doc.text(`Month: ${reconciliation.reconciliation_month}`);
  doc.text(`Status: ${reconciliation.reconciliation_status}`);
  doc.moveDown();
  
  // Summary Table
  doc.fontSize(14).text('Summary / সারাংশ', { underline: true });
  doc.moveDown(0.5);
  
  doc.fontSize(10);
  doc.text(`Total Collected / মোট সংগৃহীত: ${reconciliation.total_collected} BDT`);
  doc.text(`Total Realized / প্রকৃত প্রাপ্ত: ${reconciliation.total_realized} BDT`);
  doc.text(`Total Deferred / বকেয়া: ${reconciliation.total_deferred} BDT`);
  doc.moveDown(0.5);
  
  doc.text(`Gross Commission / মোট কমিশন: ${reconciliation.gross_commission} BDT`);
  doc.text(`Partner Advances / অগ্রিম পেমেন্ট: ${reconciliation.partner_advances} BDT`);
  doc.text(`Adjustments / সমন্বয়: ${reconciliation.adjustments} BDT`);
  doc.text(`Deductions / কর্তন: ${reconciliation.deductions} BDT`);
  doc.moveDown(0.5);
  
  doc.fontSize(12).fillColor('blue');
  doc.text(`Net Commission / নিট কমিশন: ${reconciliation.net_commission} BDT`, { bold: true });
  doc.fillColor('black');
  doc.moveDown();
  
  // Approval Info
  if (reconciliation.approved_at) {
    doc.fontSize(10);
    doc.text(`Approved By: ${reconciliation.approved_by_name}`);
    doc.text(`Approved At: ${new Date(reconciliation.approved_at).toLocaleString()}`);
  }
  
  // Footer
  doc.fontSize(8).text('Generated by Speed Net Office System', 50, doc.page.height - 50, { align: 'center' });
  
  doc.end();
  
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(`/reports/${fileName}`));
    stream.on('error', reject);
  });
}

module.exports = { generateReconciliationReport };
```

---

### Task 5: Cron Job for Auto-Reconciliation
**File:** `server/cron/reconciliationCron.js` (NEW)

**Dependencies:**
```bash
npm install node-cron
```

**Logic:**
```javascript
const cron = require('node-cron');
const db = require('../config/database');
const { initiateReconciliation } = require('../controllers/channelPartnerController');

// Run on 5th of every month at 9:00 AM
cron.schedule('0 9 5 * *', async () => {
  console.log('Running auto-reconciliation for previous month...');
  
  try {
    // Get previous month
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = previousMonth.toISOString().slice(0, 7); // YYYY-MM
    
    // Get all active resellers
    const resellers = await db.query(`
      SELECT id FROM channel_partners WHERE status = 'active'
    `);
    
    // Initiate reconciliation for each reseller
    for (const reseller of resellers.rows) {
      try {
        // Check if already reconciled
        const existing = await db.query(`
          SELECT id FROM billing_reconciliation_logs
          WHERE reseller_id = $1 AND reconciliation_month = $2
        `, [reseller.id, monthStr]);
        
        if (existing.rows.length === 0) {
          // Initiate reconciliation
          await initiateReconciliation({
            params: { resellerId: reseller.id },
            body: { month: monthStr },
            user: { id: 1 } // System user
          }, {
            json: (data) => console.log(`Reconciliation initiated for reseller ${reseller.id}:`, data)
          });
        }
      } catch (error) {
        console.error(`Error reconciling reseller ${reseller.id}:`, error);
      }
    }
    
    console.log('Auto-reconciliation completed');
  } catch (error) {
    console.error('Auto-reconciliation failed:', error);
  }
});

module.exports = cron;
```

**Integration:** Add to `server/index.js`:
```javascript
// Start cron jobs
require('./cron/reconciliationCron');
```

---

### Task 6: Data Locking Middleware
**File:** `server/middleware/reconciliationLock.js` (NEW)

**Logic:**
```javascript
const db = require('../config/database');

async function checkReconciliationLock(req, res, next) {
  const { resellerId } = req.params;
  const { month } = req.body || req.query;
  
  if (!month) {
    return next(); // No month specified, skip check
  }
  
  try {
    // Check if month is locked
    const result = await db.query(`
      SELECT id, reconciliation_status
      FROM billing_reconciliation_logs
      WHERE reseller_id = $1 
        AND reconciliation_month = $2
        AND reconciliation_status = 'approved'
    `, [resellerId, month]);
    
    if (result.rows.length > 0) {
      return res.status(403).json({
        error: 'Month is locked',
        message: 'Cannot modify data for approved reconciliation',
        reconciliation_id: result.rows[0].id
      });
    }
    
    next();
  } catch (error) {
    console.error('Error checking reconciliation lock:', error);
    next(error);
  }
}

module.exports = { checkReconciliationLock };
```

**Usage:** Add to routes that modify data:
```javascript
const { checkReconciliationLock } = require('../middleware/reconciliationLock');

router.post('/:resellerId/payments/record', checkReconciliationLock, recordUserPayment);
router.post('/:resellerId/advances', checkReconciliationLock, recordAdvance);
```

---

## 🔌 API Endpoints Summary

### New Endpoints (Phase 4)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/channel-partners/:resellerId/reconciliation/initiate` | Start reconciliation |
| GET | `/api/channel-partners/:resellerId/reconciliation/list` | List reconciliations |
| GET | `/api/channel-partners/:resellerId/reconciliation/:reconciliationId` | Get details |
| POST | `/api/channel-partners/:resellerId/reconciliation/:reconciliationId/approve` | Approve |
| POST | `/api/channel-partners/:resellerId/reconciliation/:reconciliationId/reject` | Reject |
| GET | `/api/channel-partners/:resellerId/reconciliation/:reconciliationId/report` | Download PDF |

---

## 🧪 Testing Plan

### Unit Tests
- [ ] `initiateReconciliation()` - Creates reconciliation record
- [ ] `approveReconciliation()` - Updates status and locks month
- [ ] `rejectReconciliation()` - Updates status with reason
- [ ] `generateReconciliationReport()` - Creates PDF file
- [ ] `checkReconciliationLock()` - Blocks modifications

### Integration Tests
- [ ] Initiate → Approve → Verify locked
- [ ] Initiate → Reject → Initiate again
- [ ] Try to modify locked month → Should fail
- [ ] Auto-reconciliation cron job
- [ ] PDF generation with Bengali text

### Manual Tests
- [ ] Create reconciliation for May 2026
- [ ] Approve reconciliation
- [ ] Try to add payment for May → Should fail
- [ ] Download PDF report
- [ ] Check email notifications

---

## 📦 Deployment Plan

### Step 1: Install Dependencies
```bash
npm install pdfkit node-cron
```

### Step 2: Create New Files
- `server/utilities/reportGenerator.js`
- `server/cron/reconciliationCron.js`
- `server/middleware/reconciliationLock.js`

### Step 3: Update Existing Files
- `server/controllers/channelPartnerController.js` - Add 5 new functions
- `server/routes/channelPartnerRoutes.js` - Add 6 new endpoints
- `server/index.js` - Start cron job

### Step 4: Deploy to Production
```bash
# Upload files
scp -P 21098 server/controllers/channelPartnerController.js speeuvmq@199.188.200.186:/home/speeuvmq/office_app/server/controllers/
scp -P 21098 server/routes/channelPartnerRoutes.js speeuvmq@199.188.200.186:/home/speeuvmq/office_app/server/routes/
scp -P 21098 server/utilities/reportGenerator.js speeuvmq@199.188.200.186:/home/speeuvmq/office_app/server/utilities/
scp -P 21098 server/cron/reconciliationCron.js speeuvmq@199.188.200.186:/home/speeuvmq/office_app/server/cron/
scp -P 21098 server/middleware/reconciliationLock.js speeuvmq@199.188.200.186:/home/speeuvmq/office_app/server/middleware/

# Install dependencies
ssh -p 21098 speeuvmq@199.188.200.186 "cd /home/speeuvmq/office_app && npm install pdfkit node-cron"

# Restart PM2
ssh -p 21098 speeuvmq@199.188.200.186 "cd /home/speeuvmq/office_app && pm2 reload ecosystem.config.js"
```

---

## ⚠️ Risks & Mitigations

### Risk 1: PDF Generation Fails
**Impact:** Medium  
**Mitigation:** 
- Fallback to JSON report if PDF fails
- Log errors and notify admin
- Test PDF generation thoroughly

### Risk 2: Cron Job Fails
**Impact:** Low  
**Mitigation:**
- Manual reconciliation still available
- Cron job logs errors
- Email notification on failure

### Risk 3: Data Lock Too Restrictive
**Impact:** Medium  
**Mitigation:**
- Admin override capability
- Clear error messages
- Ability to "unlock" month if needed

---

## 📊 Success Criteria

Phase 4 is complete when:
- [ ] All 6 API endpoints working
- [ ] PDF report generation working
- [ ] Cron job running and initiating reconciliations
- [ ] Data locking prevents modifications
- [ ] Email notifications sent
- [ ] All tests passing
- [ ] Deployed to production
- [ ] Documentation complete

---

## 📅 Timeline

**Day 1:**
- Implement reconciliation initiation API
- Implement approval/rejection API
- Implement list/details API

**Day 2:**
- Implement PDF report generation
- Implement cron job
- Implement data locking middleware

**Day 3:**
- Testing (unit, integration, manual)
- Bug fixes
- Deployment to production

---

## 📚 Documentation

**To Create:**
- [ ] `PHASE_4_IMPLEMENTATION_SUMMARY.md` - After completion
- [ ] API documentation for new endpoints
- [ ] User guide for reconciliation workflow

---

**Document Version:** 1.0  
**Created:** 2026-05-13  
**Status:** Ready to implement
