const pool = require("../utilities/db");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { resolvePermission } = require("../utilities/permissionRegistry");
const {
  initResellerFinancialAuditTable,
  logResellerFinancialChange,
  getActor,
  getReqMeta,
} = require("../utilities/resellerFinancialAudit");
const { fetchCsvSheet } = require("../services/googleSheetsService");

let initPromise = null;
let hasResellerJoiningDateColumn = false;
let joiningDateColumnChecked = false;
let hasResellerPartnerTypeColumn = false;
let partnerTypeColumnChecked = false;
let hasResellerOtcAppliedMonthColumn = false;
let otcAppliedMonthColumnChecked = false;

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase();
const normalizePartnerType = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (["mac_partner", "mac partner", "mac"].includes(raw)) return "mac_partner";
  if (
    ["distribution_partner", "distribution partner", "distribution"].includes(
      raw,
    )
  )
    return "distribution_partner";
  if (
    [
      "channel_partner",
      "channel partner",
      "chanel_partner",
      "chanel partner",
      "channel",
      "chanel",
    ].includes(raw)
  )
    return "channel_partner";
  return "";
};
const normalizedPartnerTypeSql = (
  columnSql = "COALESCE(r.partner_type, '')",
) => `CASE
  WHEN LOWER(${columnSql}) IN ('distribution_partner', 'distribution partner', 'distribution') THEN 'distribution_partner'
  WHEN LOWER(${columnSql}) IN ('mac_partner', 'mac partner', 'mac') THEN 'mac_partner'
  WHEN LOWER(${columnSql}) IN ('channel_partner', 'channel partner', 'chanel_partner', 'chanel partner', 'channel', 'chanel') THEN 'channel_partner'
  ELSE 'distribution_partner'
END`;
const getDhakaYmFromDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
};
const getOtcAppliedMonthYm = (reseller = {}) => {
  const rawValue = reseller.otc_charge_applied_month;
  if (rawValue instanceof Date) {
    const ym = getDhakaYmFromDate(rawValue);
    if (ym) return ym;
  }
  const raw = String(rawValue || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  const normalized = normalizeMonthYm(raw);
  if (normalized) return normalized;
  const parsedYm = getDhakaYmFromDate(raw);
  if (parsedYm) return parsedYm;
  const fallbackDate = parseYMD(reseller.joining_date || reseller.created_at);
  if (!fallbackDate) return null;
  return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`;
};
const isAdminRole = (user) => {
  const role = normalizeRole(user?.role_name || user?.role);
  return role === "admin" || role === "super admin" || role === "superadmin";
};
const hasAnyPermission = (user, keys = []) =>
  keys.some((k) => resolvePermission(user, k));
const canViewResellerFinancials = (user) =>
  isAdminRole(user) ||
  hasAnyPermission(user, [
    "billing.logs.view",
    "billing.monthly_summary.view",
    "billing.generate_bill",
    "billing.invoice.view",
    "billing.invoice.static_view",
  ]);

const PARTNER_SHEET_CONFIG = {
  mac_partner: {
    title: "Mac Partner",
    envKey: "GOOGLE_SHEETS_MAC_PARTNER_CSV_URL",
  },
  distribution_partner: {
    title: "Distribution Partner",
    envKey: "GOOGLE_SHEETS_DISTRIBUTION_PARTNER_CSV_URL",
  },
};
const GOOGLE_SHEETS_WEBHOOK_TOKEN = String(
  process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN || "",
).trim();

const normalizeBwType = (raw) => {
  const val = String(raw || "")
    .toLowerCase()
    .trim();
  const map = {
    iig: "iig_bw",
    iig_bw: "iig_bw",
    bdix: "bdix_bw",
    bdix_bw: "bdix_bw",
    ggc: "ggc_bw",
    ggc_bw: "ggc_bw",
    fna: "fna_bw",
    fna_bw: "fna_bw",
    cdn: "cdn_bw",
    cdn_bw: "cdn_bw",
    bcdn: "bcdn_bw",
    bcdn_bw: "bcdn_bw",
    other: "bcdn_bw",
    nttn: "nttn_capacity",
    nttn_capacity: "nttn_capacity",
  };
  return map[val] || "iig_bw";
};

const parseAmount = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const parseWholeNumber = (v, d = 0) => {
  const n = Math.trunc(parseAmount(v, d));
  return Number.isFinite(n) ? n : d;
};
const parseBillDetailsSnapshot = (raw, context = "") => {
  if (raw == null) return { items: [], valid: false };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) {
      if (context)
        console.warn(`[InvoiceSnapshot] non-array bill_details (${context})`);
      return { items: [], valid: false };
    }
    const items = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        ...item,
        total: parseAmount(item.total, 0),
        bw: parseAmount(item.bw, 0),
        rate: parseAmount(item.rate, 0),
        days: parseAmount(item.days, 0),
      }));
    return { items, valid: true };
  } catch (error) {
    if (context)
      console.warn(
        `[InvoiceSnapshot] invalid JSON bill_details (${context}): ${error.message}`,
      );
    return { items: [], valid: false };
  }
};

const MANUAL_BILLING_DISABLED =
  String(process.env.MANUAL_BILLING_DISABLED ?? "true").toLowerCase() ===
  "true";
const INTERNAL_AUTOMATION_TOKEN = String(
  process.env.INTERNAL_AUTOMATION_TOKEN || "",
).trim();
const AUTO_FINALIZE_DEFAULT_BATCH = Math.max(
  Number.parseInt(process.env.AUTO_FINALIZE_BATCH_SIZE || "200", 10) || 200,
  1,
);
const monthlySummaryCache = new Map();
const isProdEnv =
  String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase() ===
  "production";
const MONTHLY_SUMMARY_CACHE_TTL_MS = Math.max(
  Number.parseInt(
    process.env.MONTHLY_SUMMARY_CACHE_TTL_MS ||
    (isProdEnv ? "120000" : "30000"),
    10,
  ) || (isProdEnv ? 120000 : 30000),
  5000,
);

const cacheKeyMonthlySummary = (month) =>
  `monthly_summary:${String(month || "").slice(0, 7)}`;
const cacheKeyMonthlySummaryByPartner = (month, partnerType = "") =>
  `${cacheKeyMonthlySummary(month)}:${partnerType || "all"}`;
const extractYm = (v) => {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
};
const getMonthlySummaryCachedByPartner = (month, partnerType = "") => {
  const key = cacheKeyMonthlySummaryByPartner(month, partnerType);
  const hit = monthlySummaryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    monthlySummaryCache.delete(key);
    return null;
  }
  return hit.payload;
};
const setMonthlySummaryCachedByPartner = (month, partnerType, payload) => {
  const key = cacheKeyMonthlySummaryByPartner(month, partnerType);
  monthlySummaryCache.set(key, {
    payload,
    expiresAt: Date.now() + MONTHLY_SUMMARY_CACHE_TTL_MS,
  });
};
const invalidateMonthlySummaryCache = (month = null) => {
  const ym = extractYm(month);
  if (!ym) {
    monthlySummaryCache.clear();
    return;
  }
  monthlySummaryCache.delete(cacheKeyMonthlySummary(ym));
  for (const key of monthlySummaryCache.keys()) {
    if (key.startsWith(`${cacheKeyMonthlySummary(ym)}:`)) {
      monthlySummaryCache.delete(key);
    }
  }
};

const getDhakaMonthYm = (date = new Date()) => {
  const local = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Dhaka" }),
  );
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
};
const getDefaultAutoFinalizeMonthYm = (date = new Date()) =>
  previousMonthYm(getDhakaMonthYm(date));

const normalizeMonthYm = (rawValue) => {
  const raw = String(rawValue || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
};

const monthStartDateFromYm = (ym) => `${ym}-01`;
const previousMonthYm = (ym) => {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const nextMonthYm = (ym) => {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const isInternalLocalRequest = (req) => {
  const ip = String(req.ip || req.connection?.remoteAddress || "").trim();
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.endsWith(":127.0.0.1")) return true;
  return false;
};

const normalizeChangeType = (raw) => {
  const val = String(raw || "")
    .toLowerCase()
    .trim();
  if (["increase", "upgrade", "inc", "up", "add", "+"].includes(val))
    return "increase";
  if (["decrease", "downgrade", "dec", "down", "reduce", "-"].includes(val))
    return "decrease";
  return "";
};
const normalizeBillBwType = (raw) => {
  const val = String(raw || "")
    .toUpperCase()
    .trim();
  const map = {
    IIG: "IIG",
    IIG_BW: "IIG",
    BDIX: "BDIX",
    BDIX_BW: "BDIX",
    GGC: "GGC",
    GGC_BW: "GGC",
    FNA: "FNA",
    FNA_BW: "FNA",
    CDN: "CDN",
    CDN_BW: "CDN",
    BCDN: "BCDN",
    BCDN_BW: "BCDN",
    OTHER: "BCDN",
    NTTN: "NTTN",
    NTTN_CAPACITY: "NTTN",
  };
  return map[val] || "";
};

const BILL_BW_MAP = {
  IIG: { col: "iig_bw", rate: "rate_iig" },
  BDIX: { col: "bdix_bw", rate: "rate_bdix" },
  GGC: { col: "ggc_bw", rate: "rate_ggc" },
  FNA: { col: "fna_bw", rate: "rate_fna" },
  CDN: { col: "cdn_bw", rate: "rate_cdn" },
  BCDN: { col: "bcdn_bw", rate: "rate_bcdn" },
  NTTN: { col: "nttn_capacity", rate: "rate_nttn" },
};

const fmtDayMon = (dateObj) =>
  dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

const parseYMD = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value).trim();
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

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

const calculateResellerMonthProjectedTotal = (
  reseller = {},
  targetMonthStr = getDhakaMonthYm(),
) => {
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

const detectJoiningDateColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'joining_date'
       LIMIT 1`,
    );
    hasResellerJoiningDateColumn = result.rows.length > 0;
    joiningDateColumnChecked = true;
  } catch (err) {
    hasResellerJoiningDateColumn = false;
    joiningDateColumnChecked = true;
    console.warn("joining_date schema detect warning:", err.message);
  }
};

const detectPartnerTypeColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'partner_type'
       LIMIT 1`,
    );
    hasResellerPartnerTypeColumn = result.rows.length > 0;
    partnerTypeColumnChecked = true;
  } catch (err) {
    hasResellerPartnerTypeColumn = false;
    partnerTypeColumnChecked = true;
    console.warn("partner_type schema detect warning:", err.message);
  }
};

const detectOtcAppliedMonthColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'otc_charge_applied_month'
       LIMIT 1`,
    );
    hasResellerOtcAppliedMonthColumn = result.rows.length > 0;
    otcAppliedMonthColumnChecked = true;
  } catch (err) {
    hasResellerOtcAppliedMonthColumn = false;
    otcAppliedMonthColumnChecked = true;
    console.warn(
      "otc_charge_applied_month schema detect warning:",
      err.message,
    );
  }
};

const joiningDateExpr = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return hasResellerJoiningDateColumn
    ? `COALESCE(${p}joining_date::date, ${p}created_at::date)`
    : `${p}created_at::date`;
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
    monthStartStr: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`,
    monthEndStr: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
    ym: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`,
  };
};

const shouldPauseProjectedBilling = (reseller, targetMonthYm) => {
  const status = String(reseller?.status || "active").toLowerCase();
  if (status === "active") return false;
  return targetMonthYm >= getDhakaMonthYm();
};

const calculateMonthlyBillBreakdown = async (
  resellerId,
  targetMonthStr,
  resellerRow = null,
) => {
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
              ${hasResellerOtcAppliedMonthColumn ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
              COALESCE(real_ip_count,0)::int AS real_ip_count,
              COALESCE(real_ip_price,0)::numeric AS real_ip_price
       FROM resellers WHERE id = $1`,
        [resellerId],
      )
    ).rows?.[0];

  if (!reseller) return { items: [], total: 0 };
  if (shouldPauseProjectedBilling(reseller, info.ym))
    return { items: [], total: 0 };

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
        effective_date: String(r.effective_date).slice(0, 10),
      });
    }
  } catch (e) {
    // Optional table in some environments; ignore if missing.
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

  const calcSegmentCost = (bwType, baseRate, fromDay, duration, tempBw) => {
    let segmentCost = 0;
    for (let d = 0; d < duration; d += 1) {
      const currentDate = new Date(
        info.monthStart.getFullYear(),
        info.monthStart.getMonth(),
        fromDay + d,
      );
      const currentDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
      let dailyRate = baseRate;
      const history = rateHistoryByType[bwType] || [];
      for (const rh of history) {
        if (rh.effective_date <= currentDateStr)
          dailyRate = parseAmount(rh.rate, dailyRate);
      }
      segmentCost += (dailyRate / info.daysInMonth) * tempBw;
    }
    return Math.round(segmentCost * 100) / 100;
  };

  const items = [];
  let grandTotal = 0;

  for (const [bwType, keys] of Object.entries(BILL_BW_MAP)) {
    const typeChanges = changesByType[bwType] || [];
    const rate = parseAmount(reseller[keys.rate], 0);
    const initialBw = parseAmount(workingBw[bwType], 0);
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
          date_range: `${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), changeDay))} - ${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), cursorDay))}`,
          change_type:
            change.change_type === "increase" ||
              change.change_type === "decrease"
              ? change.change_type
              : "standard",
        });
      }

      cursorDay = changeDay - 1;
      const amt = parseAmount(change.amount, 0);
      if (change.change_type === "increase") tempBw -= amt;
      else tempBw += amt;
    }

    if (cursorDay >= startDayLimit && tempBw > 0) {
      const duration = cursorDay - startDayLimit + 1;
      const cost = calcSegmentCost(
        bwType,
        rate,
        startDayLimit,
        duration,
        tempBw,
      );
      grandTotal += cost;
      items.push({
        desc: bwType,
        bw: tempBw,
        rate,
        days: duration,
        total: cost,
        date_range: `${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), startDayLimit))} - ${fmtDayMon(new Date(info.monthStart.getFullYear(), info.monthStart.getMonth(), cursorDay))}`,
        change_type: "standard",
      });
    }
  }

  const realIpCount = Math.max(0, parseWholeNumber(reseller.real_ip_count, 0));
  const realIpPrice = parseAmount(reseller.real_ip_price, 0);
  if (realIpCount > 0) {
    const duration = info.daysInMonth - startDayLimit + 1;
    if (duration > 0) {
      const cost =
        Math.round(
          ((realIpCount * realIpPrice) / info.daysInMonth) * duration * 100,
        ) / 100;
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

const refreshProjectedBillForCurrentMonth = async (resellerId) => {
  const monthYm = getDhakaMonthYm();
  const monthStart = `${monthYm}-01`;

  const existingBill = await pool.query(
    `SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`,
    [resellerId, monthStart],
  );

  // If the month is already finalized, do not overwrite cached projected bill.
  if (existingBill.rows.length) {
    const snapshot = await pool.query(
      `SELECT COALESCE(current_projected_bill,0)::numeric AS projected
       FROM resellers
       WHERE id = $1`,
      [resellerId],
    );
    return Math.round(parseAmount(snapshot.rows[0]?.projected, 0) * 100) / 100;
  }

  const breakdown = await calculateMonthlyBillBreakdown(resellerId, monthYm);
  const projected = Math.round(parseAmount(breakdown.total, 0) * 100) / 100;

  await pool.query(
    `UPDATE resellers
     SET current_projected_bill = $1,
         last_activity_date = NOW()
     WHERE id = $2`,
    [projected, resellerId],
  );

  return projected;
};

const syncProjectedBillsForCurrentMonth = async () => {
  await initialize();
  const monthYm = getDhakaMonthYm();
  const monthStart = `${monthYm}-01`;
  const monthBillCheck = await pool.query(
    `SELECT reseller_id
     FROM monthly_bills
     WHERE bill_month = $1::date`,
    [monthStart],
  );
  const finalizedResellerIds = new Set(
    monthBillCheck.rows.map((row) => Number(row.reseller_id)),
  );

  const resellersResult = await pool.query(
    `SELECT id
     FROM resellers
     ORDER BY id ASC`,
  );

  const results = [];
  for (const row of resellersResult.rows) {
    const resellerId = Number(row.id);
    try {
      const projected = await refreshProjectedBillForCurrentMonth(resellerId);
      results.push({
        reseller_id: resellerId,
        status: "ok",
        finalized: finalizedResellerIds.has(resellerId),
        projected_bill: projected,
      });
    } catch (error) {
      results.push({
        reseller_id: resellerId,
        status: "failed",
        finalized: finalizedResellerIds.has(resellerId),
        error: error.message,
      });
    }
  }

  return {
    month: monthYm,
    total: results.length,
    updated: results.filter((item) => item.status === "ok").length,
    failed: results.filter((item) => item.status !== "ok").length,
    results,
  };
};

const syncSidebarMenus = async () => {
  const hasSidebarMenus = await pool.query(
    "SELECT to_regclass('public.sidebar_menus') AS reg",
  );
  if (!hasSidebarMenus.rows[0]?.reg) return;

  const updates = [
    ["/reseller-list", "p_reseller_list"],
    ["/tasks-engineer", "p_tech_task"],
    ["/billing-logs", "p_billing_logs"],
    ["/reseller-status-noc", "p_noc_view"],
  ];

  for (const [link, perm] of updates) {
    await pool.query(
      "UPDATE sidebar_menus SET link = $1 WHERE permission_column = $2",
      [link, perm],
    );
  }
  await pool.query(
    `UPDATE sidebar_menus
     SET is_visible = 0
     WHERE permission_column = 'p_generate_bill' OR link = '/generate-bill'`,
  );

  const menus = [
    [
      "Admin Dashboard",
      "/admin-dashboard",
      "fa-gauge-high",
      "all_access",
      "Admin Area",
      0,
    ],
    [
      "System Logs",
      "/system-logs",
      "fa-clipboard-list",
      "p_system_logs",
      "Admin Area",
      1,
    ],
    [
      "Leave Entitlements",
      "/manage-entitlements",
      "fa-layer-group",
      "p_manage_leaves",
      "Admin Area",
      4,
    ],
    [
      "Phone Directory",
      "/phone-directory",
      "fa-address-book",
      "all_access",
      "Staff Services",
      11,
    ],
    [
      "Request Bandwidth",
      "/request-bw",
      "fa-network-wired",
      "p_request_bw",
      "Reseller Management",
      120,
    ],
    [
      "Requests Admin",
      "/requests-admin",
      "fa-user-check",
      "p_requests_admin",
      "Reseller Management",
      121,
    ],
    [
      "Monthly Summary",
      "/monthly-summary",
      "fa-chart-column",
      "p_monthly_summary",
      "Finance",
      122,
    ],
    ["Invoice", "/invoice", "fa-receipt", "p_invoice", "Finance", 124],
    [
      "Static Invoice",
      "/view-static-invoice",
      "fa-file-lines",
      "p_view_static_invoice",
      "Finance",
      125,
    ],
    [
      "Add Reseller",
      "/add-reseller",
      "fa-user-plus",
      "p_add_reseller",
      "Reseller Management",
      126,
    ],
  ];

  for (const m of menus) {
    await pool.query(
      "INSERT INTO sidebar_menus (menu_name, link, icon, permission_column, category, sort_order, parent_id, is_visible) " +
      "SELECT $1,$2,$3,$4,$5,$6,NULL,1 WHERE NOT EXISTS (SELECT 1 FROM sidebar_menus WHERE permission_column = $4 OR link = $2)",
      m,
    );
  }
};

const initBillingAutomationSchema = async () => {
  await pool.query(
    `ALTER TABLE billing_logs
     ADD COLUMN IF NOT EXISTS log_type VARCHAR(30)`,
  );
  await pool.query(
    `UPDATE billing_logs
     SET log_type = CASE
       WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
       ELSE 'adjustment'
     END
     WHERE log_type IS NULL`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_logs_reseller_date
     ON billing_logs (reseller_id, effective_date)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_logs_type_date
     ON billing_logs (log_type, effective_date)`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS billing_finalize_runs (
      id BIGSERIAL PRIMARY KEY,
      run_month DATE NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      processed INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      initiator VARCHAR(80) NOT NULL DEFAULT 'system',
      source VARCHAR(40) NOT NULL DEFAULT 'scheduler',
      error_summary TEXT NULL
    )`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_finalize_runs_month
     ON billing_finalize_runs (run_month DESC, started_at DESC)`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS billing_finalize_run_items (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES billing_finalize_runs(id) ON DELETE CASCADE,
      reseller_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL,
      bill_id BIGINT NULL,
      message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_finalize_run_items_run
     ON billing_finalize_run_items (run_id, reseller_id)`,
  );
};

const initPartnerSheetSchema = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS partner_sheet_snapshots (
      tab_key VARCHAR(80) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      headers JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_partner_sheet_snapshots_updated_at
     ON partner_sheet_snapshots (updated_at DESC)`,
  );
};

