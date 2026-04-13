#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(ROOT, 'reports');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    month: '',
    apply: false,
    target: 'tunnel', // tunnel | main | local
  };
  for (const arg of args) {
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--month=')) out.month = String(arg.split('=')[1] || '').slice(0, 7);
    else if (arg.startsWith('--target=')) out.target = String(arg.split('=')[1] || '').trim().toLowerCase();
  }
  if (!/^\d{4}-\d{2}$/.test(out.month)) {
    throw new Error(`Invalid --month value: ${out.month || '(empty)'}`);
  }
  if (!['tunnel', 'main', 'local'].includes(out.target)) {
    throw new Error(`Invalid --target value: ${out.target}`);
  }
  return out;
};

const loadEnv = () => {
  for (const candidate of ['.env.production', '.env.local', '.env']) {
    const envPath = path.join(ROOT, candidate);
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
  }
};

const n = (v, d = 0) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
};

const round2 = (v) => Math.round(n(v, 0) * 100) / 100;

const normalizeBillBwType = (raw) => {
  const val = String(raw || '').toUpperCase().trim();
  const map = {
    IIG: 'IIG',
    IIG_BW: 'IIG',
    BDIX: 'BDIX',
    BDIX_BW: 'BDIX',
    GGC: 'GGC',
    GGC_BW: 'GGC',
    FNA: 'FNA',
    FNA_BW: 'FNA',
    CDN: 'CDN',
    CDN_BW: 'CDN',
    BCDN: 'BCDN',
    BCDN_BW: 'BCDN',
    OTHER: 'BCDN',
    NTTN: 'NTTN',
    NTTN_CAPACITY: 'NTTN',
  };
  return map[val] || '';
};

const BILL_BW_MAP = {
  IIG: { col: 'iig_bw', rate: 'rate_iig' },
  BDIX: { col: 'bdix_bw', rate: 'rate_bdix' },
  GGC: { col: 'ggc_bw', rate: 'rate_ggc' },
  FNA: { col: 'fna_bw', rate: 'rate_fna' },
  CDN: { col: 'cdn_bw', rate: 'rate_cdn' },
  BCDN: { col: 'bcdn_bw', rate: 'rate_bcdn' },
  NTTN: { col: 'nttn_capacity', rate: 'rate_nttn' },
};

