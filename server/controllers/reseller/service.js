const pool = require("../../utilities/db");
const {
  parseAmount,
  parseWholeNumber,
  monthInfo,
  getDhakaMonthYm,
  normalizeBillBwType,
  BILL_BW_MAP,
  fmtDayMon,
  parseYMD,
  toDateOnlyString,
  getOtcAppliedMonthYm,
} = require("./utils");
const { joiningDateExpr, hasResellerOtcAppliedMonthColumn } = require("./dbSetup");

const getResellerRecurringMonthlyTotal = (reseller = {}) => {
  const bandwidthTotal =
    parseAmount(reseller.iig_bw, 0) * parseAmount(reseller.rate_iig, 0) +
    parseAmount(reseller.bdix_bw, 0) * parseAmount(reseller.rate_bdix, 0) +
    parseAmount(reseller.ggc_bw, 0) * parseAmount(reseller.rate_ggc, 0) +
    parseAmount(reseller.fna_bw, 0) * parseAmount(reseller.rate_fna, 0) +
    parseAmount(reseller.cdn_bw, 0) * parseAmount(reseller.rate_cdn, 0) +
    parseAmount(reseller.bcdn_bw, 0) * parseAmount(reseller.rate_bcdn, 0) +
    parseAmount(reseller.nttn_capacity, 0) * parseAmount(reseller.rate_nttn, 0);

  const realIpTotal =
    Math.max(0, parseWholeNumber(reseller.real_ip_count, 0)) *
    parseAmount(reseller.real_ip_price, 0);

  return bandwidthTotal + realIpTotal;
};

const calculateResellerMonthProjectedTotal = (reseller = {}, targetMonthStr = getDhakaMonthYm()) => {
  const info = monthInfo(targetMonthStr);
  const created = parseYMD(reseller.joining_date || reseller.created_at);
  if (!created) return 0;

  const createdYM = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
  if (info.ym < createdYM) return 0;

  const recurringTotal = getResellerRecurringMonthlyTotal(reseller);
  const activeDays =
    info.ym === createdYM
      ? Math.max(0, info.daysInMonth - created.getDate() + 1)
      : info.daysInMonth;
  const proratedRecurring =
    info.daysInMonth > 0 ? (recurringTotal / info.daysInMonth) * activeDays : 0;
  const otcCharge =
    info.ym === getOtcAppliedMonthYm(reseller)
      ? parseAmount(reseller.otc_charge, 0)
      : 0;
  return Math.round((proratedRecurring + otcCharge) * 100) / 100;
};

const shouldPauseProjectedBilling = (reseller, targetMonthYm) => {
  const status = String(reseller?.status || "active").toLowerCase();
  if (status === "active") return false;
  return targetMonthYm >= getDhakaMonthYm();
};