const initialize = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      if (!joiningDateColumnChecked) {
        await detectJoiningDateColumn();
      }
      if (!partnerTypeColumnChecked) {
        await detectPartnerTypeColumn();
      }
      if (!otcAppliedMonthColumnChecked) {
        await detectOtcAppliedMonthColumn();
      }
      try {
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS joining_date DATE`,
        );
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS partner_type VARCHAR(40) NOT NULL DEFAULT 'distribution_partner'`,
        );
        await pool.query(
          `UPDATE resellers
           SET partner_type = ${normalizedPartnerTypeSql("COALESCE(partner_type, '')")}
           WHERE partner_type IS NULL
              OR partner_type = ''
              OR partner_type <> ${normalizedPartnerTypeSql("COALESCE(partner_type, '')")}`,
        );
      } catch (err) {
        console.warn("resellers joining_date/partner_type init warning:", err.message);
      }
      try {
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS otc_charge NUMERIC(12,2) NOT NULL DEFAULT 0`,
        );
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS real_ip_count INTEGER NOT NULL DEFAULT 0`,
        );
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS real_ip_price NUMERIC(12,2) NOT NULL DEFAULT 0`,
        );
        await pool.query(
          `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS otc_charge_applied_month DATE`,
        );
        await pool.query(
          `UPDATE resellers
           SET otc_charge_applied_month = DATE_TRUNC('month', COALESCE(joining_date, created_at))::date
           WHERE otc_charge_applied_month IS NULL AND COALESCE(otc_charge,0) > 0`,
        );
      } catch (err) {
        console.warn("resellers otc/real_ip init warning:", err.message);
      }
      await detectJoiningDateColumn();
      await detectPartnerTypeColumn();
      await detectOtcAppliedMonthColumn();
      try {
        await syncSidebarMenus();
      } catch (err) {
        console.warn("syncSidebarMenus warning:", err.message);
      }
      try {
        await initResellerFinancialAuditTable();
      } catch (err) {
        console.warn("initResellerFinancialAuditTable warning:", err.message);
      }
      try {
        await initBillingAutomationSchema();
      } catch (err) {
        console.warn("initBillingAutomationSchema warning:", err.message);
      }
      try {
        await initPartnerSheetSchema();
      } catch (err) {
        console.warn("initPartnerSheetSchema warning:", err.message);
      }
    })();
  }
  return initPromise;
};

const normalizePartnerSheetTab = (rawTab) => {
  const tab = String(rawTab || "")
    .trim()
    .toLowerCase();
  return Object.prototype.hasOwnProperty.call(PARTNER_SHEET_CONFIG, tab)
    ? tab
    : "";
};

const normalizePartnerSheetHeaders = (headers) => {
  if (!Array.isArray(headers)) return [];
  return headers
    .map((header, index) => {
      const value = String(header || "").trim();
      return value || `Column ${index + 1}`;
    })
    .filter(Boolean);
};

const normalizePartnerSheetRows = (rows, headers = []) => {
  if (!Array.isArray(rows)) return [];
  const normalizedHeaders = normalizePartnerSheetHeaders(headers);
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row, index) => {
      const normalizedRow = {
        __rowNumber: Number(row.__rowNumber || index + 2),
      };
      if (normalizedHeaders.length) {
        normalizedHeaders.forEach((header) => {
          normalizedRow[header] = row[header] ?? "";
        });
      } else {
        Object.keys(row).forEach((key) => {
          normalizedRow[key] =
            key === "__rowNumber"
              ? normalizedRow.__rowNumber
              : (row[key] ?? "");
        });
      }
      return normalizedRow;
    });
};

const upsertPartnerSheetSnapshot = async ({
  tab,
  title,
  headers,
  rows,
  sourceMeta = {},
}) => {
  const normalizedTab = normalizePartnerSheetTab(tab);
  if (!normalizedTab) {
    throw new Error("Invalid partner sheet tab");
  }
  const sheetTitle = String(
    title || PARTNER_SHEET_CONFIG[normalizedTab].title,
  ).trim();
  const normalizedHeaders = normalizePartnerSheetHeaders(headers);
  const normalizedRows = normalizePartnerSheetRows(rows, normalizedHeaders);
  await pool.query(
    `INSERT INTO partner_sheet_snapshots (tab_key, title, headers, rows, source_meta, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
     ON CONFLICT (tab_key) DO UPDATE SET
       title = EXCLUDED.title,
       headers = EXCLUDED.headers,
       rows = EXCLUDED.rows,
       source_meta = EXCLUDED.source_meta,
       updated_at = NOW()`,
    [
      normalizedTab,
      sheetTitle,
      JSON.stringify(normalizedHeaders),
      JSON.stringify(normalizedRows),
      JSON.stringify(sourceMeta || {}),
    ],
  );

  return {
    tab: normalizedTab,
    title: sheetTitle,
    headers: normalizedHeaders,
    rows: normalizedRows,
    source_meta: sourceMeta,
  };
};

const readPartnerSheetSnapshot = async (tab) => {
  const normalizedTab = normalizePartnerSheetTab(tab);
  if (!normalizedTab) return null;
  const result = await pool.query(
    `SELECT tab_key AS tab, title, headers, rows, source_meta, updated_at
     FROM partner_sheet_snapshots
     WHERE tab_key = $1
     LIMIT 1`,
    [normalizedTab],
  );
  return result.rows[0] || null;
};

const listResellers = async (req, res) => {
  try {
    await initialize();
    const canViewFinancials = canViewResellerFinancials(req.user);
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    const search = (req.query.search || "").trim();
    const partnerTypeFilter = normalizePartnerType(
      req.query.partner_type || "",
    );
    const rawStatus = String(req.query.status || "active")
      .trim()
      .toLowerCase();
    const statusFilter = ["active", "inactive", "suspended", "all"].includes(
      rawStatus,
    )
      ? rawStatus
      : "active";
    const params = [];
    const whereParts = [];

    if (search) {
      params.push(`%${search}%`);
      whereParts.push(
        `(COALESCE(r.reseller_name, r.company_name) ILIKE $${params.length} OR r.user_id ILIKE $${params.length} OR r.contact_no ILIKE $${params.length})`,
      );
    }

    if (statusFilter !== "all") {
      params.push(statusFilter);
      whereParts.push(
        `LOWER(COALESCE(r.status, 'active')) = $${params.length}`,
      );
    }
    if (partnerTypeFilter) {
      params.push(partnerTypeFilter);
      if (hasPartnerTypeColumn) {
        whereParts.push(
          `${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")} = $${params.length}`,
        );
      } else {
        whereParts.push(`'distribution_partner' = $${params.length}`);
      }
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
        r.id,
        r.user_id AS reseller_code,
        r.company_name,
        COALESCE(r.reseller_name, r.company_name) AS name,
        r.contact_no AS phone,
        r.pop_location,
        r.pop_location AS ip_address,
        ${hasPartnerTypeColumn ? `${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")} AS partner_type,` : `'distribution_partner' AS partner_type,`}
        COALESCE(r.iig_bw,0)::numeric AS iig_bw,
        COALESCE(r.bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(r.ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(r.fna_bw,0)::numeric AS fna_bw,
        COALESCE(r.cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(r.bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(r.nttn_capacity,0)::numeric AS nttn_capacity,
        COALESCE(r.nttn_link, '') AS nttn_link,
        (COALESCE(r.iig_bw,0) + COALESCE(r.bdix_bw,0) + COALESCE(r.ggc_bw,0) + COALESCE(r.fna_bw,0) + COALESCE(r.cdn_bw,0) + COALESCE(r.bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(r.current_projected_bill,0) AS monthly_rate,
        COALESCE(r.otc_charge,0)::numeric AS otc_charge,
        COALESCE(r.real_ip_count,0)::int AS real_ip_count,
        COALESCE(r.real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(r.previous_month_due,0) AS due_amount,
        r.next_pay_date,
        COALESCE(r.status, 'active') AS status,
        (
          SELECT COUNT(*)::int
          FROM bandwidth_requests br
          WHERE br.reseller_id = r.id AND COALESCE(br.admin_status, 'pending') = 'pending'
        ) AS pending_requests
      FROM resellers r
      ${where}
      ORDER BY r.id DESC`,
      params,
    );

    const rows = canViewFinancials
      ? result.rows
      : result.rows.map((r) => ({
        ...r,
        monthly_rate: null,
        due_amount: null,
        next_pay_date: null,
      }));

    res.json(rows);
  } catch (error) {
    console.error("listResellers:", error);
    res.status(500).json({ message: "Failed to load resellers" });
  }
};

const createReseller = async (req, res) => {
  const client = await pool.connect();
  try {
    await initialize();
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    const hasOtcAppliedMonthColumn = await detectOtcAppliedMonthColumn().then(
      () => hasResellerOtcAppliedMonthColumn,
    );

    const {
      reseller_name,
      name,
      company_name,
      reseller_code,
      user_id,
      phone,
      contact_no,
      pop_location,
      ip_address,
      latitude,
      longitude,
      joining_date,
      iig_bw,
      bdix_bw,
      ggc_bw,
      fna_bw,
      cdn_bw,
      bcdn_bw,
      nttn_bw,
      nttn_capacity,
      rate_iig,
      rate_bdix,
      rate_ggc,
      rate_fna,
      rate_cdn,
      rate_bcdn,
      rate_nttn,
      nttn_type,
      nttn_link,
      connection_type,
      security_deposit,
      otc_charge,
      real_ip_count,
      real_ip_price,
      initial_payment,
      status,
      due_amount,
      next_pay_date,
      partner_type,
      channel_user_count,
    } = req.body || {};

    const resellerName = String(reseller_name || name || "").trim();
    if (!resellerName)
      return res.status(400).json({ message: "Reseller name is required" });

    const manualUserId = String(user_id || reseller_code || "").trim();
    const baseUserId = resellerName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const generatedUserId = `${baseUserId || "reseller"}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalUserId = manualUserId || generatedUserId;
    const companyName = String(company_name || resellerName).trim();
    const rawResellerPassword =
      String(
        req.body?.password || contact_no || phone || finalUserId || "123456",
      ).trim() || "123456";
    const resellerPassword = await bcrypt.hash(rawResellerPassword, 10);
    const normalizedPartnerType =
      normalizePartnerType(partner_type) || "distribution_partner";

    const joinDate = String(
      joining_date || new Date().toISOString().slice(0, 10),
    ).slice(0, 10);
    const otcAppliedMonth = `${getDhakaMonthYm()}-01`;
    const bw = {
      iig_bw: parseAmount(iig_bw, 0),
      bdix_bw: parseAmount(bdix_bw, 0),
      ggc_bw: parseAmount(ggc_bw, 0),
      fna_bw: parseAmount(fna_bw, 0),
      cdn_bw: parseAmount(cdn_bw, 0),
      bcdn_bw: parseAmount(bcdn_bw, 0),
      nttn_capacity: parseAmount(nttn_capacity ?? nttn_bw, 0),
    };

    const rate = {
      rate_iig: parseAmount(rate_iig, 0),
      rate_bdix: parseAmount(rate_bdix, 0),
      rate_ggc: parseAmount(rate_ggc, 0),
      rate_fna: parseAmount(rate_fna, 0),
      rate_cdn: parseAmount(rate_cdn, 0),
      rate_bcdn: parseAmount(rate_bcdn, 0),
      rate_nttn: parseAmount(rate_nttn, 0),
    };
    const otcCharge = parseAmount(otc_charge, 0);
    const realIpCount = Math.max(0, parseWholeNumber(real_ip_count, 0));
    const realIpPrice = parseAmount(real_ip_price, 0);
    const projectedBill = calculateResellerMonthProjectedTotal({
      ...bw,
      ...rate,
      joining_date: joinDate,
      otc_charge: otcCharge,
      otc_charge_applied_month: otcAppliedMonth,
      real_ip_count: realIpCount,
      real_ip_price: realIpPrice,
    });

    const nttnTypeText = Array.isArray(nttn_type)
      ? nttn_type.join(", ")
      : String(nttn_type || "").trim();
    const connectionTypeText = Array.isArray(connection_type)
      ? connection_type.join(", ")
      : String(connection_type || "").trim();

    await client.query("BEGIN");

    const insertValuesBase = [
      finalUserId,
      resellerName,
      companyName,
      pop_location || ip_address || null,
      contact_no || phone || null,
      bw.iig_bw,
      bw.bdix_bw,
      bw.ggc_bw,
      bw.fna_bw,
      bw.cdn_bw,
      bw.bcdn_bw,
      bw.nttn_capacity,
      nttnTypeText || null,
      nttn_link || null,
      connectionTypeText || null,
      latitude || null,
      longitude || null,
      rate.rate_iig,
      rate.rate_bdix,
      rate.rate_ggc,
      rate.rate_fna,
      rate.rate_cdn,
      rate.rate_bcdn,
      rate.rate_nttn,
      Math.round(projectedBill * 100) / 100,
      parseAmount(due_amount, 0),
      next_pay_date || null,
      String(status || "active").toLowerCase(),
      parseAmount(security_deposit, 0),
      otcCharge,
      realIpCount,
      realIpPrice,
    ];

    const ins = await client.query(
      hasResellerJoiningDateColumn
        ? hasPartnerTypeColumn && hasOtcAppliedMonthColumn
          ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, otc_charge_applied_month, partner_type, password, joining_date, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33::date,$34,$35,$36::date,NOW(),NOW()
            ) RETURNING id`
          : hasPartnerTypeColumn
            ? `INSERT INTO resellers (
                user_id, reseller_name, company_name, pop_location, contact_no,
                iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
                nttn_type, nttn_link, connection_type, latitude, longitude,
                rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
                current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, partner_type, password, joining_date, created_at, last_activity_date
              ) VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,$10,$11,$12,
                $13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,
                $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::date,NOW(),NOW()
              ) RETURNING id`
            : `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, password, joining_date, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34::date,NOW(),NOW()
            ) RETURNING id`
        : hasPartnerTypeColumn && hasOtcAppliedMonthColumn
          ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, otc_charge_applied_month, partner_type, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33::date,$34,$35,$36::timestamp,NOW()
            ) RETURNING id`
          : hasPartnerTypeColumn
            ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, partner_type, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::timestamp,NOW()
            ) RETURNING id`
            : `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34::timestamp,NOW()
            ) RETURNING id`,
      hasPartnerTypeColumn && hasOtcAppliedMonthColumn
        ? [
          ...insertValuesBase,
          otcAppliedMonth,
          normalizedPartnerType,
          resellerPassword,
          joinDate,
        ]
        : hasPartnerTypeColumn
          ? [
            ...insertValuesBase,
            normalizedPartnerType,
            resellerPassword,
            joinDate,
          ]
          : [...insertValuesBase, resellerPassword, joinDate],
    );

    const newResellerId = ins.rows[0].id;

    // Save channel_user_count if provided (channel partners only)
    const channelUserCount = Math.max(
      0,
      parseInt(channel_user_count || 0, 10) || 0,
    );
    if (channelUserCount > 0 || normalizedPartnerType === "channel_partner") {
      try {
        await client.query(
          "UPDATE resellers SET channel_user_count = $1 WHERE id = $2",
          [channelUserCount, newResellerId],
        );
      } catch (_) {
        // column may not exist on older DB — non-fatal
      }
    }

    const initPayment = parseAmount(initial_payment, 0);
    const createdAt = `${joinDate}T00:00:00`;
    const actor = getActor(req);
    const reqMeta = getReqMeta(req);

    await logResellerFinancialChange(client, {
      reseller_id: newResellerId,
      ...actor,
      ...reqMeta,
      action_type: "CREATE_RESELLER_FINANCIAL_BASELINE",
      reference_table: "resellers",
      reference_id: newResellerId,
      amount_before: 0,
      amount_after: Math.round(projectedBill * 100) / 100,
      amount_delta: Math.round(projectedBill * 100) / 100,
      due_before: 0,
      due_after: parseAmount(due_amount, 0),
      due_delta: parseAmount(due_amount, 0),
      field_changes: {
        current_projected_bill: {
          old: 0,
          new: Math.round(projectedBill * 100) / 100,
        },
        previous_month_due: { old: 0, new: parseAmount(due_amount, 0) },
        security_deposit: { old: 0, new: parseAmount(security_deposit, 0) },
        otc_charge: { old: 0, new: otcCharge },
        real_ip_count: { old: 0, new: realIpCount },
        real_ip_price: { old: 0, new: realIpPrice },
      },
      note: "Reseller created with financial baseline",
      request_payload: {
        due_amount,
        security_deposit,
        initial_payment,
        otc_charge: otcCharge,
        real_ip_count: realIpCount,
        real_ip_price: realIpPrice,
      },
    });

    if (initPayment > 0) {
      const paymentInsert = await client.query(
        `INSERT INTO billing_logs (reseller_id, change_desc, effective_date, transaction_amount, created_at)
         VALUES ($1,$2,$3::timestamp,$4,NOW())
         RETURNING id`,
        [
          newResellerId,
          `Initial Payment: ${initPayment.toFixed(2)} Tk.`,
          createdAt,
          initPayment,
        ],
      );

      await logResellerFinancialChange(client, {
        reseller_id: newResellerId,
        ...actor,
        ...reqMeta,
        action_type: "ADD_INITIAL_PAYMENT",
        reference_table: "billing_logs",
        reference_id: paymentInsert.rows?.[0]?.id || null,
        amount_before: 0,
        amount_after: initPayment,
        amount_delta: initPayment,
        due_before: parseAmount(due_amount, 0),
        due_after: parseAmount(due_amount, 0),
        due_delta: 0,
        field_changes: { payment_amount: initPayment },
        note: `Initial payment logged for reseller ${newResellerId}`,
        request_payload: {
          initial_payment: initPayment,
          effective_date: createdAt,
        },
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ id: newResellerId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("createReseller:", error);
    res
      .status(500)
      .json({ message: "Failed to create reseller", detail: error.message });
  } finally {
    client.release();
  }
};
const getResellerProfile = async (req, res) => {
  try {
    await initialize();
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    const { id } = req.params;

    const resellerResult = await pool.query(
      `SELECT
        r.id,
        r.user_id AS reseller_code,
        r.company_name,
        COALESCE(r.reseller_name, r.company_name) AS name,
        r.contact_no AS phone,
        r.pop_location,
        r.pop_location AS ip_address,
        'distribution_partner' AS partner_type,
        COALESCE(r.iig_bw,0)::numeric AS iig_bw,
        COALESCE(r.bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(r.ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(r.fna_bw,0)::numeric AS fna_bw,
        COALESCE(r.cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(r.bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(r.nttn_capacity,0)::numeric AS nttn_capacity,
        (COALESCE(r.iig_bw,0) + COALESCE(r.bdix_bw,0) + COALESCE(r.ggc_bw,0) + COALESCE(r.fna_bw,0) + COALESCE(r.cdn_bw,0) + COALESCE(r.bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(r.current_projected_bill,0) AS monthly_rate,
        COALESCE(r.previous_month_due,0) AS due_amount,
        r.next_pay_date,
        COALESCE(r.status, 'active') AS status,
        r.created_at,
        ${joiningDateExpr("r")} AS joining_date
      FROM resellers r
      WHERE r.id = $1`,
      [id],
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const logs = await pool.query(
      `SELECT id, reseller_id, request_id, change_desc AS note, transaction_amount AS amount, effective_date, created_at,
              COALESCE(
                to_jsonb(billing_logs)->>'log_type',
                CASE
                  WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
                  WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
                  ELSE 'adjustment'
                END
              ) AS log_type
       FROM billing_logs WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [id],
    );

    const requests = await pool.query(
      `SELECT id, reseller_id, bw_type, change_type, amount AS requested_bw_mbps, requested_effective_date,
              reseller_note AS reason,
              COALESCE(engineer_status, admin_status, 'pending') AS status,
              created_at, implementation_date AS applied_at
       FROM bandwidth_requests WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [id],
    );

    const bills = await pool.query(
      `SELECT id, reseller_id, bill_month, amount AS final_amount, adjustment, previous_due, created_at
       FROM monthly_bills WHERE reseller_id = $1 ORDER BY bill_month DESC LIMIT 24`,
      [id],
    );

    res.json({
      reseller: resellerResult.rows[0],
      billingLogs: logs.rows,
      bandwidthRequests: requests.rows,
      monthlyBills: bills.rows,
    });
  } catch (error) {
    console.error("getResellerProfile:", error);
    res.status(500).json({ message: "Failed to load reseller profile" });
  }
};

const getResellerProfileDetails = async (req, res) => {
  try {
    await initialize();
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    const { id } = req.params;
    const perms = req.user?.permissions || {};
    const isAdmin = isAdminRole(req.user) || !!perms.all_access;
    const canViewProfile =
      isAdmin ||
      hasAnyPermission(req.user, [
        "reseller.profile",
        "reseller.list",
        "reseller.tasks.manage",
        "reseller.status_noc.view",
      ]);
    if (!canViewProfile) {
      return res.status(403).json({ message: "Access denied" });
    }

    const resellerResult = await pool.query(
      `SELECT
        r.id,
        r.user_id AS reseller_code,
        COALESCE(r.reseller_name, r.company_name) AS name,
        r.company_name,
        r.contact_no AS phone,
        r.pop_location,
        r.latitude,
        r.longitude,
        ${hasPartnerTypeColumn ? `COALESCE(${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")}, 'distribution_partner') AS partner_type,` : `'distribution_partner' AS partner_type,`}
        COALESCE(r.status, 'active') AS status,
        COALESCE(r.iig_bw,0)::numeric AS iig_bw,
        COALESCE(r.bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(r.ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(r.fna_bw,0)::numeric AS fna_bw,
        COALESCE(r.cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(r.bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(r.nttn_capacity,0)::numeric AS nttn_capacity,
        COALESCE(r.rate_iig,0)::numeric AS rate_iig,
        COALESCE(r.rate_bdix,0)::numeric AS rate_bdix,
        COALESCE(r.rate_ggc,0)::numeric AS rate_ggc,
        COALESCE(r.rate_fna,0)::numeric AS rate_fna,
        COALESCE(r.rate_cdn,0)::numeric AS rate_cdn,
        COALESCE(r.rate_bcdn,0)::numeric AS rate_bcdn,
        COALESCE(r.rate_nttn,0)::numeric AS rate_nttn,
        COALESCE(r.nttn_type,'') AS nttn_type,
        COALESCE(r.nttn_link,'') AS nttn_link,
        COALESCE(r.connection_type,'') AS connection_type,
        COALESCE(r.previous_month_due,0)::numeric AS previous_month_due,
        COALESCE(r.current_projected_bill,0)::numeric AS current_projected_bill,
        COALESCE(r.security_deposit,0)::numeric AS security_deposit,
        COALESCE(r.otc_charge,0)::numeric AS otc_charge,
        ${hasResellerOtcAppliedMonthColumn ? `r.otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        COALESCE(r.real_ip_count,0)::int AS real_ip_count,
        COALESCE(r.real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(r.channel_user_count,0)::int AS channel_user_count,
        COALESCE(r.profit_share_percentage,0)::numeric AS profit_share_percentage,
        r.next_pay_date,
        r.created_at,
        ${joiningDateExpr("r")} AS joining_date
      FROM resellers r
      WHERE r.id = $1`,
      [id],
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }
    const reseller = resellerResult.rows[0];

    const currentMonth = getDhakaMonthYm();
    const currentMonthDate = `${currentMonth}-01`;

    const paidCurrentMonthResult = await pool.query(
      `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS total
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'payment'`,
      [id, currentMonth],
    );
    const totalPaidCurrentMonth = Number(
      paidCurrentMonthResult.rows[0]?.total || 0,
    );

    const discountCurrentMonthResult = await pool.query(
      `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS total
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'discount'`,
      [id, currentMonth],
    );
    const totalDiscountCurrentMonth = Number(
      discountCurrentMonthResult.rows[0]?.total || 0,
    );

    const currentBillResult = await pool.query(
      `SELECT id, bill_month, created_at,
              COALESCE(amount,0)::numeric AS amount,
              COALESCE(adjustment,0)::numeric AS adjustment,
              COALESCE(previous_due,0)::numeric AS previous_due
       FROM monthly_bills
       WHERE reseller_id = $1 AND bill_month = $2::date
       LIMIT 1`,
      [id, currentMonthDate],
    );
    const currentBill = currentBillResult.rows[0] || null;

    let paymentsAfterLastBill = 0;
    let netDue = 0;
    let calcTooltip = "";
    let projectedBillCurrentMonth = Number(
      reseller.current_projected_bill || 0,
    );
    let previousDueCurrentMonth = Number(reseller.previous_month_due || 0);

    if (currentBill) {
      projectedBillCurrentMonth =
        Number(currentBill.amount || 0) + Number(currentBill.adjustment || 0);
      previousDueCurrentMonth = Number(currentBill.previous_due || 0);
      const afterBillResult = await pool.query(
        `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS total
         FROM billing_logs
         WHERE reseller_id = $1
           AND effective_date > $2
           AND COALESCE(
             to_jsonb(billing_logs)->>'log_type',
             CASE
               WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
               WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
               ELSE 'adjustment'
             END
           ) IN ('payment','discount')`,
        [id, currentBill.created_at],
      );
      paymentsAfterLastBill = Number(afterBillResult.rows[0]?.total || 0);
    } else {
      try {
        const breakdown = await calculateMonthlyBillBreakdown(
          id,
          currentMonth,
          reseller,
        );
        projectedBillCurrentMonth = Number(breakdown.total || 0);
        try {
          await pool.query(
            `UPDATE resellers
             SET current_projected_bill = $1,
                 last_activity_date = NOW()
             WHERE id = $2`,
            [Math.round(projectedBillCurrentMonth * 100) / 100, id],
          );
        } catch (syncErr) {
          console.warn(
            `getResellerProfileDetails sync cache warning for reseller=${id}: ${syncErr.message}`,
          );
        }
      } catch (breakdownErr) {
        projectedBillCurrentMonth = Number(
          reseller.current_projected_bill || 0,
        );
        console.warn(
          `getResellerProfileDetails breakdown fallback failed for reseller=${id}, month=${currentMonth}: ${breakdownErr.message}`,
        );
      }
    }

    projectedBillCurrentMonth =
      Math.round(projectedBillCurrentMonth * 100) / 100;
    previousDueCurrentMonth = Math.round(previousDueCurrentMonth * 100) / 100;

    // Current due formula: (Previous Due + Projected Bill) - Paid This Month - Discount This Month
    netDue =
      previousDueCurrentMonth +
      projectedBillCurrentMonth -
      totalPaidCurrentMonth -
      totalDiscountCurrentMonth;
    calcTooltip =
      "Formula: (Previous Due + Projected Bill) - Paid This Month - Discount This Month";

    const lastBillResult = await pool.query(
      `SELECT id, bill_month
       FROM monthly_bills
       WHERE reseller_id = $1
       ORDER BY bill_month DESC
       LIMIT 1`,
      [id],
    );
    const lastBill = lastBillResult.rows[0] || null;

    let pendingBillWarning = "";
    if (lastBill?.bill_month) {
      const lastBillMonth = String(lastBill.bill_month).slice(0, 7);
      const prevMonthCheck = previousMonthYm(currentMonth);
      if (lastBillMonth < prevMonthCheck) {
        pendingBillWarning = `???????: ?? ????? (${prevMonthCheck}) ??? ???? ??????? ??? ?????`;
      }
    }

    const recentRequestsResult = await pool.query(
      `SELECT
        id,
        bw_type,
        change_type,
        amount AS requested_bw_mbps,
        requested_effective_date,
        created_at,
        COALESCE(admin_status,'pending') AS admin_status
       FROM bandwidth_requests
       WHERE reseller_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [id],
    );

    const statementResult = await pool.query(
      `SELECT
        'invoice'::text AS type,
        id,
        COALESCE(amount,0)::numeric AS amount,
        created_at AS date,
        TO_CHAR(bill_month, 'FMMonth YYYY') AS description
       FROM monthly_bills
       WHERE reseller_id = $1
       UNION ALL
       SELECT
        COALESCE(
          to_jsonb(billing_logs)->>'log_type',
          CASE
            WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
            WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
            ELSE 'adjustment'
          END
        )::text AS type,
        id,
        COALESCE(transaction_amount,0)::numeric AS amount,
        effective_date AS date,
        COALESCE(change_desc,
          CASE
            WHEN COALESCE(
              to_jsonb(billing_logs)->>'log_type',
              CASE
                WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
                WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
                ELSE 'adjustment'
              END
            ) = 'discount' THEN 'Discount'
            ELSE 'Payment Received'
          END
        ) AS description
       FROM billing_logs
       WHERE reseller_id = $1
         AND COALESCE(transaction_amount,0) > 0
         AND COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) IN ('payment','discount')
       ORDER BY date DESC
       LIMIT 20`,
      [id],
    );

    const statementItems = statementResult.rows.map((item) => ({
      ...item,
      action_url:
        item.type === "invoice" ? `/view-static-invoice?id=${item.id}` : null,
    }));

    const recentBillsResult = await pool.query(
      `SELECT id, bill_month, amount AS final_amount, adjustment, previous_due, created_at
       FROM monthly_bills
       WHERE reseller_id = $1
       ORDER BY bill_month DESC
       LIMIT 5`,
      [id],
    );

    const billHistory = [];
    for (const bill of recentBillsResult.rows) {
      const ym = String(bill.bill_month).slice(0, 7);
      const paidResult = await pool.query(
        `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS paid
         FROM billing_logs
         WHERE reseller_id = $1
           AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
           AND COALESCE(
             to_jsonb(billing_logs)->>'log_type',
             CASE
               WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
               WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
               ELSE 'adjustment'
             END
           ) IN ('payment','discount')`,
        [id, ym],
      );
      const paid = Number(paidResult.rows[0]?.paid || 0);
      const prevDue = Number(bill.previous_due || 0);
      const amount = Number(bill.final_amount || 0);
      const adj = Number(bill.adjustment || 0);
      const closingDue = prevDue + amount + adj - paid;
      billHistory.push({ ...bill, paid, closing_due: closingDue });
    }

    const canViewFinancials = canViewResellerFinancials(req.user);
    const canAddPayment =
      isAdmin || resolvePermission(req.user, "billing.logs.view");
    const canAddDiscount =
      canAddPayment || resolvePermission(req.user, "billing.discount.add");
    const canViewInvoice = canViewFinancials;

    const safeReseller = { ...reseller };
    safeReseller.previous_month_due = previousDueCurrentMonth;
    safeReseller.current_projected_bill = projectedBillCurrentMonth;
    if (!canViewFinancials) {
      [
        "rate_iig",
        "rate_bdix",
        "rate_ggc",
        "rate_fna",
        "rate_cdn",
        "rate_bcdn",
        "rate_nttn",
        "previous_month_due",
        "current_projected_bill",
        "security_deposit",
        "next_pay_date",
        "otc_charge",
        "real_ip_price",
      ].forEach((k) => {
        safeReseller[k] = null;
      });
    }

    const paidForDueCalculation = currentBill
      ? paymentsAfterLastBill
      : totalPaidCurrentMonth + totalDiscountCurrentMonth;

    const safeStats = canViewFinancials
      ? {
        total_paid_current_month: totalPaidCurrentMonth,
        total_discount_current_month: totalDiscountCurrentMonth,
        previous_due_current_month: previousDueCurrentMonth,
        projected_bill_current_month: projectedBillCurrentMonth,
        calculation_month: currentMonth,
        paid_for_due_calculation: paidForDueCalculation,
        payments_after_last_bill: paymentsAfterLastBill,
        net_due: netDue,
        calc_tooltip: calcTooltip,
        pending_bill_warning: pendingBillWarning,
        has_current_bill: Boolean(currentBill),
      }
      : {
        total_paid_current_month: null,
        total_discount_current_month: null,
        previous_due_current_month: null,
        projected_bill_current_month: null,
        calculation_month: null,
        paid_for_due_calculation: null,
        payments_after_last_bill: null,
        net_due: null,
        calc_tooltip: null,
        pending_bill_warning: "",
        has_current_bill: false,
      };

    res.json({
      reseller: safeReseller,
      permissions: {
        can_view_financials: canViewFinancials,
        can_add_payment: canViewFinancials && canAddPayment,
        can_add_discount: canViewFinancials && canAddDiscount,
        can_edit_profile: isAdmin,
        can_view_invoice: canViewInvoice,
      },
      stats: safeStats,
      recent_requests: recentRequestsResult.rows,
      statement_items: canViewFinancials ? statementItems : [],
      recent_bills: canViewFinancials ? recentBillsResult.rows : [],
      bill_history: canViewFinancials ? billHistory : [],
    });
  } catch (error) {
    console.error("getResellerProfileDetails:", error);
    res
      .status(500)
      .json({ message: "Failed to load reseller profile details" });
  }
};
const updateReseller = async (req, res) => {
  try {
    await initialize();
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    await detectOtcAppliedMonthColumn();
    const { id } = req.params;
    const {
      name,
      company_name,
      phone,
      ip_address,
      pop_location,
      latitude,
      longitude,
      reseller_code,
      status,
      iig_bw,
      bdix_bw,
      ggc_bw,
      fna_bw,
      cdn_bw,
      bcdn_bw,
      nttn_capacity,
      nttn_type,
      nttn_link,
      connection_type,
      rate_iig,
      rate_bdix,
      rate_ggc,
      rate_fna,
      rate_cdn,
      rate_bcdn,
      rate_nttn,
      monthly_rate,
      due_amount,
      next_pay_date,
      joining_date,
      security_deposit,
      otc_charge,
      real_ip_count,
      real_ip_price,
      partner_type,
    } = req.body;
    const newPasswordRaw = String(req.body?.password || "").trim();
    const newHashedPassword = newPasswordRaw
      ? await bcrypt.hash(newPasswordRaw, 10)
      : null;
    const normalizedJoiningDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(joining_date || "").trim(),
    )
      ? String(joining_date).slice(0, 10)
      : null;
    const normalizedStatus = String(status || "")
      .trim()
      .toLowerCase();
    const hasExplicitStatus = normalizedStatus.length > 0;
    const shouldZeroProjectedBill =
      hasExplicitStatus && normalizedStatus !== "active";
    const hasExplicitPartnerType = req.body.partner_type !== undefined;
    const hasExplicitOtcCharge = req.body.otc_charge !== undefined;
    const hasBillingImpactingChange = [
      "iig_bw",
      "bdix_bw",
      "ggc_bw",
      "fna_bw",
      "cdn_bw",
      "bcdn_bw",
      "nttn_capacity",
      "rate_iig",
      "rate_bdix",
      "rate_ggc",
      "rate_fna",
      "rate_cdn",
      "rate_bcdn",
      "rate_nttn",
      "joining_date",
      "real_ip_count",
      "real_ip_price",
      "otc_charge",
      "status",
    ].some((key) => req.body[key] !== undefined);
    const shouldRefreshProjectedBill =
      hasBillingImpactingChange &&
      normalizedStatus !== "inactive" &&
      normalizedStatus !== "suspended";
    const normalizedPartnerType = normalizePartnerType(partner_type);

    const beforeResult = await pool.query(
      `SELECT id,
              COALESCE(current_projected_bill,0)::numeric AS current_projected_bill,
              COALESCE(previous_month_due,0)::numeric AS previous_month_due,
              COALESCE(security_deposit,0)::numeric AS security_deposit,
              COALESCE(otc_charge,0)::numeric AS otc_charge,
              COALESCE(real_ip_count,0)::int AS real_ip_count,
              COALESCE(real_ip_price,0)::numeric AS real_ip_price,
              COALESCE(rate_iig,0)::numeric AS rate_iig,
              COALESCE(rate_bdix,0)::numeric AS rate_bdix,
              COALESCE(rate_ggc,0)::numeric AS rate_ggc,
              COALESCE(rate_fna,0)::numeric AS rate_fna,
              COALESCE(rate_cdn,0)::numeric AS rate_cdn,
              COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
              COALESCE(rate_nttn,0)::numeric AS rate_nttn
       FROM resellers WHERE id = $1`,
      [id],
    );
    if (!beforeResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }
    const before = beforeResult.rows[0];

    const updateValuesBase = [
      name || null,
      company_name || null,
      phone || null,
      pop_location || ip_address || null,
      latitude || null,
      longitude || null,
      reseller_code || null,
      status || null,
      req.body.iig_bw !== undefined ? parseAmount(iig_bw, 0) : null,
      req.body.bdix_bw !== undefined ? parseAmount(bdix_bw, 0) : null,
      req.body.ggc_bw !== undefined ? parseAmount(ggc_bw, 0) : null,
      req.body.fna_bw !== undefined ? parseAmount(fna_bw, 0) : null,
      req.body.cdn_bw !== undefined ? parseAmount(cdn_bw, 0) : null,
      req.body.bcdn_bw !== undefined ? parseAmount(bcdn_bw, 0) : null,
      req.body.nttn_capacity !== undefined
        ? parseAmount(nttn_capacity, 0)
        : null,
      nttn_type || null,
      nttn_link || null,
      connection_type || null,
      req.body.rate_iig !== undefined ? parseAmount(rate_iig, 0) : null,
      req.body.rate_bdix !== undefined ? parseAmount(rate_bdix, 0) : null,
      req.body.rate_ggc !== undefined ? parseAmount(rate_ggc, 0) : null,
      req.body.rate_fna !== undefined ? parseAmount(rate_fna, 0) : null,
      req.body.rate_cdn !== undefined ? parseAmount(rate_cdn, 0) : null,
      req.body.rate_bcdn !== undefined ? parseAmount(rate_bcdn, 0) : null,
      req.body.rate_nttn !== undefined ? parseAmount(rate_nttn, 0) : null,
      shouldZeroProjectedBill
        ? 0
        : req.body.monthly_rate !== undefined
          ? parseAmount(monthly_rate, 0)
          : null,
      req.body.due_amount !== undefined ? parseAmount(due_amount, 0) : null,
      next_pay_date || null,
      req.body.security_deposit !== undefined
        ? parseAmount(security_deposit, 0)
        : null,
      req.body.otc_charge !== undefined ? parseAmount(otc_charge, 0) : null,
      req.body.real_ip_count !== undefined
        ? Math.max(0, parseWholeNumber(real_ip_count, 0))
        : null,
      req.body.real_ip_price !== undefined
        ? parseAmount(real_ip_price, 0)
        : null,
      newHashedPassword,
    ];

    const updateQuery = hasResellerJoiningDateColumn
      ? `UPDATE resellers SET
          reseller_name = COALESCE($1, reseller_name),
          company_name = COALESCE($2, company_name),
          contact_no = COALESCE($3, contact_no),
          pop_location = COALESCE($4, pop_location),
          latitude = COALESCE($5, latitude),
          longitude = COALESCE($6, longitude),
          user_id = COALESCE($7, user_id),
          status = COALESCE($8, status),
          iig_bw = COALESCE($9, iig_bw),
          bdix_bw = COALESCE($10, bdix_bw),
          ggc_bw = COALESCE($11, ggc_bw),
          fna_bw = COALESCE($12, fna_bw),
          cdn_bw = COALESCE($13, cdn_bw),
          bcdn_bw = COALESCE($14, bcdn_bw),
          nttn_capacity = COALESCE($15, nttn_capacity),
          nttn_type = COALESCE($16, nttn_type),
          nttn_link = COALESCE($17, nttn_link),
          connection_type = COALESCE($18, connection_type),
          rate_iig = COALESCE($19, rate_iig),
          rate_bdix = COALESCE($20, rate_bdix),
          rate_ggc = COALESCE($21, rate_ggc),
          rate_fna = COALESCE($22, rate_fna),
          rate_cdn = COALESCE($23, rate_cdn),
          rate_bcdn = COALESCE($24, rate_bcdn),
          rate_nttn = COALESCE($25, rate_nttn),
          current_projected_bill = COALESCE($26, current_projected_bill),
          previous_month_due = COALESCE($27, previous_month_due),
          next_pay_date = COALESCE($28, next_pay_date),
          security_deposit = COALESCE($29, security_deposit),
          otc_charge = COALESCE($30, otc_charge),
          real_ip_count = COALESCE($31, real_ip_count),
          real_ip_price = COALESCE($32, real_ip_price),
          password = COALESCE($33, password),
          joining_date = COALESCE($34::date, joining_date),
          last_activity_date = NOW()
        WHERE id = $35
        RETURNING id,
                  COALESCE(current_projected_bill,0)::numeric AS current_projected_bill,
                  COALESCE(previous_month_due,0)::numeric AS previous_month_due,
                  COALESCE(security_deposit,0)::numeric AS security_deposit,
                  COALESCE(otc_charge,0)::numeric AS otc_charge,
                  COALESCE(real_ip_count,0)::int AS real_ip_count,
                  COALESCE(real_ip_price,0)::numeric AS real_ip_price,
                  COALESCE(rate_iig,0)::numeric AS rate_iig,
                  COALESCE(rate_bdix,0)::numeric AS rate_bdix,
                  COALESCE(rate_ggc,0)::numeric AS rate_ggc,
                  COALESCE(rate_fna,0)::numeric AS rate_fna,
                  COALESCE(rate_cdn,0)::numeric AS rate_cdn,
                  COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
                  COALESCE(rate_nttn,0)::numeric AS rate_nttn`
      : `UPDATE resellers SET
          reseller_name = COALESCE($1, reseller_name),
          company_name = COALESCE($2, company_name),
          contact_no = COALESCE($3, contact_no),
          pop_location = COALESCE($4, pop_location),
          latitude = COALESCE($5, latitude),
          longitude = COALESCE($6, longitude),
          user_id = COALESCE($7, user_id),
          status = COALESCE($8, status),
          iig_bw = COALESCE($9, iig_bw),
          bdix_bw = COALESCE($10, bdix_bw),
          ggc_bw = COALESCE($11, ggc_bw),
          fna_bw = COALESCE($12, fna_bw),
          cdn_bw = COALESCE($13, cdn_bw),
          bcdn_bw = COALESCE($14, bcdn_bw),
          nttn_capacity = COALESCE($15, nttn_capacity),
          nttn_type = COALESCE($16, nttn_type),
          nttn_link = COALESCE($17, nttn_link),
          connection_type = COALESCE($18, connection_type),
          rate_iig = COALESCE($19, rate_iig),
          rate_bdix = COALESCE($20, rate_bdix),
          rate_ggc = COALESCE($21, rate_ggc),
          rate_fna = COALESCE($22, rate_fna),
          rate_cdn = COALESCE($23, rate_cdn),
          rate_bcdn = COALESCE($24, rate_bcdn),
          rate_nttn = COALESCE($25, rate_nttn),
          current_projected_bill = COALESCE($26, current_projected_bill),
          previous_month_due = COALESCE($27, previous_month_due),
          next_pay_date = COALESCE($28, next_pay_date),
          security_deposit = COALESCE($29, security_deposit),
          otc_charge = COALESCE($30, otc_charge),
          real_ip_count = COALESCE($31, real_ip_count),
          real_ip_price = COALESCE($32, real_ip_price),
          password = COALESCE($33, password),
          last_activity_date = NOW()
        WHERE id = $34
        RETURNING id,
                  COALESCE(current_projected_bill,0)::numeric AS current_projected_bill,
                  COALESCE(previous_month_due,0)::numeric AS previous_month_due,
                  COALESCE(security_deposit,0)::numeric AS security_deposit,
                  COALESCE(otc_charge,0)::numeric AS otc_charge,
                  COALESCE(real_ip_count,0)::int AS real_ip_count,
                  COALESCE(real_ip_price,0)::numeric AS real_ip_price,
                  COALESCE(rate_iig,0)::numeric AS rate_iig,
                  COALESCE(rate_bdix,0)::numeric AS rate_bdix,
                  COALESCE(rate_ggc,0)::numeric AS rate_ggc,
                  COALESCE(rate_fna,0)::numeric AS rate_fna,
                  COALESCE(rate_cdn,0)::numeric AS rate_cdn,
                  COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
                  COALESCE(rate_nttn,0)::numeric AS rate_nttn`;

    const updateValues = hasResellerJoiningDateColumn
      ? [...updateValuesBase, normalizedJoiningDate, id]
      : [...updateValuesBase, id];

    const result = await pool.query(updateQuery, updateValues);

    let after = result.rows[0];

    if (hasResellerOtcAppliedMonthColumn && hasExplicitOtcCharge) {
      await pool.query(
        `UPDATE resellers
         SET otc_charge_applied_month = $1
         WHERE id = $2`,
        [parseAmount(otc_charge, 0) > 0 ? `${getDhakaMonthYm()}-01` : null, id],
      );
    }

    if (shouldRefreshProjectedBill) {
      const refreshedProjected = await refreshProjectedBillForCurrentMonth(
        Number(id),
      );
      after = {
        ...after,
        current_projected_bill: refreshedProjected,
      };
    }
    if (
      hasPartnerTypeColumn &&
      hasExplicitPartnerType &&
      normalizedPartnerType
    ) {
      await pool.query(`UPDATE resellers SET partner_type = $1 WHERE id = $2`, [
        normalizedPartnerType,
        id,
      ]);
    }

    if (req.body.profit_share_percentage !== undefined) {
      const psp = parseAmount(req.body.profit_share_percentage, 0);
      await pool
        .query(
          `UPDATE resellers SET profit_share_percentage = $1 WHERE id = $2`,
          [Math.max(0, Math.min(100, psp)), id],
        )
        .catch(() => { });
    }

    if (req.body.channel_user_count !== undefined) {
      const cuc = Math.max(
        0,
        parseInt(req.body.channel_user_count || 0, 10) || 0,
      );
      await pool
        .query(
          `UPDATE resellers SET channel_user_count = $1 WHERE id = $2`,
          [cuc, id],
        )
        .catch(() => { });
    }

    const watchedFields = [
      "current_projected_bill",
      "previous_month_due",
      "security_deposit",
      "otc_charge",
      "real_ip_count",
      "real_ip_price",
      "rate_iig",
      "rate_bdix",
      "rate_ggc",
      "rate_fna",
      "rate_cdn",
      "rate_bcdn",
      "rate_nttn",
    ];
    const fieldChanges = {};
    for (const field of watchedFields) {
      const oldVal = parseAmount(before[field], 0);
      const newVal = parseAmount(after[field], 0);
      if (oldVal !== newVal) {
        fieldChanges[field] = {
          old: oldVal,
          new: newVal,
          delta: Math.round((newVal - oldVal) * 100) / 100,
        };
      }
    }

    if (Object.keys(fieldChanges).length > 0) {
      const actor = getActor(req);
      const reqMeta = getReqMeta(req);
      await logResellerFinancialChange(pool, {
        reseller_id: Number(id),
        ...actor,
        ...reqMeta,
        action_type: "UPDATE_RESELLER_FINANCIAL_FIELDS",
        reference_table: "resellers",
        reference_id: Number(id),
        amount_before: parseAmount(before.current_projected_bill, 0),
        amount_after: parseAmount(after.current_projected_bill, 0),
        amount_delta:
          parseAmount(after.current_projected_bill, 0) -
          parseAmount(before.current_projected_bill, 0),
        due_before: parseAmount(before.previous_month_due, 0),
        due_after: parseAmount(after.previous_month_due, 0),
        due_delta:
          parseAmount(after.previous_month_due, 0) -
          parseAmount(before.previous_month_due, 0),
        field_changes: fieldChanges,
        note: "Reseller financial fields updated",
        request_payload: req.body || {},
      });
    }

    invalidateMonthlySummaryCache();
    res.json({ message: "Updated" });
  } catch (error) {
    console.error("updateReseller:", error);
    res.status(500).json({ message: "Failed to update reseller" });
  }
};
const getStatusNoc = async (req, res) => {
  try {
    await initialize();
    const canViewNoc =
      hasAnyPermission(req.user, ["reseller.status_noc.view"]) ||
      isAdminRole(req.user);
    if (!canViewNoc) {
      return res.status(403).json({ message: "Access denied" });
    }
    const canViewFinancials = canViewResellerFinancials(req.user);
    const rawStatus = String(req.query.status || "active")
      .trim()
      .toLowerCase();
    const statusFilter = ["active", "inactive", "suspended", "all"].includes(
      rawStatus,
    )
      ? rawStatus
      : "active";
    const params = [];
    const whereParts = [];
    if (statusFilter !== "all") {
      params.push(statusFilter);
      whereParts.push(`LOWER(COALESCE(status, 'active')) = $${params.length}`);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
        id,
        user_id AS reseller_code,
        company_name,
        COALESCE(reseller_name, company_name) AS name,
        contact_no AS phone,
        pop_location,
        pop_location AS ip_address,
        COALESCE(iig_bw,0)::numeric AS iig_bw,
        COALESCE(bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(fna_bw,0)::numeric AS fna_bw,
        COALESCE(cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(nttn_capacity,0)::numeric AS nttn_capacity,
        (COALESCE(iig_bw,0) + COALESCE(bdix_bw,0) + COALESCE(ggc_bw,0) + COALESCE(fna_bw,0) + COALESCE(cdn_bw,0) + COALESCE(bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(current_projected_bill,0) AS monthly_rate,
        COALESCE(status, 'active') AS status,
        last_activity_date AS updated_at
      FROM resellers
      ${where}
      ORDER BY COALESCE(reseller_name, company_name) ASC`,
      params,
    );
    const rows = canViewFinancials
      ? result.rows
      : result.rows.map((r) => ({
        ...r,
        monthly_rate: null,
      }));

    res.json(rows);
  } catch (error) {
    console.error("getStatusNoc:", error);
    res.status(500).json({ message: "Failed to load NOC status" });
  }
};

const createBandwidthRequest = async (req, res) => {
  try {
    await initialize();

    const resellerId = Number(req.body?.reseller_id || 0);
    if (!resellerId) {
      return res.status(400).json({ message: "reseller_id is required" });
    }

    const adminNote =
      String(req.body?.admin_note || req.body?.reason || "").trim() || null;
    const requestedBy = req.user?.id || null;

    const rawBwData = req.body?.bw_data;
    const requests = [];

    if (rawBwData && typeof rawBwData === "object") {
      for (const [bwType, data] of Object.entries(rawBwData)) {
        const row = data && typeof data === "object" ? data : {};
        const action = normalizeChangeType(
          row.action || row.change_type || row.type || row.mode,
        );
        const amountRaw =
          row.amount ??
          row.requested_bw_mbps ??
          row.requested_bw ??
          row.qty ??
          row.value;
        const amount = Math.max(0, Math.round(parseAmount(amountRaw, 0)));
        if ((action === "increase" || action === "decrease") && amount > 0) {
          requests.push({ bw_type: bwType, change_type: action, amount });
        }
      }
    }

    if (!requests.length) {
      const singleAmount = Math.max(
        0,
        Math.round(parseAmount(req.body?.requested_bw_mbps, 0)),
      );
      const singleAction = normalizeChangeType(
        req.body?.change_type || req.body?.action || "increase",
      );
      const singleType = String(req.body?.bw_type || "IIG").trim() || "IIG";
      if (
        singleAmount > 0 &&
        (singleAction === "increase" || singleAction === "decrease")
      ) {
        requests.push({
          bw_type: singleType,
          change_type: singleAction,
          amount: singleAmount,
        });
      }
    }

    if (!requests.length) {
      return res.status(400).json({ message: "No valid request found" });
    }

    const inserted = [];
    for (const reqRow of requests) {
      const result = await pool.query(
        `INSERT INTO bandwidth_requests (
          reseller_id, bw_type, change_type, amount, requested_effective_date, requested_by, reseller_note,
          admin_note, admin_status, engineer_status, created_at
        ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,'pending','pending',NOW())
         RETURNING *`,
        [
          resellerId,
          reqRow.bw_type,
          reqRow.change_type,
          reqRow.amount,
          requestedBy,
          adminNote,
          adminNote,
        ],
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({
      message: "Requests submitted",
      count: inserted.length,
      requests: inserted,
    });
  } catch (error) {
    console.error("createBandwidthRequest:", error);
    res.status(500).json({ message: "Failed to submit bandwidth request" });
  }
};
const listBandwidthRequests = async (req, res) => {
  try {
    await initialize();
    const status = (req.query.status || "").toLowerCase();
    const params = [];
    let where = "";

    if (status === "pending") {
      where = "WHERE COALESCE(br.admin_status,'pending') = 'pending'";
    } else if (status === "approved") {
      where = "WHERE COALESCE(br.admin_status,'pending') = 'approved'";
    } else if (status === "rejected") {
      where = "WHERE COALESCE(br.admin_status,'pending') = 'rejected'";
    }

    const result = await pool.query(
      `SELECT
        br.id,
        br.reseller_id,
        r.user_id AS reseller_code,
        COALESCE(r.reseller_name, r.company_name) AS reseller_name,
        COALESCE(r.company_name, '') AS company_name,
        COALESCE(r.pop_location, '') AS pop_location,
        COALESCE(r.rate_iig,0)::numeric AS rate_iig,
        COALESCE(r.rate_bdix,0)::numeric AS rate_bdix,
        COALESCE(r.rate_ggc,0)::numeric AS rate_ggc,
        COALESCE(r.rate_fna,0)::numeric AS rate_fna,
        COALESCE(r.rate_cdn,0)::numeric AS rate_cdn,
        COALESCE(r.rate_bcdn,0)::numeric AS rate_bcdn,
        COALESCE(r.rate_nttn,0)::numeric AS rate_nttn,
        br.bw_type,
        br.change_type,
        br.amount AS requested_bw_mbps,
        br.requested_effective_date,
        NULL::numeric AS requested_rate,
        br.reseller_note AS reason,
        COALESCE(br.engineer_status, br.admin_status, 'pending') AS status,
        br.admin_status,
        br.engineer_status,
        br.created_at,
        br.implementation_date AS applied_at
       FROM bandwidth_requests br
       JOIN resellers r ON r.id = br.reseller_id
       ${where}
       ORDER BY br.created_at DESC, br.id DESC`,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    console.error("listBandwidthRequests:", error);
    res.status(500).json({ message: "Failed to load requests" });
  }
};

const reviewBandwidthRequest = async (req, res) => {
  try {
    await initialize();
    const { id } = req.params;
    const status = (req.body.status || "").toLowerCase();
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be approved, rejected, or pending" });
    }

    const existingResult = await pool.query(
      `SELECT *
       FROM bandwidth_requests
       WHERE id = $1`,
      [id],
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ message: "Request not found" });
    }

    const existing = existingResult.rows[0];
    const currentAdminStatus = String(
      existing.admin_status || "pending",
    ).toLowerCase();
    const currentEngineerStatus = String(
      existing.engineer_status || "pending",
    ).toLowerCase();

    if (status === "pending") {
      if (currentAdminStatus !== "rejected") {
        return res.status(400).json({
          message: "Only rejected requests can be restored to pending",
        });
      }
      if (currentEngineerStatus === "implemented") {
        return res.status(400).json({
          message: "Implemented requests cannot be restored to pending",
        });
      }
    }

    const nextEngineerStatus =
      status === "pending" ? "pending" : currentEngineerStatus;
    const nextAdminNote = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "note",
    )
      ? req.body.note || null
      : existing.admin_note;

    const result = await pool.query(
      `UPDATE bandwidth_requests
       SET admin_status = $1,
           engineer_status = $2,
           admin_note = $3
       WHERE id = $4
       RETURNING *`,
      [status, nextEngineerStatus, nextAdminNote, id],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("reviewBandwidthRequest:", error);
    res.status(500).json({ message: "Failed to review request" });
  }
};

const applyApprovedRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    await initialize();
    const { id } = req.params;
    await client.query("BEGIN");

    const reqResult = await client.query(
      "SELECT * FROM bandwidth_requests WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!reqResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Request not found" });
    }

    const bwReq = reqResult.rows[0];
    if ((bwReq.admin_status || "pending") !== "approved") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "Only approved request can be applied" });
    }

    const bwCol = normalizeBwType(bwReq.bw_type);
    const factor =
      String(bwReq.change_type || "").toLowerCase() === "decrease" ? -1 : 1;
    const delta = factor * Math.abs(parseAmount(bwReq.amount, 0));

    const projectedBeforeResult = await client.query(
      `SELECT COALESCE(current_projected_bill,0)::numeric AS projected_before,
              COALESCE(previous_month_due,0)::numeric AS due_before
       FROM resellers WHERE id = $1 FOR UPDATE`,
      [bwReq.reseller_id],
    );
    const projectedBefore = parseAmount(
      projectedBeforeResult.rows[0]?.projected_before,
      0,
    );
    const dueBefore = parseAmount(projectedBeforeResult.rows[0]?.due_before, 0);

    const updateSql = `UPDATE resellers SET ${bwCol} = GREATEST(0, COALESCE(${bwCol},0) + $1), last_activity_date = NOW() WHERE id = $2 RETURNING *`;
    const updatedReseller = await client.query(updateSql, [
      delta,
      bwReq.reseller_id,
    ]);

    await client.query(
      `UPDATE bandwidth_requests
       SET engineer_status = 'implemented', implementation_date = NOW(), tech_note = COALESCE($1, tech_note)
       WHERE id = $2`,
      [req.body?.note || null, id],
    );

    await client.query(
      `INSERT INTO billing_logs (reseller_id, request_id, change_desc, transaction_amount, effective_date, created_at)
       VALUES ($1, $2, $3, 0, NOW(), NOW())`,
      [
        bwReq.reseller_id,
        bwReq.id,
        `Applied ${bwReq.change_type || "increase"} ${bwReq.amount} on ${bwReq.bw_type || "iig_bw"}`,
      ],
    );

    await client.query("COMMIT");

    let projectedBill = null;
    try {
      projectedBill = await refreshProjectedBillForCurrentMonth(
        bwReq.reseller_id,
      );
    } catch (e) {
      console.warn("refreshProjectedBillForCurrentMonth warning:", e.message);
    }

    try {
      const actor = getActor(req);
      const reqMeta = getReqMeta(req);
      await logResellerFinancialChange(pool, {
        reseller_id: Number(bwReq.reseller_id),
        ...actor,
        ...reqMeta,
        action_type: "APPLY_BW_REQUEST_FINANCIAL_IMPACT",
        reference_table: "bandwidth_requests",
        reference_id: Number(bwReq.id),
        amount_before: projectedBefore,
        amount_after: parseAmount(projectedBill, projectedBefore),
        amount_delta:
          parseAmount(projectedBill, projectedBefore) - projectedBefore,
        due_before: dueBefore,
        due_after: dueBefore,
        due_delta: 0,
        field_changes: {
          bw_type: bwReq.bw_type,
          change_type: bwReq.change_type,
          amount: parseAmount(bwReq.amount, 0),
          bw_delta: delta,
        },
        note: `Applied ${bwReq.change_type} ${bwReq.amount} ${bwReq.bw_type}`,
        request_payload: req.body || {},
      });
    } catch (auditErr) {
      console.warn("applyApprovedRequest audit warning:", auditErr.message);
    }

    res.json({
      message: "Request applied successfully",
      reseller: updatedReseller.rows[0],
      projected_bill: projectedBill,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("applyApprovedRequest:", error);
    res.status(500).json({ message: "Failed to apply request" });
  } finally {
    client.release();
  }
};

const getBillingLogs = async (req, res) => {
  try {
    await initialize();
    const resellerId = req.query.reseller_id;
    const params = [];
    let where = "";

    if (resellerId) {
      params.push(resellerId);
      where = "WHERE bl.reseller_id = $1";
    }

    const result = await pool.query(
      `SELECT
        bl.id,
        bl.reseller_id,
        r.user_id AS reseller_code,
        COALESCE(r.reseller_name, r.company_name) AS reseller_name,
        COALESCE(
          to_jsonb(bl)->>'log_type',
          CASE
            WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount'
            WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment'
            ELSE 'adjustment'
          END
        ) AS log_type,
        bl.transaction_amount AS amount,
        bl.change_desc AS note,
        bl.effective_date,
        bl.created_at
       FROM billing_logs bl
       JOIN resellers r ON r.id = bl.reseller_id
       ${where}
       ORDER BY bl.id DESC
       LIMIT 500`,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    console.error("getBillingLogs:", error);
    res.status(500).json({ message: "Failed to load billing logs" });
  }
};

const getPartnerSheetList = async (req, res) => {
  try {
    const tab = String(req.query.tab || "")
      .trim()
      .toLowerCase();
    const config = PARTNER_SHEET_CONFIG[tab];

    if (!config) {
      return res.status(400).json({ message: "Invalid partner tab" });
    }

    res.set("Cache-Control", "private, max-age=10, must-revalidate");

    const cached = await readPartnerSheetSnapshot(tab);
    if (cached) {
      return res.json({
        tab,
        title: cached.title,
        headers: Array.isArray(cached.headers) ? cached.headers : [],
        rows: Array.isArray(cached.rows) ? cached.rows : [],
        row_count: Array.isArray(cached.rows) ? cached.rows.length : 0,
        fetched_at: cached.updated_at,
        source: "webhook-cache",
      });
    }

    const sheetUrl = String(process.env[config.envKey] || "").trim();
    if (!sheetUrl) {
      return res.status(503).json({
        message: `${config.title} sheet has no cached snapshot yet and no CSV fallback is configured`,
        env_key: config.envKey,
        hint: "Send a webhook sync first or configure the CSV URL fallback",
      });
    }

    const sheet = await fetchCsvSheet(sheetUrl);
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const headers = Array.isArray(sheet.headers) ? sheet.headers : [];

    res.json({
      tab,
      title: config.title,
      source_url: sheetUrl,
      headers,
      rows,
      row_count: rows.length,
      fetched_at: new Date().toISOString(),
      source: "csv-fallback",
    });
  } catch (error) {
    console.error("getPartnerSheetList:", error);
    res.status(500).json({ message: "Failed to load partner sheet data" });
  }
};

const ingestPartnerSheetWebhook = async (req, res) => {
  try {
    await initialize();
    if (!GOOGLE_SHEETS_WEBHOOK_TOKEN) {
      return res
        .status(503)
        .json({ message: "Webhook token is not configured" });
    }

    const token = String(
      req.headers["x-webhook-token"] || req.body?.token || "",
    ).trim();
    if (!token || token !== GOOGLE_SHEETS_WEBHOOK_TOKEN) {
      return res.status(401).json({ message: "Invalid webhook token" });
    }

    const tab = normalizePartnerSheetTab(req.body?.tab);
    if (!tab) {
      return res.status(400).json({ message: "Valid tab is required" });
    }

    const title = String(
      req.body?.title || PARTNER_SHEET_CONFIG[tab].title,
    ).trim();
    const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const sourceMeta = {
      spreadsheet_id: String(req.body?.spreadsheet_id || "").trim(),
      sheet_name: String(req.body?.sheet_name || "").trim(),
      updated_at: String(req.body?.updated_at || "").trim(),
      row_count: rows.length,
    };

    const snapshot = await upsertPartnerSheetSnapshot({
      tab,
      title,
      headers,
      rows,
      sourceMeta,
    });

    res.json({
      message: "Partner sheet synced",
      tab: snapshot.tab,
      title: snapshot.title,
      row_count: snapshot.rows.length,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("ingestPartnerSheetWebhook:", error);
    res.status(500).json({ message: "Failed to ingest partner sheet webhook" });
  }
};

const getFinancialAuditLogs = async (req, res) => {
  try {
    await initialize();
    const role = String(
      req.user?.role_name || req.user?.role || "",
    ).toLowerCase();
    const perms = req.user?.permissions || {};
    const isAdmin =
      role === "admin" ||
      role === "super admin" ||
      role === "superadmin" ||
      !!perms.all_access;
    const canViewFinancials =
      isAdmin ||
      !!(
        req.user?.p_reseller_list ||
        perms.p_reseller_list ||
        req.user?.p_billing_logs ||
        perms.p_billing_logs
      );
    if (!canViewFinancials) {
      return res.status(403).json({ message: "Access denied" });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
      200,
    );
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (req.query.reseller_id) {
      params.push(Number(req.query.reseller_id));
      where.push(`l.reseller_id = $${params.length}`);
    }
    if (req.query.action_type) {
      params.push(`%${String(req.query.action_type).trim()}%`);
      where.push(`l.action_type ILIKE $${params.length}`);
    }
    if (req.query.from) {
      params.push(String(req.query.from));
      where.push(`l.created_at >= $${params.length}::timestamptz`);
    }
    if (req.query.to) {
      params.push(String(req.query.to));
      where.push(`l.created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reseller_financial_audit_logs l ${whereSql}`,
      params,
    );

    const queryParams = [...params, limit, offset];
    const dataResult = await pool.query(
      `SELECT l.*,
              COALESCE(r.reseller_name, r.company_name) AS reseller_name,
              r.user_id AS reseller_code
       FROM reseller_financial_audit_logs l
       LEFT JOIN resellers r ON r.id = l.reseller_id
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT $${queryParams.length - 1}
       OFFSET $${queryParams.length}`,
      queryParams,
    );

    res.json({
      page,
      limit,
      total: countResult.rows[0]?.total || 0,
      totalPages: Math.ceil((countResult.rows[0]?.total || 0) / limit),
      rows: dataResult.rows,
    });
  } catch (error) {
    console.error("getFinancialAuditLogs:", error);
    res.status(500).json({ message: "Failed to load financial audit logs" });
  }
};

const getCreditedAmountForMonth = async (client, resellerId, monthYm) => {
  const creditedResult = await client.query(
    `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS credited
     FROM billing_logs
     WHERE reseller_id = $1
       AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
       AND COALESCE(
         to_jsonb(billing_logs)->>'log_type',
         CASE
           WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
           WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
           ELSE 'adjustment'
         END
       ) IN ('payment','discount')`,
    [resellerId, monthYm],
  );
  return parseAmount(creditedResult.rows[0]?.credited, 0);
};

const finalizeResellerBill = async (client, params) => {
  const {
    resellerId,
    monthYm,
    adjustment = 0,
    adjustmentNote = null,
    actor,
    reqMeta,
    source = "manual",
    requestPayload = {},
  } = params;

  const billDate = monthStartDateFromYm(monthYm);
  const existingBill = await client.query(
    `SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`,
    [resellerId, billDate],
  );
  if (existingBill.rows.length) {
    return {
      status: "already_finalized",
      bill_id: existingBill.rows[0].id,
      month: billDate,
    };
  }

  const resellerResult = await client.query(
    `SELECT id,
            ${joiningDateExpr()} AS joining_date,
            COALESCE(previous_month_due,0)::numeric AS previous_month_due,
            COALESCE(current_projected_bill,0)::numeric AS current_projected_bill,
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
            COALESCE(rate_nttn,0)::numeric AS rate_nttn
     FROM resellers
     WHERE id = $1
     FOR UPDATE`,
    [resellerId],
  );
  if (!resellerResult.rows.length) {
    return { status: "not_found", message: "Reseller not found" };
  }
  const reseller = resellerResult.rows[0];

  const createdDate = parseYMD(reseller.joining_date || reseller.created_at);
  const createdMonthYm = createdDate
    ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`
    : null;
  if (!createdMonthYm) {
    return {
      status: "invalid_joining_date",
      message: "Invalid reseller joining date",
    };
  }
  if (monthYm < createdMonthYm) {
    return {
      status: "invalid_month",
      message: "Cannot generate bill before reseller join month",
    };
  }

  if (monthYm > createdMonthYm) {
    const prevYm = previousMonthYm(monthYm);
    const prevMonthResult = await client.query(
      `SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`,
      [resellerId, monthStartDateFromYm(prevYm)],
    );
    if (!prevMonthResult.rows.length) {
      return {
        status: "previous_month_missing",
        message: `Previous month bill (${prevYm}) not finalized`,
      };
    }
  }

  const breakdown = await calculateMonthlyBillBreakdown(
    resellerId,
    monthYm,
    reseller,
  );
  const amount = parseAmount(breakdown.total, 0);
  const credited = await getCreditedAmountForMonth(client, resellerId, monthYm);
  const prevDue = parseAmount(reseller.previous_month_due, 0);
  const adj = parseAmount(adjustment, 0);
  const adjNote = adjustmentNote ? String(adjustmentNote).trim() : null;

  const insertResult = await client.query(
    `INSERT INTO monthly_bills (reseller_id, bill_month, amount, adjustment, adjustment_note, bill_details, previous_due, created_at)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (reseller_id, bill_month)
     DO NOTHING
     RETURNING id`,
    [
      resellerId,
      billDate,
      amount,
      adj,
      adjNote,
      JSON.stringify(breakdown.items || []),
      prevDue,
    ],
  );

  if (!insertResult.rows.length) {
    const existingAfterInsert = await client.query(
      `SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`,
      [resellerId, billDate],
    );
    return {
      status: "already_finalized",
      bill_id: existingAfterInsert.rows[0]?.id || null,
      month: billDate,
    };
  }

  const billId = insertResult.rows[0].id;
  const newDue = prevDue + amount + adj - credited;
  let nextProjected = 0;
  try {
    const nextMonth = nextMonthYm(monthYm);
    const nextBreakdown = await calculateMonthlyBillBreakdown(
      resellerId,
      nextMonth,
      reseller,
    );
    nextProjected = Math.round(parseAmount(nextBreakdown.total, 0) * 100) / 100;
  } catch (e) {
    nextProjected =
      Math.round(parseAmount(reseller.current_projected_bill, 0) * 100) / 100;
  }
  await client.query(
    `UPDATE resellers
     SET previous_month_due = $1,
         current_projected_bill = $2,
         last_activity_date = NOW()
     WHERE id = $3`,
    [newDue, nextProjected, resellerId],
  );

  await logResellerFinancialChange(client, {
    reseller_id: Number(resellerId),
    ...actor,
    ...reqMeta,
    action_type:
      source === "auto"
        ? "AUTO_FINALIZE_MONTHLY_BILL"
        : "FINALIZE_MONTHLY_BILL",
    reference_table: "monthly_bills",
    reference_id: billId,
    amount_before: 0,
    amount_after: amount + adj,
    amount_delta: amount + adj,
    due_before: prevDue,
    due_after: newDue,
    due_delta: newDue - prevDue,
    field_changes: {
      month: billDate,
      base_amount: amount,
      adjustment: adj,
      paid_this_month: credited,
      source,
    },
    note:
      source === "auto"
        ? "Auto final invoice generated"
        : "Final invoice generated",
    request_payload: requestPayload,
  });

  invalidateMonthlySummaryCache(monthYm);

  return {
    status: "finalized",
    bill_id: billId,
    month: billDate,
    amount,
    adjustment: adj,
    paid: credited,
    new_due: newDue,
  };
};

const addBillingLog = async (req, res) => {
  const client = await pool.connect();
  try {
    await initialize();
    const { reseller_id, log_type, amount, note, effective_date } = req.body;
    if (!reseller_id) {
      return res.status(400).json({ message: "reseller_id is required" });
    }

    const normalizedType = String(log_type || "payment")
      .trim()
      .toLowerCase();
    const parsedAmount = parseAmount(amount, 0);
    if (!["payment", "discount", "adjustment"].includes(normalizedType)) {
      return res.status(400).json({ message: "Invalid log_type" });
    }
    if (
      (normalizedType === "payment" || normalizedType === "discount") &&
      parsedAmount <= 0
    ) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }
    const effDate = effective_date || new Date().toISOString();
    await client.query("BEGIN");
    const actor = getActor(req);
    const reqMeta = getReqMeta(req);

    const dueBeforeResult = await client.query(
      `SELECT COALESCE(previous_month_due,0)::numeric AS due FROM resellers WHERE id = $1 FOR UPDATE`,
      [reseller_id],
    );
    const dueBefore = parseAmount(dueBeforeResult.rows[0]?.due, 0);

    const hasLogTypeResult = await client.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'billing_logs'
          AND column_name = 'log_type'
      ) AS has_log_type`,
    );
    const hasLogTypeColumn = !!hasLogTypeResult.rows[0]?.has_log_type;

    const result = hasLogTypeColumn
      ? await client.query(
        `INSERT INTO billing_logs (reseller_id, request_id, log_type, change_desc, transaction_amount, effective_date, created_at)
           VALUES ($1, NULL, $2, $3, $4, $5, NOW()) RETURNING *`,
        [
          reseller_id,
          normalizedType,
          note || normalizedType,
          parsedAmount,
          effDate,
        ],
      )
      : await client.query(
        `INSERT INTO billing_logs (reseller_id, request_id, change_desc, transaction_amount, effective_date, created_at)
           VALUES ($1, NULL, $2, $3, $4, NOW()) RETURNING *`,
        [reseller_id, note || normalizedType, parsedAmount, effDate],
      );

    await logResellerFinancialChange(client, {
      reseller_id: Number(reseller_id),
      ...actor,
      ...reqMeta,
      action_type:
        normalizedType === "discount"
          ? "ADD_BILLING_DISCOUNT_ENTRY"
          : "ADD_BILLING_LOG_ENTRY",
      reference_table: "billing_logs",
      reference_id: result.rows[0]?.id || null,
      amount_before: 0,
      amount_after: parsedAmount,
      amount_delta: parsedAmount,
      due_before: dueBefore,
      due_after: dueBefore,
      due_delta: 0,
      field_changes: {
        log_type: normalizedType,
        transaction_amount: parsedAmount,
      },
      note: note || null,
      request_payload: { reseller_id, log_type, amount, effective_date },
    });

    await client.query("COMMIT");
    invalidateMonthlySummaryCache(extractYm(effDate));
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("addBillingLog:", error);
    res.status(500).json({ message: "Failed to add billing log" });
  } finally {
    client.release();
  }
};
const getMonthlySummary = async (req, res) => {
  try {
    await initialize();
    const startedAt = Date.now();
    const rawMonth = String(req.query.month || getDhakaMonthYm());
    const selectedMonth = rawMonth.slice(0, 7);
    const monthStart = `${selectedMonth}-01`;
    const hasPartnerTypeColumn = await detectPartnerTypeColumn().then(
      () => hasResellerPartnerTypeColumn,
    );
    const partnerTypeFilter = normalizePartnerType(
      req.query.partner_type || "",
    );
    const cached = getMonthlySummaryCachedByPartner(
      selectedMonth,
      partnerTypeFilter,
    );
    if (cached) {
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[MonthlySummary] month=${selectedMonth} row_count=${cached.rows?.length || 0} cache_hit=true monthly_summary_ms=${elapsedMs}`,
      );
      return res.json({
        ...cached,
        meta: {
          generated_at: new Date().toISOString(),
          cache_hit: true,
        },
      });
    }

    const dataResult = await pool.query(
      `WITH active_resellers AS (
         SELECT
           r.id,
           COALESCE(r.reseller_name, r.company_name) AS name,
           r.company_name,
           r.contact_no,
           ${hasPartnerTypeColumn ? `${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")}` : `'distribution_partner'`} AS partner_type,
           COALESCE(r.previous_month_due, 0)::numeric AS previous_month_due,
           COALESCE(r.current_projected_bill, 0)::numeric AS current_projected_bill,
           r.next_pay_date
         FROM resellers r
         WHERE COALESCE(r.status, 'active') = 'active'
           ${partnerTypeFilter ? `AND ${hasPartnerTypeColumn ? normalizedPartnerTypeSql("COALESCE(r.partner_type, '')") : `'distribution_partner'`} = $3` : ""}
       ),
       month_bills AS (
         SELECT
           mb.reseller_id,
           COALESCE(mb.amount, 0)::numeric AS amount,
           COALESCE(mb.previous_due, 0)::numeric AS previous_due,
           COALESCE(mb.adjustment, 0)::numeric AS adjustment
         FROM monthly_bills mb
         WHERE mb.bill_month = $1::date
       ),
       latest_bills AS (
         SELECT DISTINCT ON (mb.reseller_id)
           mb.reseller_id,
           COALESCE(mb.amount, 0)::numeric AS amount,
           COALESCE(mb.adjustment, 0)::numeric AS adjustment
         FROM monthly_bills mb
         WHERE mb.bill_month < $1::date
         ORDER BY mb.reseller_id, mb.bill_month DESC
       ),
       month_logs AS (
         SELECT
           bl.reseller_id,
           COALESCE(SUM(bl.transaction_amount) FILTER (
             WHERE COALESCE(
               to_jsonb(bl)->>'log_type',
               CASE
                 WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount'
                 WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment'
                 ELSE 'adjustment'
               END
             ) = 'payment'
           ), 0)::numeric AS paid,
           COALESCE(SUM(bl.transaction_amount) FILTER (
             WHERE COALESCE(
               to_jsonb(bl)->>'log_type',
               CASE
                 WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount'
                 WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment'
                 ELSE 'adjustment'
               END
             ) = 'discount'
           ), 0)::numeric AS discount
         FROM billing_logs bl
         WHERE TO_CHAR(COALESCE(bl.effective_date, bl.created_at), 'YYYY-MM') = $2
         GROUP BY bl.reseller_id
       )
       SELECT
         ar.id,
         ar.name,
         ar.company_name AS company,
         ar.contact_no AS contact,
         ar.partner_type,
         CASE
           WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0)
           ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0)
         END::numeric AS projected,
         COALESCE(mb.previous_due, ar.previous_month_due, 0)::numeric AS prev_due,
         (
           COALESCE(mb.previous_due, ar.previous_month_due, 0) +
           CASE
             WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0)
             ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0)
           END
         )::numeric AS total_bill,
         COALESCE(ml.paid, 0)::numeric AS paid,
         COALESCE(ml.discount, 0)::numeric AS discount,
         (
           COALESCE(mb.previous_due, ar.previous_month_due, 0) +
           CASE
             WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0)
             ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0)
           END -
           COALESCE(ml.paid, 0) -
           COALESCE(ml.discount, 0)
         )::numeric AS new_due,
         ar.next_pay_date,
         (mb.reseller_id IS NOT NULL) AS is_generated
       FROM active_resellers ar
       LEFT JOIN month_bills mb ON mb.reseller_id = ar.id
      LEFT JOIN latest_bills lb ON lb.reseller_id = ar.id
      LEFT JOIN month_logs ml ON ml.reseller_id = ar.id
      ORDER BY ar.name ASC`,
      partnerTypeFilter
        ? [monthStart, selectedMonth, partnerTypeFilter]
        : [monthStart, selectedMonth],
    );

    let rows = dataResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      contact: r.contact,
      partner_type: r.partner_type,
      projected: Math.round(parseAmount(r.projected, 0) * 100) / 100,
      prev_due: Math.round(parseAmount(r.prev_due, 0) * 100) / 100,
      total_bill: Math.round(parseAmount(r.total_bill, 0) * 100) / 100,
      paid: Math.round(parseAmount(r.paid, 0) * 100) / 100,
      discount: Math.round(parseAmount(r.discount, 0) * 100) / 100,
      new_due: Math.round(parseAmount(r.new_due, 0) * 100) / 100,
      next_pay_date: r.next_pay_date,
      is_generated: Boolean(r.is_generated),
    }));

    // Recalculate projected for all non-finalized rows so monthly summary stays consistent
    // with invoice/profile calculation even if cached projected values become stale.
    const fallbackCandidates = rows.filter((row) => !row.is_generated);
    if (fallbackCandidates.length) {
      const fallbackResults = await Promise.all(
        fallbackCandidates.map(async (row) => {
          try {
            const breakdown = await calculateMonthlyBillBreakdown(
              row.id,
              selectedMonth,
            );
            return {
              id: row.id,
              projected:
                Math.round(parseAmount(breakdown.total, 0) * 100) / 100,
            };
          } catch (err) {
            console.warn(
              `[MonthlySummary] fallback breakdown failed for reseller=${row.id} month=${selectedMonth}: ${err.message}`,
            );
            return null;
          }
        }),
      );

      const projectedById = new Map(
        fallbackResults
          .filter((item) => item && parseAmount(item.projected, 0) > 0)
          .map((item) => [Number(item.id), Number(item.projected)]),
      );

      if (projectedById.size > 0) {
        rows = rows.map((row) => {
          const projectedFallback = projectedById.get(Number(row.id));
          if (!projectedFallback) return row;

          const prevDue = parseAmount(row.prev_due, 0);
          const paid = parseAmount(row.paid, 0);
          const discount = parseAmount(row.discount, 0);
          const totalBill = prevDue + projectedFallback;
          const newDue = totalBill - paid - discount;

          return {
            ...row,
            projected: Math.round(projectedFallback * 100) / 100,
            total_bill: Math.round(totalBill * 100) / 100,
            new_due: Math.round(newDue * 100) / 100,
          };
        });
      }
    }

    const totals = rows.reduce(
      (acc, row) => ({
        projected: acc.projected + parseAmount(row.projected, 0),
        paid: acc.paid + parseAmount(row.paid, 0),
        discount: acc.discount + parseAmount(row.discount, 0),
        due: acc.due + parseAmount(row.new_due, 0),
      }),
      { projected: 0, paid: 0, discount: 0, due: 0 },
    );

    const payload = {
      month: selectedMonth,
      partner_type: partnerTypeFilter || "all",
      totals: {
        projected: Math.round(totals.projected * 100) / 100,
        paid: Math.round(totals.paid * 100) / 100,
        discount: Math.round(totals.discount * 100) / 100,
        due: Math.round(totals.due * 100) / 100,
      },
      rows,
    };
    setMonthlySummaryCachedByPartner(selectedMonth, partnerTypeFilter, payload);

    const elapsedMs = Date.now() - startedAt;
    const warnThreshold = isProdEnv ? 2000 : 5000;
    if (elapsedMs > warnThreshold) {
      console.warn(
        `[MonthlySummary] month=${selectedMonth} row_count=${rows.length} cache_hit=false monthly_summary_ms=${elapsedMs}`,
      );
    } else {
      console.log(
        `[MonthlySummary] month=${selectedMonth} row_count=${rows.length} cache_hit=false monthly_summary_ms=${elapsedMs}`,
      );
    }

    res.json({
      ...payload,
      meta: {
        generated_at: new Date().toISOString(),
        cache_hit: false,
      },
    });
  } catch (error) {
    console.error("getMonthlySummary:", error);
    res.status(500).json({ message: "Failed to load monthly summary" });
  }
};

const updateMonthlySummaryPayDate = async (req, res) => {
  try {
    await initialize();
    const resellerId = Number(req.body.reseller_id || req.body.id || 0);
    if (!resellerId)
      return res.status(400).json({ message: "reseller_id is required" });

    const rawDate = (req.body.date || "").trim();
    const nextPayDate = rawDate || null;

    const result = await pool.query(
      `UPDATE resellers
       SET next_pay_date = $1
       WHERE id = $2
       RETURNING id, next_pay_date`,
      [nextPayDate, resellerId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    invalidateMonthlySummaryCache();
    res.json({ message: "success", row: result.rows[0] });
  } catch (error) {
    console.error("updateMonthlySummaryPayDate:", error);
    res.status(500).json({ message: "Failed to update pay date" });
  }
};

const generateMonthlyBills = async (req, res) => {
  try {
    await initialize();
    if (MANUAL_BILLING_DISABLED) {
      return res.status(410).json({
        code: "manual_generation_disabled",
        message:
          "Manual bill generation is disabled. Monthly finalization runs automatically at month end.",
      });
    }
    return res.status(400).json({
      message:
        "Manual generation is deprecated. Use internal automation endpoint.",
    });
  } catch (error) {
    console.error("generateMonthlyBills:", error);
    res.status(500).json({ message: "Failed to generate monthly bills" });
  }
};

const finalizeInvoice = async (req, res) => {
  try {
    await initialize();
    if (MANUAL_BILLING_DISABLED) {
      return res.status(410).json({
        code: "manual_finalization_disabled",
        message:
          "Manual final bill generation is disabled. Monthly finalization runs automatically at month end.",
      });
    }
    return res.status(400).json({
      message:
        "Manual finalization is deprecated. Use internal automation endpoint.",
    });
  } catch (error) {
    console.error("finalizeInvoice:", error);
    res.status(500).json({ message: "Failed to generate final bill" });
  }
};

const runAutoFinalizeMonth = async ({
  monthYm,
  initiator = "system",
  source = "scheduler",
  actor = null,
  reqMeta = null,
}) => {
  const client = await pool.connect();
  const summary = {
    run_id: null,
    month: monthStartDateFromYm(monthYm),
    processed_count: 0,
    success_count: 0,
    failed_count: 0,
    already_count: 0,
    failures: [],
  };

  try {
    await initialize();

    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [`billing-auto-finalize:${monthYm}`],
    );
    if (!lockResult.rows[0]?.locked) {
      throw new Error(`Another auto-finalize process is active for ${monthYm}`);
    }

    const completedRun = await client.query(
      `SELECT id
       FROM billing_finalize_runs
       WHERE run_month = $1::date AND status = 'completed'
       ORDER BY id DESC
       LIMIT 1`,
      [monthStartDateFromYm(monthYm)],
    );
    if (completedRun.rows.length) {
      summary.run_id = completedRun.rows[0].id;
      return { ...summary, status: "already_completed" };
    }

    const runInsert = await client.query(
      `INSERT INTO billing_finalize_runs (run_month, status, initiator, source, started_at)
       VALUES ($1::date, 'running', $2, $3, NOW())
       RETURNING id`,
      [monthStartDateFromYm(monthYm), initiator, source],
    );
    summary.run_id = runInsert.rows[0].id;

    const activeResellers = await client.query(
      `SELECT id
       FROM resellers
       WHERE LOWER(COALESCE(status, 'active')) = 'active'
       ORDER BY id ASC`,
    );

    for (
      let i = 0;
      i < activeResellers.rows.length;
      i += AUTO_FINALIZE_DEFAULT_BATCH
    ) {
      const chunk = activeResellers.rows.slice(
        i,
        i + AUTO_FINALIZE_DEFAULT_BATCH,
      );
      for (const row of chunk) {
        summary.processed_count += 1;
        try {
          await client.query("BEGIN");
          const result = await finalizeResellerBill(client, {
            resellerId: row.id,
            monthYm,
            adjustment: 0,
            adjustmentNote: null,
            actor: actor || {
              actor_user_id: null,
              actor_user_name: initiator,
              actor_role: source,
            },
            reqMeta: reqMeta || {},
            source: "auto",
            requestPayload: { month: monthYm, source },
          });

          if (result.status === "finalized") {
            summary.success_count += 1;
            await client.query(
              `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message)
               VALUES ($1, $2, $3, $4, $5)`,
              [summary.run_id, row.id, "success", result.bill_id, "Finalized"],
            );
          } else if (result.status === "already_finalized") {
            summary.already_count += 1;
            await client.query(
              `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                summary.run_id,
                row.id,
                "already",
                result.bill_id || null,
                result.message || "Already finalized",
              ],
            );
          } else {
            summary.failed_count += 1;
            const failMessage = result.message || result.status || "Failed";
            summary.failures.push({
              reseller_id: row.id,
              message: failMessage,
            });
            await client.query(
              `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message)
               VALUES ($1, $2, $3, NULL, $4)`,
              [summary.run_id, row.id, "failed", failMessage],
            );
          }
          await client.query("COMMIT");
        } catch (itemError) {
          await client.query("ROLLBACK");
          summary.failed_count += 1;
          summary.failures.push({
            reseller_id: row.id,
            message: itemError.message,
          });
          await client.query(
            `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message)
             VALUES ($1, $2, $3, NULL, $4)`,
            [summary.run_id, row.id, "failed", itemError.message],
          );
        }
      }
    }

    await client.query(
      `UPDATE billing_finalize_runs
       SET status = $2,
           processed = $3,
           success = $4,
           failed = $5,
           ended_at = NOW(),
           error_summary = $6
       WHERE id = $1`,
      [
        summary.run_id,
        summary.failed_count > 0 ? "partial" : "completed",
        summary.processed_count,
        summary.success_count,
        summary.failed_count,
        summary.failures.length
          ? JSON.stringify(summary.failures.slice(0, 20))
          : null,
      ],
    );

    return summary;
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        `billing-auto-finalize:${monthYm}`,
      ]);
    } catch (_) {
      // ignore unlock errors
    }
    client.release();
  }
};

