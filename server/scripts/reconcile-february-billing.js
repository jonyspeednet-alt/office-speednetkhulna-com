#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const defaultMonth = '2026-02';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    month: defaultMonth,
    apply: false,
    target: 'local', // local | main
  };
  for (const arg of args) {
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--month=')) out.month = String(arg.split('=')[1] || '').slice(0, 7);
    else if (arg.startsWith('--target=')) out.target = String(arg.split('=')[1] || '').trim().toLowerCase();
  }
  if (!/^\d{4}-\d{2}$/.test(out.month)) {
    throw new Error(`Invalid --month value: ${out.month}`);
  }
  if (!['local', 'main'].includes(out.target)) {
    throw new Error(`Invalid --target value: ${out.target}`);
  }
  return out;
};

const loadEnv = (appEnv) => {
  const modeEnvPath = path.join(ROOT, appEnv === 'production' ? '.env.production' : '.env.local');
  const fallbackEnvPath = path.join(ROOT, '.env');
  if (fs.existsSync(modeEnvPath)) dotenv.config({ path: modeEnvPath });
  if (fs.existsSync(fallbackEnvPath)) dotenv.config({ path: fallbackEnvPath, override: false });
};

const n = (v, d = 0) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
};

const round2 = (v) => Math.round(n(v, 0) * 100) / 100;

const parseDetails = (raw) => {
  if (raw == null) return { items: [], valid: false, kind: 'null' };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return { items: [], valid: false, kind: 'non_array' };
    const items = parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({ ...x, total: n(x.total, 0) }));
    return { items, valid: true, kind: 'array' };
  } catch (e) {
    return { items: [], valid: false, kind: 'invalid_json', error: e.message };
  }
};

const resolveDbConfig = (target) => {
  const useMain = target === 'main';
  return {
    host: useMain ? (process.env.MAIN_DB_HOST || process.env.DB_HOST || 'localhost') : (process.env.DB_HOST || 'localhost'),
    port: Number(useMain ? (process.env.MAIN_DB_PORT || process.env.DB_PORT || 5432) : (process.env.DB_PORT || 5432)),
    database: useMain ? (process.env.MAIN_DB_NAME || process.env.DB_NAME || 'speednet_office') : (process.env.DB_NAME || 'speednet_office'),
    user: useMain ? (process.env.MAIN_DB_USER || process.env.DB_USER || 'postgres') : (process.env.DB_USER || 'postgres'),
    password: useMain ? (process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD || '') : (process.env.DB_PASSWORD || ''),
    ssl: false
  };
};

const monthBounds = (monthYm) => {
  const [y, m] = monthYm.split('-').map(Number);
  const start = `${monthYm}-01`;
  const d = new Date(y, m, 0);
  const end = `${monthYm}-${String(d.getDate()).padStart(2, '0')}`;
  const next = new Date(y, m, 1);
  const nextYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  return { start, end, nextYm };
};

const getCreditMap = async (client, monthYm) => {
  const result = await client.query(
    `SELECT
       reseller_id,
       COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
         to_jsonb(billing_logs)->>'log_type',
         CASE
           WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
           WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
           ELSE 'adjustment'
         END
       ) = 'payment'),0)::numeric AS paid,
       COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
         to_jsonb(billing_logs)->>'log_type',
         CASE
           WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
           WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
           ELSE 'adjustment'
         END
       ) = 'discount'),0)::numeric AS discount
     FROM billing_logs
     WHERE TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $1
     GROUP BY reseller_id`,
    [monthYm]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(Number(row.reseller_id), {
      paid: round2(row.paid),
      discount: round2(row.discount),
      credited: round2(n(row.paid, 0) + n(row.discount, 0))
    });
  }
  return map;
};