const monthStartDateFromYm = (ym) => `${ym}-01`;
const previousMonthYm = (ym) => {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const nextMonthYm = (ym) => {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const parseYMD = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value).trim();
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const monthInfo = (monthStr) => {
  const y = Number(String(monthStr).slice(0, 4));
  const m = Number(String(monthStr).slice(5, 7));
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const daysInMonth = monthEnd.getDate();
  return {
    monthStart,
    monthEnd,
    daysInMonth,
    monthStartStr: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`,
    monthEndStr: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
    ym: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
  };
};

const getTargetDbConfig = (target) => {
  if (target === 'tunnel') {
    return {
      host: process.env.TUNNEL_DB_HOST || '127.0.0.1',
      port: Number(process.env.TUNNEL_DB_PORT || 5433),
      database: process.env.MAIN_DB_NAME || process.env.DB_NAME || 'speednet_office',
      user: process.env.MAIN_DB_USER || process.env.DB_USER || 'postgres',
      password: process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD || '',
      ssl: false,
    };
  }
  if (target === 'main') {
    return {
      host: process.env.MAIN_DB_HOST || process.env.DB_HOST || 'localhost',
      port: Number(process.env.MAIN_DB_PORT || process.env.DB_PORT || 5432),
      database: process.env.MAIN_DB_NAME || process.env.DB_NAME || 'speednet_office',
      user: process.env.MAIN_DB_USER || process.env.DB_USER || 'postgres',
      password: process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD || '',
      ssl: false,
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'speednet_office',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: false,
  };
};

const getCreditsForMonth = async (client, monthYm) => {
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
  return new Map(result.rows.map((row) => [
    Number(row.reseller_id),
    {
      paid: round2(row.paid),
      discount: round2(row.discount),
      credited: round2(n(row.paid, 0) + n(row.discount, 0)),
    },
  ]));
};

const calculateMonthlyBillBreakdown = async (client, reseller, targetMonthStr) => {
  const info = monthInfo(targetMonthStr);
  const created = parseYMD(reseller.joining_date || reseller.created_at);
  if (!created) return { items: [], total: 0 };

  const createdYM = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
  if (info.ym < createdYM) return { items: [], total: 0 };
  const startDayLimit = info.ym === createdYM ? created.getDate() : 1;

  const rateHistoryByType = {};
  try {
    const rateRows = await client.query(
      `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, COALESCE(rate,0)::numeric AS rate, effective_date::date AS effective_date
       FROM reseller_rate_history
       WHERE reseller_id = $1 AND effective_date <= $2::date
       ORDER BY effective_date ASC`,
      [reseller.id, info.monthEndStr]
    );
    for (const row of rateRows.rows) {
      const type = normalizeBillBwType(row.bw_type);
      if (!type) continue;
      if (!rateHistoryByType[type]) rateHistoryByType[type] = [];
      rateHistoryByType[type].push({
        rate: n(row.rate, 0),
        effective_date: String(row.effective_date).slice(0, 10),
      });
    }
  } catch (_) {
    // optional table
  }

  const futureChangesRows = await client.query(
    `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, LOWER(COALESCE(change_type,'')) AS change_type,
            COALESCE(amount,0)::numeric AS amount, implementation_date::date AS implementation_date
     FROM bandwidth_requests
     WHERE reseller_id = $1
       AND COALESCE(admin_status,'pending') = 'approved'
       AND COALESCE(engineer_status,'pending') = 'implemented'
       AND implementation_date > $2::date
     ORDER BY implementation_date DESC`,
    [reseller.id, info.monthEndStr]
  );

  const workingBw = {};
  for (const [type, keys] of Object.entries(BILL_BW_MAP)) {
    workingBw[type] = n(reseller[keys.col], 0);
  }

  for (const row of futureChangesRows.rows) {
    const type = normalizeBillBwType(row.bw_type);
    if (!Object.prototype.hasOwnProperty.call(workingBw, type)) continue;
    const amount = n(row.amount, 0);
    if (row.change_type === 'increase') workingBw[type] -= amount;
    else workingBw[type] += amount;
  }

  const changeRows = await client.query(
    `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, LOWER(COALESCE(change_type,'')) AS change_type,
            COALESCE(amount,0)::numeric AS amount, implementation_date::date AS implementation_date
     FROM bandwidth_requests
     WHERE reseller_id = $1
       AND COALESCE(admin_status,'pending') = 'approved'
       AND COALESCE(engineer_status,'pending') = 'implemented'
       AND implementation_date BETWEEN $2::date AND $3::date
     ORDER BY implementation_date DESC`,
    [reseller.id, info.monthStartStr, info.monthEndStr]
  );

  const changesByType = {};
  for (const row of changeRows.rows) {
    const type = normalizeBillBwType(row.bw_type);
    if (!type) continue;
    if (!changesByType[type]) changesByType[type] = [];
    changesByType[type].push(row);
  }

  const calcSegmentCost = (bwType, baseRate, fromDay, duration, tempBw) => {
    let segmentCost = 0;
    for (let d = 0; d < duration; d += 1) {
      const currentDate = new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), fromDay + d);
      const currentDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      let dailyRate = baseRate;
      const history = rateHistoryByType[bwType] || [];
      for (const rh of history) {
        if (rh.effective_date <= currentDateStr) dailyRate = n(rh.rate, dailyRate);
      }
      segmentCost += (dailyRate / info.daysInMonth) * tempBw;
    }
    return round2(segmentCost);
  };

  const items = [];
  let grandTotal = 0;

  for (const [bwType, keys] of Object.entries(BILL_BW_MAP)) {
    const typeChanges = changesByType[bwType] || [];
    const rate = n(reseller[keys.rate], 0);
    const initialBw = n(workingBw[bwType], 0);
    if (initialBw === 0 && typeChanges.length === 0) continue;

    let cursorDay = info.daysInMonth;
    let tempBw = initialBw;

    for (const change of typeChanges) {
      const changeDate = parseYMD(change.implementation_date);
      if (!changeDate) continue;
      const changeDay = changeDate.getDate();
      const duration = cursorDay - changeDay + 1;

      if (duration > 0 && tempBw > 0) {
        const cost = calcSegmentCost(bwType, rate, changeDay, duration, tempBw);
        grandTotal += cost;
        items.push({
          desc: bwType,
          bw: tempBw,
          rate,
          days: duration,
          total: cost,
          change_type: change.change_type === 'increase' || change.change_type === 'decrease' ? change.change_type : 'standard',
        });
      }

      cursorDay = changeDay - 1;
      const amount = n(change.amount, 0);
      if (change.change_type === 'increase') tempBw -= amount;
      else tempBw += amount;
    }

    if (cursorDay >= startDayLimit && tempBw > 0) {
      const duration = cursorDay - startDayLimit + 1;
      const cost = calcSegmentCost(bwType, rate, startDayLimit, duration, tempBw);
      grandTotal += cost;
      items.push({
        desc: bwType,
        bw: tempBw,
        rate,
        days: duration,
        total: cost,
        change_type: 'standard',
      });
    }
  }

  return { items, total: round2(grandTotal) };
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

const loadAffectedBills = async (client, monthYm) => {
  const result = await client.query(
    `SELECT
       r.id AS run_id,
       r.run_month,
       r.started_at,
       r.status AS run_status,
       i.id AS run_item_id,
       i.reseller_id,
       i.bill_id,
       mb.previous_due,
       mb.amount,
       mb.adjustment,
       mb.created_at AS bill_created_at,
       COALESCE(rs.reseller_name, rs.company_name) AS reseller_name
     FROM billing_finalize_runs r
     JOIN billing_finalize_run_items i ON i.run_id = r.id
     JOIN monthly_bills mb ON mb.id = i.bill_id
     JOIN resellers rs ON rs.id = i.reseller_id
     WHERE r.run_month = $1::date
       AND r.source = 'scheduler'
       AND i.status = 'success'
     ORDER BY i.reseller_id ASC, i.bill_id ASC`,
    [monthStartDateFromYm(monthYm)]
  );
  return result.rows;
};

const buildReport = async (client, monthYm) => {
  const affected = await loadAffectedBills(client, monthYm);
  const prevCredits = await getCreditsForMonth(client, previousMonthYm(monthYm));
  const details = [];

  for (const row of affected) {
    const resellerResult = await client.query(
      `SELECT id,
              created_at,
              COALESCE(joining_date::date, created_at::date) AS joining_date,
              COALESCE(iig_bw,0)::numeric AS iig_bw,
              COALESCE(bdix_bw,0)::numeric AS bdix_bw,
              COALESCE(ggc_bw,0)::numeric AS ggc_bw,
              COALESCE(fna_bw,0)::numeric AS fna_bw,
              COALESCE(cdn_bw,0)::numeric AS cdn_bw,
              COALESCE(bcdn_bw,0)::numeric AS bcdn_bw,
              COALESCE(nttn_capacity,0)::numeric AS nttn_capacity,
              COALESCE(rate_iig,0)::numeric AS rate_iig,
              COALESCE(rate_bdix,0)::numeric AS rate_bdix,
              COALESCE(rate_ggc,0)::numeric AS rate_ggc,
              COALESCE(rate_fna,0)::numeric AS rate_fna,
              COALESCE(rate_cdn,0)::numeric AS rate_cdn,
              COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
              COALESCE(rate_nttn,0)::numeric AS rate_nttn,
              COALESCE(previous_month_due,0)::numeric AS previous_month_due,
              COALESCE(current_projected_bill,0)::numeric AS current_projected_bill
       FROM resellers
       WHERE id = $1`,
      [row.reseller_id]
    );
    const reseller = resellerResult.rows[0];
    const previousBillResult = await client.query(
      `SELECT id, bill_month, COALESCE(previous_due,0)::numeric AS previous_due, COALESCE(amount,0)::numeric AS amount, COALESCE(adjustment,0)::numeric AS adjustment
       FROM monthly_bills
       WHERE reseller_id = $1 AND bill_month < $2::date
       ORDER BY bill_month DESC
       LIMIT 1`,
      [row.reseller_id, monthStartDateFromYm(monthYm)]
    );
    const previousBill = previousBillResult.rows[0] || null;
    const previousMonthCredit = prevCredits.get(Number(row.reseller_id)) || { credited: 0, paid: 0, discount: 0 };
    const restoredPreviousDue = previousBill
      ? round2(n(previousBill.previous_due, 0) + n(previousBill.amount, 0) + n(previousBill.adjustment, 0) - n(previousMonthCredit.credited, 0))
      : 0;
    const correctedBreakdown = await calculateMonthlyBillBreakdown(client, reseller, monthYm);

    details.push({
      reseller_id: Number(row.reseller_id),
      reseller_name: row.reseller_name,
      run_id: Number(row.run_id),
      run_item_id: Number(row.run_item_id),
      bill_id: Number(row.bill_id),
      bill_created_at: row.bill_created_at,
      current_previous_due: round2(reseller.previous_month_due),
      restored_previous_due: restoredPreviousDue,
      current_projected_bill: round2(reseller.current_projected_bill),
      corrected_projected_bill: round2(correctedBreakdown.total),
      previous_bill_id: previousBill ? Number(previousBill.id) : null,
      previous_month_credit: previousMonthCredit,
    });
  }

  return {
    summary: {
      month: monthYm,
      affected_bill_count: details.length,
      affected_reseller_count: new Set(details.map((item) => item.reseller_id)).size,
      run_ids: Array.from(new Set(details.map((item) => item.run_id))).sort((a, b) => a - b),
    },
    rows: details,
  };
};

const applyReconcile = async (client, monthYm, report) => {
  const runId = `premature_auto_finalize_${monthYm}_${Date.now()}`;
  await ensureAuditTable(client);
  await client.query('BEGIN');
  try {
    for (const row of report.rows) {
      const beforeData = {
        bill_id: row.bill_id,
        previous_month_due: row.current_previous_due,
        current_projected_bill: row.current_projected_bill,
      };
      const afterData = {
        previous_month_due: row.restored_previous_due,
        current_projected_bill: row.corrected_projected_bill,
      };

      await client.query(
        `UPDATE resellers
         SET previous_month_due = $1,
             current_projected_bill = $2,
             last_activity_date = NOW()
         WHERE id = $3`,
        [row.restored_previous_due, row.corrected_projected_bill, row.reseller_id]
      );

      await client.query(`DELETE FROM monthly_bills WHERE id = $1`, [row.bill_id]);

      await client.query(
        `UPDATE billing_finalize_run_items
         SET status = 'reverted',
             message = $2
         WHERE id = $1`,
        [row.run_item_id, `Reverted premature auto-finalize for ${monthYm}`]
      );

      await client.query(
        `INSERT INTO billing_reconcile_audit (run_id, month_ym, action_type, reference_table, reference_id, reseller_id, before_data, after_data, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
        [
          runId,
          monthYm,
          'REVERT_PREMATURE_AUTO_FINALIZE_BILL',
          'monthly_bills',
          row.bill_id,
          row.reseller_id,
          JSON.stringify(beforeData),
          JSON.stringify(afterData),
          `Removed premature scheduler-generated final bill for ${monthYm}`,
        ]
      );
    }

    const affectedRunIds = Array.from(new Set(report.rows.map((item) => item.run_id)));
    for (const affectedRunId of affectedRunIds) {
      await client.query(
        `UPDATE billing_finalize_runs
         SET status = 'reverted',
             error_summary = COALESCE(error_summary, '[]')::text
         WHERE id = $1`,
        [affectedRunId]
      );
      await client.query(
        `INSERT INTO billing_reconcile_audit (run_id, month_ym, action_type, reference_table, reference_id, reseller_id, before_data, after_data, note)
         VALUES ($1,$2,$3,$4,$5,NULL,NULL,NULL::jsonb,$6)`,
        [
          runId,
          monthYm,
          'MARK_FINALIZE_RUN_REVERTED',
          'billing_finalize_runs',
          affectedRunId,
          `Marked scheduler run ${affectedRunId} as reverted after premature current-month auto-finalize cleanup`,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      runId,
      affectedRunIds,
      revertedBills: report.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

const writeReport = (monthYm, payload) => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `premature-auto-finalize-${monthYm.replace('-', '')}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return reportPath;
};

const main = async () => {
  loadEnv();
  const args = parseArgs();
  const client = new Client(getTargetDbConfig(args.target));

  await client.connect();
  try {
    const report = await buildReport(client, args.month);
    const reportPath = writeReport(args.month, {
      generated_at: new Date().toISOString(),
      target: args.target,
      ...report,
    });

    console.log(JSON.stringify({
      mode: args.apply ? 'apply' : 'dry-run',
      month: args.month,
      target: args.target,
      report_path: reportPath,
      summary: report.summary,
    }, null, 2));

    if (!args.apply) return;
    const result = await applyReconcile(client, args.month, report);
    console.log(JSON.stringify({ applied: true, ...result }, null, 2));
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