const internalAutoFinalize = async (req, res) => {
  try {
    await initialize();
    if (!INTERNAL_AUTOMATION_TOKEN) {
      return res
        .status(503)
        .json({ message: "Internal automation token is not configured" });
    }
    const token = String(req.headers["x-internal-token"] || "").trim();
    if (!token || token !== INTERNAL_AUTOMATION_TOKEN) {
      return res.status(401).json({ message: "Invalid internal token" });
    }
    if (!isInternalLocalRequest(req)) {
      return res
        .status(403)
        .json({ message: "Only localhost requests are allowed" });
    }

    const requestedMonth = normalizeMonthYm(
      req.body?.month || req.query?.month,
    );
    const monthYm = requestedMonth || getDefaultAutoFinalizeMonthYm();
    const summary = await runAutoFinalizeMonth({
      monthYm,
      initiator: "internal-api",
      source: "scheduler",
      actor: {
        actor_user_id: null,
        actor_user_name: "system",
        actor_role: "system",
      },
      reqMeta: {
        ip_address: req.ip || null,
        user_agent: req.headers["user-agent"] || null,
        request_id: null,
      },
    });

    res.json({
      run_id: summary.run_id,
      month: summary.month,
      processed_count: summary.processed_count,
      success_count: summary.success_count,
      failed_count: summary.failed_count,
      already_count: summary.already_count,
      failures: summary.failures.slice(0, 10),
    });
  } catch (error) {
    console.error("internalAutoFinalize:", error);
    res
      .status(500)
      .json({ message: "Auto finalize failed", error: error.message });
  }
};