const buildReport = async (client, monthYm) => {
  const { start } = monthBounds(monthYm);
  const activeResellersResult = await client.query(
    `SELECT id, COALESCE(reseller_name, company_name) AS name, COALESCE(previous_month_due,0)::numeric AS previous_month_due, COALESCE(current_projected_bill,0)::numeric AS current_projected_bill
     FROM resellers
     WHERE COALESCE(status,'active')='active'
     ORDER BY id ASC`
  );
  const febBillsResult = await client.query(
    `SELECT id, reseller_id, bill_month, COALESCE(amount,0)::numeric AS amount, COALESCE(adjustment,0)::numeric AS adjustment, COALESCE(previous_due,0)::numeric AS previous_due, bill_details
     FROM monthly_bills
     WHERE bill_month = $1::date
     ORDER BY id ASC`,
    [start]
  );

  const credits = await getCreditMap(client, monthYm);
  const billRows = febBillsResult.rows;
  const byReseller = new Map(billRows.map((b) => [Number(b.reseller_id), b]));

  const billChecks = [];
  for (const b of billRows) {
    const parsed = parseDetails(b.bill_details);
    const detailsTotal = round2(parsed.items.reduce((sum, it) => sum + n(it.total, 0), 0));
    const amount = round2(b.amount);
    const delta = round2(amount - detailsTotal);
    billChecks.push({
      bill_id: Number(b.id),
      reseller_id: Number(b.reseller_id),
      amount,
      adjustment: round2(b.adjustment),
      previous_due: round2(b.previous_due),
      details_count: parsed.items.length,
      details_total: detailsTotal,
      details_state: parsed.kind,
      amount_delta: delta,
      amount_mismatch: Math.abs(delta) > 0.01
    });
  }

  const carryChecks = [];
  for (const r of activeResellersResult.rows) {
    const resellerId = Number(r.id);
    const febBill = byReseller.get(resellerId);
    const credit = credits.get(resellerId) || { paid: 0, discount: 0, credited: 0 };
    if (!febBill) {
      carryChecks.push({
        reseller_id: resellerId,
        reseller_name: r.name,
        has_feb_bill: false,
        expected_due_after_feb: null,
        current_previous_month_due: round2(r.previous_month_due),
        delta: null
      });
      continue;
    }
    const expectedDue = round2(n(febBill.previous_due, 0) + n(febBill.amount, 0) + n(febBill.adjustment, 0) - credit.credited);
    const currentDue = round2(r.previous_month_due);
    carryChecks.push({
      reseller_id: resellerId,
      reseller_name: r.name,
      has_feb_bill: true,
      expected_due_after_feb: expectedDue,
      current_previous_month_due: currentDue,
      delta: round2(currentDue - expectedDue)
    });
  }

  const summary = {
    month: monthYm,
    active_resellers: activeResellersResult.rows.length,
    feb_bills: billRows.length,
    bills_with_snapshot_amount_mismatch: billChecks.filter((x) => x.amount_mismatch).length,
    malformed_or_non_array_bill_details: billChecks.filter((x) => x.details_state !== 'array').length,
    carry_forward_mismatch_count: carryChecks.filter((x) => x.has_feb_bill && Math.abs(n(x.delta, 0)) > 0.01).length,
    active_without_feb_bill: carryChecks.filter((x) => !x.has_feb_bill).length
  };

  return { summary, bill_checks: billChecks, carry_checks: carryChecks };
};