const calculateMonthlyBillBreakdown = async (resellerId, targetMonthStr, resellerRow = null) => {
  const info = monthInfo(targetMonthStr);
  const reseller =
    resellerRow ||
    (
      await pool.query(
        `SELECT id,
              ${joiningDateExpr()} AS joining_date,
              COALESCE(status, 'active') AS status,
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
              COALESCE(otc_charge,0)::numeric AS otc_charge,
              ${hasResellerOtcAppliedMonthColumn() ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
              COALESCE(real_ip_count,0)::int AS real_ip_count,
              COALESCE(real_ip_price,0)::numeric AS real_ip_price
       FROM resellers WHERE id = $1`,
        [resellerId],
      )
    ).rows?.[0];

  if (!reseller) return { items: [], total: 0 };
  if (shouldPauseProjectedBilling(reseller, info.ym)) return { items: [], total: 0 };

  const created = parseYMD(reseller.joining_date || reseller.created_at);
  if (!created) return { items: [], total: 0 };

  const createdYM = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
  if (info.ym < createdYM) return { items: [], total: 0 };
  const startDayLimit = info.ym === createdYM ? created.getDate() : 1;

  const rateHistoryByType = {};
  try {
    const rateRows = await pool.query(
      `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, COALESCE(rate,0)::numeric AS rate, effective_date::date AS effective_date
       FROM reseller_rate_history
       WHERE reseller_id = $1 AND effective_date <= $2::date
       ORDER BY effective_date ASC`,
      [resellerId, info.monthEndStr],
    );
    for (const r of rateRows.rows) {
      const type = normalizeBillBwType(r.bw_type);
      if (!type) continue;
      if (!rateHistoryByType[type]) rateHistoryByType[type] = [];
      rateHistoryByType[type].push({
        rate: Number(r.rate || 0),
        effective_date: toDateOnlyString(r.effective_date),
      });
    }
  } catch (e) {
    // Optional table
  }

  const rateChangeLogMap = {}; // bwType -> { dateStr -> prevRate }
  try {
    const changeLogResult = await pool.query(
      `SELECT effective_date::date AS effective_date,
              prev_rate_iig, prev_rate_bdix, prev_rate_ggc, prev_rate_fna,
              prev_rate_cdn, prev_rate_bcdn, prev_rate_nttn,
              rate_iig, rate_bdix, rate_ggc, rate_fna,
              rate_cdn, rate_bcdn, rate_nttn
       FROM reseller_rate_change_logs
       WHERE reseller_id = $1
       ORDER BY effective_date ASC`,
      [resellerId],
    );
    for (const row of changeLogResult.rows) {
      const dateStr = toDateOnlyString(row.effective_date);
      if (!dateStr) continue;
      const rateColMap = {
        IIG: ['prev_rate_iig', 'rate_iig'],
        BDIX: ['prev_rate_bdix', 'rate_bdix'],
        GGC: ['prev_rate_ggc', 'rate_ggc'],
        FNA: ['prev_rate_fna', 'rate_fna'],
        CDN: ['prev_rate_cdn', 'rate_cdn'],
        BCDN: ['prev_rate_bcdn', 'rate_bcdn'],
        NTTN: ['prev_rate_nttn', 'rate_nttn'],
      };
      for (const [bwType, [prevCol, nextCol]] of Object.entries(rateColMap)) {
        if (row[prevCol] != null) {
          if (!rateChangeLogMap[bwType]) rateChangeLogMap[bwType] = {};
          if (!rateChangeLogMap[bwType][dateStr]) {
            rateChangeLogMap[bwType][dateStr] = Number(row[prevCol]);
          }
        }
        const nextRate = parseAmount(row[nextCol], NaN);
        const prevRate = parseAmount(row[prevCol], NaN);
        if (Number.isFinite(nextRate) && Number.isFinite(prevRate) && nextRate !== prevRate && dateStr <= info.monthEndStr) {
          if (!rateHistoryByType[bwType]) rateHistoryByType[bwType] = [];
          const hasExistingHistory = rateHistoryByType[bwType].some((entry) => entry.effective_date === dateStr);
          if (!hasExistingHistory) {
            rateHistoryByType[bwType].push({ rate: nextRate, effective_date: dateStr });
          }
        }
      }
    }
  } catch (e) {
    // Optional table
  }

  const futureChangesRows = await pool.query(
    `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, LOWER(COALESCE(change_type,'')) AS change_type,
            COALESCE(amount,0)::numeric AS amount, implementation_date::date AS implementation_date
     FROM bandwidth_requests
     WHERE reseller_id = $1
       AND COALESCE(admin_status,'pending') = 'approved'
       AND COALESCE(engineer_status,'pending') = 'implemented'
       AND implementation_date > $2::date
     ORDER BY implementation_date DESC`,
    [resellerId, info.monthEndStr],
  );

  const workingBw = {};
  for (const [type, keys] of Object.entries(BILL_BW_MAP)) {
    workingBw[type] = parseAmount(reseller[keys.col], 0);
  }

  for (const fc of futureChangesRows.rows) {
    const t = normalizeBillBwType(fc.bw_type);
    if (!Object.prototype.hasOwnProperty.call(workingBw, t)) continue;
    const amt = parseAmount(fc.amount, 0);
    if (fc.change_type === "increase") workingBw[t] -= amt;
    else workingBw[t] += amt;
  }

  const changeRows = await pool.query(
    `SELECT UPPER(COALESCE(bw_type,'')) AS bw_type, LOWER(COALESCE(change_type,'')) AS change_type,
            COALESCE(amount,0)::numeric AS amount, implementation_date::date AS implementation_date
     FROM bandwidth_requests
     WHERE reseller_id = $1
       AND COALESCE(admin_status,'pending') = 'approved'
       AND COALESCE(engineer_status,'pending') = 'implemented'
       AND implementation_date BETWEEN $2::date AND $3::date
     ORDER BY implementation_date DESC`,
    [resellerId, info.monthStartStr, info.monthEndStr],
  );

  const changesByType = {};
  for (const c of changeRows.rows) {
    const t = normalizeBillBwType(c.bw_type);
    if (!t) continue;
    if (!changesByType[t]) changesByType[t] = [];
    changesByType[t].push(c);
  }

  const items = [];
  let grandTotal = 0;

  for (const [bwType, keys] of Object.entries(BILL_BW_MAP)) {
    const typeChanges = changesByType[bwType] || [];
    const rate = parseAmount(reseller[keys.rate], 0);
    const initialBw = parseAmount(workingBw[bwType], 0);
    if (initialBw === 0 && typeChanges.length === 0) continue;

    const rateHistory = (rateHistoryByType[bwType] || []).filter(rh => rh.effective_date >= info.monthStartStr).sort((a, b) => a.effective_date.localeCompare(b.effective_date));

    const allBwHistory = rateHistoryByType[bwType] || [];
    const preMonthRate = (() => {
      const preEntries = allBwHistory.filter(rh => rh.effective_date < info.monthStartStr).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
      if (preEntries.length > 0) return Number(preEntries[0].rate);
      const thisMonthLogEntries = Object.entries(rateChangeLogMap[bwType] || {}).filter(([d]) => d >= info.monthStartStr && d <= info.monthEndStr).sort(([a], [b]) => a.localeCompare(b));
      if (thisMonthLogEntries.length > 0) return thisMonthLogEntries[0][1];
      return rate;
    })();

    const buildRateSegments = (fromDay, toDay) => {
      if (rateHistory.length === 0) return [{ fromDay, toDay, segRate: preMonthRate }];
      const segs = [];
      let cursor = fromDay;
      let currentRate = preMonthRate;
      for (const rh of rateHistory) {
        const rhDate = parseYMD(rh.effective_date);
        if (!rhDate) continue;
        const rhDay = rhDate.getDate();
        if (rhDay > toDay) break;
        if (rhDay > cursor) {
          segs.push({ fromDay: cursor, toDay: rhDay - 1, segRate: currentRate });
          cursor = rhDay;
        }
        currentRate = Number(rh.rate);
      }
      if (cursor <= toDay) {
        segs.push({ fromDay: cursor, toDay, segRate: currentRate });
      }
      return segs.length > 0 ? segs : [{ fromDay, toDay, segRate: preMonthRate }];
    };

    let cursorDay = info.daysInMonth;
    let tempBw = initialBw;

    for (const change of typeChanges) {
      const changeDate = parseYMD(change.implementation_date);
      if (!changeDate) continue;
      const changeDay = changeDate.getDate();
      const duration = cursorDay - changeDay + 1;

      if (duration > 0 && tempBw > 0) {
        const rateSegs = buildRateSegments(changeDay, cursorDay);
        for (const rs of rateSegs) {
          const segDuration = rs.toDay - rs.fromDay + 1;
          const cost = Math.round((rs.segRate / info.daysInMonth) * tempBw * segDuration * 100) / 100;
          grandTotal += cost;
          items.push({
            desc: bwType,
            bw: tempBw,
            rate: rs.segRate,
            days: segDuration,
            total: cost,
            date_range: `${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), rs.fromDay))} - ${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), rs.toDay))}`,
            change_type: rateSegs.length > 1 ? 'rate_change' : (change.change_type === "increase" ? 'প্যাকেজ বৃদ্ধি' : change.change_type === "decrease" ? 'প্যাকেজ হ্রাস' : "standard"),
          });
        }
      }

      cursorDay = changeDay - 1;
      const amt = parseAmount(change.amount, 0);
      if (change.change_type === "increase") tempBw -= amt;
      else tempBw += amt;
    }

    if (cursorDay >= startDayLimit && tempBw > 0) {
      const rateSegs = buildRateSegments(startDayLimit, cursorDay);
      for (const rs of rateSegs) {
        const segDuration = rs.toDay - rs.fromDay + 1;
        const cost = Math.round((rs.segRate / info.daysInMonth) * tempBw * segDuration * 100) / 100;
        grandTotal += cost;
        items.push({
          desc: bwType,
          bw: tempBw,
          rate: rs.segRate,
          days: segDuration,
          total: cost,
          date_range: `${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), rs.fromDay))} - ${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), rs.toDay))}`,
          change_type: rateSegs.length > 1 ? 'rate_change' : 'standard',
        });
      }
    }
  }

  const realIpCount = Math.max(0, parseWholeNumber(reseller.real_ip_count, 0));
  const realIpPrice = parseAmount(reseller.real_ip_price, 0);
  if (realIpCount > 0) {
    const duration = info.daysInMonth - startDayLimit + 1;
    if (duration > 0) {
      const cost = Math.round(((realIpCount * realIpPrice) / info.daysInMonth) * duration * 100) / 100;
      grandTotal += cost;
      items.push({
        desc: "Real IP",
        bw: realIpCount,
        rate: realIpPrice,
        days: duration,
        total: cost,
        date_range: `${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), startDayLimit))} - ${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), info.daysInMonth))}`,
        change_type: "standard",
      });
    }
  }

  const otcCharge = parseAmount(reseller.otc_charge, 0);
  if (otcCharge > 0 && info.ym === getOtcAppliedMonthYm(reseller)) {
    grandTotal += otcCharge;
    items.push({
      desc: "OTC",
      bw: 1,
      rate: otcCharge,
      days: 1,
      total: Math.round(otcCharge * 100) / 100,
      date_range: fmtDayMon(info.monthStart),
      change_type: "standard",
    });
  }

  items.sort((a, b) => String(a.desc).localeCompare(String(b.desc)));
  grandTotal = Math.round(grandTotal * 100) / 100;
  return { items, total: grandTotal };
};

module.exports = {
  getResellerRecurringMonthlyTotal,
  calculateResellerMonthProjectedTotal,
  calculateMonthlyBillBreakdown,
};