const internalAutoFinalizeStatus = async (req, res) => {
  try {
    await initialize();
    if (!INTERNAL_AUTOMATION_TOKEN) {
      return res
        .status(503)
        .json({ message: "Internal automation token is not configured" });
    }
    const token = String(req.headers["x-internal-token"] || "").trim();
    if (!token || token !== INTERNAL_AUTOMATION_TOKEN) {
      return res.status(401).json({ message: "Invalid internal token" });
    }
    if (!isInternalLocalRequest(req)) {
      return res
        .status(403)
        .json({ message: "Only localhost requests are allowed" });
    }

    const runId = Number(req.query?.run_id || req.params?.runId || 0);
    if (!runId) return res.status(400).json({ message: "run_id is required" });

    const runResult = await pool.query(
      `SELECT id, run_month, started_at, ended_at, status, processed, success, failed, initiator, source, error_summary
       FROM billing_finalize_runs
       WHERE id = $1
       LIMIT 1`,
      [runId],
    );
    if (!runResult.rows.length)
      return res.status(404).json({ message: "Run not found" });

    const itemsResult = await pool.query(
      `SELECT reseller_id, status, bill_id, message, created_at
       FROM billing_finalize_run_items
       WHERE run_id = $1
       ORDER BY id DESC
       LIMIT 100`,
      [runId],
    );

    res.json({
      run: runResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error("internalAutoFinalizeStatus:", error);
    res.status(500).json({ message: "Failed to load auto finalize status" });
  }
};

const getInvoice = async (req, res) => {
  try {
    await initialize();
    const { resellerId } = req.params;
    const monthParam =
      String(req.query.month || "").slice(0, 7) || getDhakaMonthYm();

    const resellerResult = await pool.query(
      `SELECT
        id,
        user_id AS reseller_code,
        COALESCE(reseller_name, company_name) AS name,
        reseller_name,
        company_name,
        contact_no AS phone,
        pop_location,
        COALESCE(previous_month_due, 0)::numeric AS due_amount,
        COALESCE(current_projected_bill, 0)::numeric AS projected_bill,
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
        ${hasResellerOtcAppliedMonthColumn ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        COALESCE(real_ip_count,0)::int AS real_ip_count,
        COALESCE(real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(status, 'active') AS status,
        created_at,
        ${joiningDateExpr()} AS joining_date
       FROM resellers WHERE id = $1`,
      [resellerId],
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const reseller = resellerResult.rows[0];
    const created = parseYMD(reseller.joining_date || reseller.created_at);
    const createdYM = created
      ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`
      : monthParam;
    const effectiveYM = monthParam < createdYM ? createdYM : monthParam;
    const monthStart = `${effectiveYM}-01`;

    const billResult = await pool.query(
      `SELECT id, reseller_id, bill_month,
              amount AS final_amount, adjustment, adjustment_note,
              bill_details, previous_due, created_at
       FROM monthly_bills
       WHERE reseller_id = $1 AND bill_month = $2::date`,
      [resellerId, monthStart],
    );

    const paidResult = await pool.query(
      `SELECT
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'payment'),0)::numeric AS total_paid,
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'discount'),0)::numeric AS total_discount
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) IN ('payment','discount')`,
      [resellerId, effectiveYM],
    );

    const logResult = await pool.query(
      `SELECT id, reseller_id, change_desc AS note,
              transaction_amount AS amount, effective_date, created_at
       FROM billing_logs
       WHERE reseller_id = $1
         AND DATE_TRUNC('month', COALESCE(effective_date, created_at)) = DATE_TRUNC('month', $2::date)
       ORDER BY created_at DESC`,
      [resellerId, monthStart],
    );

    const bill = billResult.rows[0] || null;
    let items = [];
    let itemSource = "calculated_fallback";
    if (bill) {
      const snapshot = parseBillDetailsSnapshot(
        bill.bill_details,
        `bill_id=${bill.id}`,
      );
      if (snapshot.valid) {
        items = snapshot.items;
        itemSource = "snapshot";
      } else {
        const recalculated = await calculateMonthlyBillBreakdown(
          resellerId,
          effectiveYM,
          reseller,
        );
        items = recalculated.items || [];
      }
    } else {
      const recalculated = await calculateMonthlyBillBreakdown(
        resellerId,
        effectiveYM,
        reseller,
      );
      items = recalculated.items || [];
    }

    res.json({
      reseller,
      month: monthStart,
      bill,
      items,
      total_paid: parseFloat(paidResult.rows[0]?.total_paid || 0),
      total_discount: parseFloat(paidResult.rows[0]?.total_discount || 0),
      logs: logResult.rows,
      meta: { item_source: itemSource },
    });
  } catch (error) {
    console.error("getInvoice:", error);
    res.status(500).json({ message: "Failed to load invoice" });
  }
};

const getMailTransport = () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

const getFrontendBaseUrl = () => {
  const candidate = String(process.env.FRONTEND_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!candidate) return "https://office.speednetkhulna.com";
  return candidate;
};

const parseSnapshotDataUrl = (raw) => {
  const dataUrl = String(raw || "").trim();
  if (!dataUrl) return null;
  const match = dataUrl.match(
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\n\r]+)$/,
  );
  if (!match) return null;
  const mime = match[1];
  const base64Data = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 12 * 1024 * 1024) return null;
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  return { mime, ext, buffer };
};

const sendInvoiceEmailByReseller = async (req, res) => {
  try {
    await initialize();
    const { resellerId } = req.params;
    const toEmail = String(req.body?.to_email || "").trim();
    const monthParam =
      String(req.body?.month || "").slice(0, 7) || getDhakaMonthYm();

    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ message: "Valid to_email is required" });
    }

    const resellerResult = await pool.query(
      `SELECT id, COALESCE(reseller_name, company_name) AS name
       FROM resellers
       WHERE id = $1
       LIMIT 1`,
      [resellerId],
    );
    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const monthStart = `${monthParam}-01`;
    const billResult = await pool.query(
      `SELECT id
       FROM monthly_bills
       WHERE reseller_id = $1 AND bill_month = $2::date
       LIMIT 1`,
      [resellerId, monthStart],
    );
    const billId = billResult.rows[0]?.id || null;

    const transport = getMailTransport();
    if (!transport) {
      return res.status(503).json({
        message:
          "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optional SMTP_SECURE.",
      });
    }

    const frontend = getFrontendBaseUrl();
    const dynamicLink = `${frontend}/invoice?resellerId=${encodeURIComponent(resellerId)}&month=${encodeURIComponent(monthParam)}`;
    const staticLink = billId
      ? `${frontend}/view-static-invoice?id=${encodeURIComponent(billId)}`
      : null;
    const resellerName =
      resellerResult.rows[0].name || `Reseller #${resellerId}`;
    const fromAddress = String(
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "billing@speednetkhulna.com",
    ).trim();
    const snapshot = parseSnapshotDataUrl(req.body?.snapshot_data_url);
    if (req.body?.snapshot_data_url && !snapshot) {
      return res.status(400).json({
        message:
          "Invalid snapshot_data_url (expected data:image/png;base64,...)",
      });
    }
    const attachmentName = `invoice_${resellerId}_${monthParam}.${snapshot?.ext || "png"}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2 style="margin:0 0 12px">Invoice Link - ${resellerName}</h2>
        <p style="margin:0 0 8px">Billing Month: <strong>${monthParam}</strong></p>
        <p style="margin:0 0 8px"><a href="${dynamicLink}">Open Invoice</a></p>
        ${staticLink ? `<p style="margin:0 0 8px"><a href="${staticLink}">Open Final Static Invoice</a></p>` : ""}
        ${snapshot ? `<p style="margin:0 0 8px">Attached: full invoice snapshot (${attachmentName})</p>` : ""}
        <p style="margin-top:16px;color:#6b7280">Generated from Speed Net Khulna billing system.</p>
      </div>
    `;

    await transport.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `Invoice ${monthParam} - ${resellerName}`,
      html,
      attachments: snapshot
        ? [
          {
            filename: attachmentName,
            content: snapshot.buffer,
            contentType: snapshot.mime,
          },
        ]
        : [],
    });

    res.json({
      message: "Invoice email sent successfully",
      to_email: toEmail,
      month: monthParam,
      links: { dynamic: dynamicLink, static: staticLink },
      attached_snapshot: Boolean(snapshot),
    });
  } catch (error) {
    console.error("sendInvoiceEmailByReseller:", error);
    res.status(500).json({ message: "Failed to send invoice email" });
  }
};