const ensureAuditTable = async (client) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS billing_reconcile_audit (
      id BIGSERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      month_ym TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reference_table TEXT NOT NULL,
      reference_id BIGINT NULL,
      reseller_id INTEGER NULL,
      before_data JSONB NULL,
      after_data JSONB NULL,
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_reconcile_audit_month ON billing_reconcile_audit (month_ym, action_type, created_at DESC)`
  );
};

const runApply = async (client, monthYm) => {
  const { start, nextYm } = monthBounds(monthYm);
  const runId = `reconcile_${monthYm}_${Date.now()}`;
  await ensureAuditTable(client);

  const typeResult = await client.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='monthly_bills' AND column_name='bill_details'
     LIMIT 1`
  );
  const detailsIsJsonType = String(typeResult.rows[0]?.data_type || '').toLowerCase().includes('json');

  const billRows = await client.query(
    `SELECT id, reseller_id, COALESCE(amount,0)::numeric AS amount, COALESCE(adjustment,0)::numeric AS adjustment, COALESCE(previous_due,0)::numeric AS previous_due, bill_details
     FROM monthly_bills
     WHERE bill_month = $1::date
     ORDER BY id ASC`,
    [start]
  );

  const billUpdates = [];
  for (const b of billRows.rows) {
    const parsed = parseDetails(b.bill_details);
    const normalizedItems = parsed.valid ? parsed.items : [];
    const expectedAmount = round2(normalizedItems.reduce((sum, it) => sum + n(it.total, 0), 0));
    const currentAmount = round2(b.amount);
    const needsAmountFix = Math.abs(currentAmount - expectedAmount) > 0.01;
    const needsDetailsFix = !parsed.valid;

    if (!needsAmountFix && !needsDetailsFix) continue;

    const before = {
      amount: currentAmount,
      details_state: parsed.kind,
      details_preview: String(b.bill_details ?? '').slice(0, 120)
    };
    const after = {
      amount: needsAmountFix ? expectedAmount : currentAmount,
      details_state: 'array',
      details_count: normalizedItems.length
    };

    const detailsPayload = JSON.stringify(normalizedItems);
    if (needsAmountFix && needsDetailsFix) {
      await client.query(
        detailsIsJsonType
          ? `UPDATE monthly_bills SET amount = $1, bill_details = $2::jsonb WHERE id = $3`
          : `UPDATE monthly_bills SET amount = $1, bill_details = $2 WHERE id = $3`,
        [after.amount, detailsPayload, b.id]
      );
    } else if (needsAmountFix) {
      await client.query(`UPDATE monthly_bills SET amount = $1 WHERE id = $2`, [after.amount, b.id]);
    } else if (needsDetailsFix) {
      await client.query(
        detailsIsJsonType
          ? `UPDATE monthly_bills SET bill_details = $1::jsonb WHERE id = $2`
          : `UPDATE monthly_bills SET bill_details = $1 WHERE id = $2`,
        [detailsPayload, b.id]
      );
    }

    await client.query(
      `INSERT INTO billing_reconcile_audit (run_id, month_ym, action_type, reference_table, reference_id, reseller_id, before_data, after_data, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
      [
        runId,
        monthYm,
        'BILL_SNAPSHOT_NORMALIZE',
        'monthly_bills',
        b.id,
        b.reseller_id,
        JSON.stringify(before),
        JSON.stringify(after),
        needsAmountFix ? 'Adjusted amount to snapshot total' : 'Normalized malformed bill_details to array'
      ]
    );

    billUpdates.push({ bill_id: Number(b.id), reseller_id: Number(b.reseller_id), needsAmountFix, needsDetailsFix });
  }

  const credits = await getCreditMap(client, monthYm);
  const activeResellers = await client.query(
    `SELECT id, COALESCE(reseller_name, company_name) AS name, COALESCE(previous_month_due,0)::numeric AS previous_month_due
     FROM resellers
     WHERE COALESCE(status,'active')='active'
     ORDER BY id ASC`
  );
  const febBills = await client.query(
    `SELECT id, reseller_id, COALESCE(amount,0)::numeric AS amount, COALESCE(adjustment,0)::numeric AS adjustment, COALESCE(previous_due,0)::numeric AS previous_due
     FROM monthly_bills
     WHERE bill_month = $1::date`,
    [start]
  );
  const febByReseller = new Map(febBills.rows.map((b) => [Number(b.reseller_id), b]));

  const carryForwardUpdates = [];
  for (const r of activeResellers.rows) {
    const resellerId = Number(r.id);
    const febBill = febByReseller.get(resellerId);
    if (!febBill) continue;
    const credit = credits.get(resellerId) || { credited: 0, paid: 0, discount: 0 };
    const expectedDue = round2(n(febBill.previous_due, 0) + n(febBill.amount, 0) + n(febBill.adjustment, 0) - n(credit.credited, 0));
    const currentDue = round2(r.previous_month_due);
    if (Math.abs(currentDue - expectedDue) <= 0.01) continue;

    await client.query(
      `UPDATE resellers
       SET previous_month_due = $1,
           last_activity_date = NOW()
       WHERE id = $2`,
      [expectedDue, resellerId]
    );
    await client.query(
      `INSERT INTO billing_reconcile_audit (run_id, month_ym, action_type, reference_table, reference_id, reseller_id, before_data, after_data, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
      [
        runId,
        monthYm,
        'CARRY_FORWARD_RECOMPUTE',
        'resellers',
        resellerId,
        resellerId,
        JSON.stringify({ previous_month_due: currentDue }),
        JSON.stringify({ previous_month_due: expectedDue, paid: credit.paid, discount: credit.discount }),
        'Updated previous_month_due from February finalized bill'
      ]
    );
    carryForwardUpdates.push({ reseller_id: resellerId, before_due: currentDue, after_due: expectedDue });
  }

  // Next month projected refresh (fallback strategy: latest finalized bill amount + adjustment)
  const projectedRows = await client.query(
    `WITH latest AS (
       SELECT DISTINCT ON (mb.reseller_id)
              mb.reseller_id,
              (COALESCE(mb.amount,0) + COALESCE(mb.adjustment,0))::numeric AS latest_projected
       FROM monthly_bills mb
       WHERE mb.bill_month <= $1::date
       ORDER BY mb.reseller_id, mb.bill_month DESC
     )
     SELECT r.id AS reseller_id,
            COALESCE(r.current_projected_bill,0)::numeric AS current_projected_bill,
            COALESCE(l.latest_projected, COALESCE(r.current_projected_bill,0))::numeric AS refreshed_projected
     FROM resellers r
     LEFT JOIN latest l ON l.reseller_id = r.id
     WHERE COALESCE(r.status,'active')='active'`,
    [start]
  );

  const projectedUpdates = [];
  for (const row of projectedRows.rows) {
    const currentProjected = round2(row.current_projected_bill);
    const refreshedProjected = round2(row.refreshed_projected);
    if (Math.abs(currentProjected - refreshedProjected) <= 0.01) continue;
    await client.query(
      `UPDATE resellers
       SET current_projected_bill = $1,
           last_activity_date = NOW()
       WHERE id = $2`,
      [refreshedProjected, row.reseller_id]
    );
    await client.query(
      `INSERT INTO billing_reconcile_audit (run_id, month_ym, action_type, reference_table, reference_id, reseller_id, before_data, after_data, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
      [
        runId,
        nextYm,
        'NEXT_MONTH_PROJECTED_REFRESH',
        'resellers',
        row.reseller_id,
        row.reseller_id,
        JSON.stringify({ current_projected_bill: currentProjected }),
        JSON.stringify({ current_projected_bill: refreshedProjected }),
        `Refreshed projected bill from latest finalized amount (<= ${monthYm})`
      ]
    );
    projectedUpdates.push({
      reseller_id: Number(row.reseller_id),
      before_projected: currentProjected,
      after_projected: refreshedProjected
    });
  }

  return {
    run_id: runId,
    bill_updates: billUpdates,
    carry_forward_updates: carryForwardUpdates,
    projected_updates: projectedUpdates
  };
};

const saveReport = (name, payload) => {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, name);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  return outPath;
};

const main = async () => {
  const args = parseArgs();
  const appEnv = args.target === 'main' ? 'production' : 'local';
  loadEnv(appEnv);
  const cfg = resolveDbConfig(args.target);
  const client = new Client(cfg);
  await client.connect();
  const targetDb = (await client.query('SELECT current_database() AS db')).rows[0]?.db;
  console.log(`[Reconcile] Connected DB: ${targetDb} (${args.target}) month=${args.month} apply=${args.apply}`);

  const pre = await buildReport(client, args.month);
  const prePath = saveReport(`billing_reconcile_${args.month}_pre_${args.target}.json`, {
    target_db: targetDb,
    generated_at: new Date().toISOString(),
    ...pre
  });

  let applyResult = null;
  if (args.apply) {
    await client.query('BEGIN');
    try {
      applyResult = await runApply(client, args.month);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  const post = await buildReport(client, args.month);
  const postPath = saveReport(`billing_reconcile_${args.month}_post_${args.target}.json`, {
    target_db: targetDb,
    generated_at: new Date().toISOString(),
    apply_result: applyResult,
    ...post
  });

  await client.end();

  console.log('[Reconcile] Pre report:', prePath);
  console.log('[Reconcile] Post report:', postPath);
  console.log('[Reconcile] PRE summary:', pre.summary);
  console.log('[Reconcile] POST summary:', post.summary);
  if (!args.apply) {
    console.log('[Reconcile] Dry-run complete. Re-run with --apply to write changes.');
  } else {
    console.log('[Reconcile] Apply complete.');
  }
};

main().catch((error) => {
  console.error('[Reconcile] Failed:', error.message);
  process.exit(1);
});