const addDiscount = async (req, res) => {
  try {
    await initialize();
    const resellerId = Number(req.params?.id || req.body?.reseller_id || 0);
    const amount = parseAmount(req.body?.amount, 0);
    const note = String(req.body?.note || "").trim();
    const effectiveDateRaw = String(req.body?.effective_date || "").trim();

    if (!resellerId)
      return res.status(400).json({ message: "Invalid reseller id" });
    if (amount <= 0)
      return res
        .status(400)
        .json({ message: "Discount amount must be greater than 0" });
    if (note.length < 3)
      return res.status(400).json({ message: "Discount note is required" });

    req.body = {
      reseller_id: resellerId,
      log_type: "discount",
      amount,
      note: `Discount: ${note}`,
      effective_date: effectiveDateRaw || new Date().toISOString(),
    };
    return addBillingLog(req, res);
  } catch (error) {
    console.error("addDiscount:", error);
    return res.status(500).json({ message: "Failed to add discount" });
  }
};
const getInvoiceByBillId = async (req, res) => {
  try {
    await initialize();
    const { billId } = req.params;

    const billResult = await pool.query(
      `SELECT id, reseller_id, bill_month,
              amount AS final_amount, adjustment, adjustment_note,
              bill_details, previous_due, created_at
       FROM monthly_bills
       WHERE id = $1`,
      [billId],
    );

    if (!billResult.rows.length) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const bill = billResult.rows[0];
    const resellerId = bill.reseller_id;
    const billMonthDate = parseYMD(bill.bill_month);
    const monthStart = billMonthDate
      ? `${billMonthDate.getFullYear()}-${String(billMonthDate.getMonth() + 1).padStart(2, "0")}-${String(billMonthDate.getDate()).padStart(2, "0")}`
      : String(bill.bill_month).slice(0, 10);
    const monthYM = monthStart.slice(0, 7);

    const resellerResult = await pool.query(
      `SELECT
        id,
        user_id AS reseller_code,
        COALESCE(reseller_name, company_name) AS name,
        reseller_name,
        company_name,
        contact_no AS phone,
        pop_location,
        COALESCE(previous_month_due, 0)::numeric AS due_amount,
        COALESCE(current_projected_bill, 0)::numeric AS projected_bill,
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
        ${hasResellerOtcAppliedMonthColumn ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        COALESCE(real_ip_count,0)::int AS real_ip_count,
        COALESCE(real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(status, 'active') AS status,
        created_at,
        ${joiningDateExpr()} AS joining_date
       FROM resellers WHERE id = $1`,
      [resellerId],
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const paidResult = await pool.query(
      `SELECT
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'payment'),0)::numeric AS total_paid,
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) = 'discount'),0)::numeric AS total_discount
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(
           to_jsonb(billing_logs)->>'log_type',
           CASE
             WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
             WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
             ELSE 'adjustment'
           END
         ) IN ('payment','discount')`,
      [resellerId, monthYM],
    );

    const logResult = await pool.query(
      `SELECT id, reseller_id, change_desc AS note,
              transaction_amount AS amount, effective_date, created_at
       FROM billing_logs
       WHERE reseller_id = $1
         AND DATE_TRUNC('month', COALESCE(effective_date, created_at)) = DATE_TRUNC('month', $2::date)
       ORDER BY created_at DESC`,
      [resellerId, monthStart],
    );

    const snapshot = parseBillDetailsSnapshot(
      bill.bill_details,
      `bill_id=${bill.id}`,
    );
    let items = snapshot.items;
    let itemSource = "snapshot";
    if (!snapshot.valid) {
      const recalculated = await calculateMonthlyBillBreakdown(
        resellerId,
        monthYM,
        resellerResult.rows[0],
      );
      items = recalculated.items || [];
      itemSource = "calculated_fallback";
    }

    res.json({
      reseller: resellerResult.rows[0],
      month: monthStart,
      bill,
      items,
      total_paid: parseFloat(paidResult.rows[0]?.total_paid || 0),
      total_discount: parseFloat(paidResult.rows[0]?.total_discount || 0),
      logs: logResult.rows,
      meta: { item_source: itemSource },
    });
  } catch (error) {
    console.error("getInvoiceByBillId:", error);
    res.status(500).json({ message: "Failed to load static invoice" });
  }
};

const sendInvoiceEmailByBillId = async (req, res) => {
  try {
    await initialize();
    const { billId } = req.params;
    const toEmail = String(req.body?.to_email || "").trim();
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ message: "Valid to_email is required" });
    }

    const billResult = await pool.query(
      `SELECT mb.id, mb.bill_month, mb.reseller_id,
              COALESCE(r.reseller_name, r.company_name) AS reseller_name
       FROM monthly_bills mb
       JOIN resellers r ON r.id = mb.reseller_id
       WHERE mb.id = $1
       LIMIT 1`,
      [billId],
    );
    if (!billResult.rows.length) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const bill = billResult.rows[0];
    const monthYm = String(bill.bill_month).slice(0, 7);
    const frontend = getFrontendBaseUrl();
    const staticLink = `${frontend}/view-static-invoice?id=${encodeURIComponent(billId)}`;
    const dynamicLink = `${frontend}/invoice?resellerId=${encodeURIComponent(bill.reseller_id)}&month=${encodeURIComponent(monthYm)}`;

    const transport = getMailTransport();
    if (!transport) {
      return res.status(503).json({
        message:
          "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optional SMTP_SECURE.",
      });
    }

    const resellerName = bill.reseller_name || `Reseller #${bill.reseller_id}`;
    const fromAddress = String(
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "billing@speednetkhulna.com",
    ).trim();
    const snapshot = parseSnapshotDataUrl(req.body?.snapshot_data_url);
    if (req.body?.snapshot_data_url && !snapshot) {
      return res.status(400).json({
        message:
          "Invalid snapshot_data_url (expected data:image/png;base64,...)",
      });
    }
    const attachmentName = `invoice_bill_${billId}_${monthYm}.${snapshot?.ext || "png"}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2 style="margin:0 0 12px">Final Static Invoice - ${resellerName}</h2>
        <p style="margin:0 0 8px">Billing Month: <strong>${monthYm}</strong></p>
        <p style="margin:0 0 8px"><a href="${staticLink}">Open Final Static Invoice</a></p>
        <p style="margin:0 0 8px"><a href="${dynamicLink}">Open Invoice Page</a></p>
        ${snapshot ? `<p style="margin:0 0 8px">Attached: full invoice snapshot (${attachmentName})</p>` : ""}
        <p style="margin-top:16px;color:#6b7280">Generated from Speed Net Khulna billing system.</p>
      </div>
    `;

    await transport.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `Final Invoice ${monthYm} - ${resellerName}`,
      html,
      attachments: snapshot
        ? [
          {
            filename: attachmentName,
            content: snapshot.buffer,
            contentType: snapshot.mime,
          },
        ]
        : [],
    });

    res.json({
      message: "Static invoice email sent successfully",
      to_email: toEmail,
      bill_id: Number(billId),
      links: { static: staticLink, dynamic: dynamicLink },
      attached_snapshot: Boolean(snapshot),
    });
  } catch (error) {
    console.error("sendInvoiceEmailByBillId:", error);
    res.status(500).json({ message: "Failed to send static invoice email" });
  }
};
// ─── Rate Change Log ────────────────────────────────────────────────────────

let rateChangeLogTableReady = false;

const initRateChangeLogTable = async () => {
  if (rateChangeLogTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reseller_rate_change_logs (
      id            BIGSERIAL PRIMARY KEY,
      reseller_id   INTEGER NOT NULL,
      changed_by_id INTEGER NULL,
      changed_by    TEXT NULL,
      changed_by_role TEXT NULL,
      effective_date DATE NOT NULL,
      note          TEXT NULL,
      rate_iig      NUMERIC(14,2) NULL,
      rate_bdix     NUMERIC(14,2) NULL,
      rate_ggc      NUMERIC(14,2) NULL,
      rate_fna      NUMERIC(14,2) NULL,
      rate_cdn      NUMERIC(14,2) NULL,
      rate_bcdn     NUMERIC(14,2) NULL,
      rate_nttn     NUMERIC(14,2) NULL,
      prev_rate_iig  NUMERIC(14,2) NULL,
      prev_rate_bdix NUMERIC(14,2) NULL,
      prev_rate_ggc  NUMERIC(14,2) NULL,
      prev_rate_fna  NUMERIC(14,2) NULL,
      prev_rate_cdn  NUMERIC(14,2) NULL,
      prev_rate_bcdn NUMERIC(14,2) NULL,
      prev_rate_nttn NUMERIC(14,2) NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reseller_rate_change_logs_reseller ON reseller_rate_change_logs (reseller_id, effective_date DESC)`);
  rateChangeLogTableReady = true;
};

const changeResellerRate = async (req, res) => {
  try {
    await initialize();
    await initRateChangeLogTable();
    const { id } = req.params;

    const {
      effective_date,
      note,
      rate_iig,
      rate_bdix,
      rate_ggc,
      rate_fna,
      rate_cdn,
      rate_bcdn,
      rate_nttn,
    } = req.body;

    if (!effective_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(effective_date))) {
      return res.status(400).json({ message: "effective_date (YYYY-MM-DD) is required" });
    }

    const hasAnyRate = [rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn]
      .some((v) => v !== undefined && v !== null && v !== '');
    if (!hasAnyRate) {
      return res.status(400).json({ message: "At least one rate field is required" });
    }

    // Fetch current rates
    const beforeResult = await pool.query(
      `SELECT rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn
       FROM resellers WHERE id = $1`,
      [id],
    );
    if (!beforeResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }
    const before = beforeResult.rows[0];

    const parseR = (v, fallback) => (v !== undefined && v !== null && v !== '') ? parseAmount(v, 0) : fallback;

    const newRates = {
      rate_iig: parseR(rate_iig, Number(before.rate_iig || 0)),
      rate_bdix: parseR(rate_bdix, Number(before.rate_bdix || 0)),
      rate_ggc: parseR(rate_ggc, Number(before.rate_ggc || 0)),
      rate_fna: parseR(rate_fna, Number(before.rate_fna || 0)),
      rate_cdn: parseR(rate_cdn, Number(before.rate_cdn || 0)),
      rate_bcdn: parseR(rate_bcdn, Number(before.rate_bcdn || 0)),
      rate_nttn: parseR(rate_nttn, Number(before.rate_nttn || 0)),
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update resellers table
      await client.query(
        `UPDATE resellers SET
          rate_iig  = $1,
          rate_bdix = $2,
          rate_ggc  = $3,
          rate_fna  = $4,
          rate_cdn  = $5,
          rate_bcdn = $6,
          rate_nttn = $7,
          last_activity_date = NOW()
         WHERE id = $8`,
        [
          newRates.rate_iig, newRates.rate_bdix, newRates.rate_ggc,
          newRates.rate_fna, newRates.rate_cdn, newRates.rate_bcdn,
          newRates.rate_nttn, id,
        ],
      );

      // Insert rate change log
      const logResult = await client.query(
        `INSERT INTO reseller_rate_change_logs
          (reseller_id, changed_by_id, changed_by, changed_by_role, effective_date, note,
           rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
           prev_rate_iig, prev_rate_bdix, prev_rate_ggc, prev_rate_fna, prev_rate_cdn, prev_rate_bcdn, prev_rate_nttn)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          id,
          req.user?.id || null,
          req.user?.full_name || null,
          req.user?.role_name || req.user?.role || null,
          effective_date,
          note || null,
          newRates.rate_iig, newRates.rate_bdix, newRates.rate_ggc,
          newRates.rate_fna, newRates.rate_cdn, newRates.rate_bcdn, newRates.rate_nttn,
          Number(before.rate_iig || 0), Number(before.rate_bdix || 0), Number(before.rate_ggc || 0),
          Number(before.rate_fna || 0), Number(before.rate_cdn || 0), Number(before.rate_bcdn || 0),
          Number(before.rate_nttn || 0),
        ],
      );

      // Financial audit log
      const actor = getActor(req);
      const meta = getReqMeta(req);
      const fieldChanges = {};
      ['rate_iig', 'rate_bdix', 'rate_ggc', 'rate_fna', 'rate_cdn', 'rate_bcdn', 'rate_nttn'].forEach((k) => {
        const prev = Number(before[k] || 0);
        const next = newRates[k];
        if (prev !== next) fieldChanges[k] = { before: prev, after: next };
      });

      await logResellerFinancialChange(client, {
        reseller_id: id,
        ...actor,
        action_type: 'RATE_CHANGE',
        reference_table: 'reseller_rate_change_logs',
        reference_id: logResult.rows[0].id,
        field_changes: fieldChanges,
        note: `Rate change effective ${effective_date}${note ? `: ${note}` : ''}`,
        request_payload: req.body,
        ...meta,
      });

      await client.query('COMMIT');

      // Refresh projected bill
      try {
        await refreshProjectedBillForCurrentMonth(id);
      } catch (_) { /* best-effort */ }

      res.json({ success: true, log_id: logResult.rows[0].id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("changeResellerRate:", error);
    res.status(500).json({ message: "Failed to save rate change" });
  }
};

const getResellerRateChangeLogs = async (req, res) => {
  try {
    await initRateChangeLogTable();
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit || 20), 100);

    const result = await pool.query(
      `SELECT id, reseller_id, changed_by, changed_by_role, effective_date, note,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              prev_rate_iig, prev_rate_bdix, prev_rate_ggc, prev_rate_fna, prev_rate_cdn, prev_rate_bcdn, prev_rate_nttn,
              created_at
       FROM reseller_rate_change_logs
       WHERE reseller_id = $1
       ORDER BY effective_date DESC, created_at DESC
       LIMIT $2`,
      [id, limit],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("getResellerRateChangeLogs:", error);
    res.status(500).json({ message: "Failed to load rate change logs" });
  }
};

module.exports = {
  listResellers,
  getPartnerSheetList,
  ingestPartnerSheetWebhook,
  createReseller,
  getResellerProfile,
  getResellerProfileDetails,
  updateReseller,
  getStatusNoc,
  createBandwidthRequest,
  listBandwidthRequests,
  reviewBandwidthRequest,
  applyApprovedRequest,
  getBillingLogs,
  getFinancialAuditLogs,
  addBillingLog,
  addDiscount,
  getMonthlySummary,
  updateMonthlySummaryPayDate,
  generateMonthlyBills,
  finalizeInvoice,
  internalAutoFinalize,
  internalAutoFinalizeStatus,
  getInvoice,
  getInvoiceByBillId,
  sendInvoiceEmailByReseller,
  sendInvoiceEmailByBillId,
  syncProjectedBillsForCurrentMonth,
  refreshProjectedBillForCurrentMonth,
  changeResellerRate,
  getResellerRateChangeLogs,
};
