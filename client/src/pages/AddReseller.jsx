import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createReseller } from "../services/resellerService";

// ── Initial form state ────────────────────────────────────────────────────────
const init = {
  reseller_name: "",
  company_name: "",
  user_id: "",
  pop_location: "",
  latitude: "",
  longitude: "",
  contact_no: "",
  password: "",
  joining_date: new Date().toISOString().slice(0, 10),
  iig_bw: "0",
  bdix_bw: "0",
  ggc_bw: "0",
  fna_bw: "0",
  cdn_bw: "0",
  bcdn_bw: "0",
  nttn_bw: "0",
  rate_iig: "0",
  rate_bdix: "0",
  rate_ggc: "0",
  rate_fna: "0",
  rate_cdn: "0",
  rate_bcdn: "0",
  rate_nttn: "0",
  nttn_type: [],
  nttn_link: "",
  connection_type: [],
  initial_payment: "0",
  security_deposit: "0",
  otc_charge: "0",
  real_ip_count: "0",
  real_ip_price: "0",
  partner_type: "distribution_partner",
  channel_user_count: "0",
  profit_share_percentage: "0",
};

const num = (v) => Number(v || 0);

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

// ── UI Config ─────────────────────────────────────────────────────────────────
const PARTNER_TYPES = [
  {
    value: "mac_partner",
    label: "MAC Partner",
    icon: "fas fa-server",
    desc: "NTTN-only bandwidth",
    color: "#7c3aed",
    light: "#f5f3ff",
    border: "#c4b5fd",
    gradient: "135deg, #7c3aed, #9f67fa",
  },
  {
    value: "distribution_partner",
    label: "Distribution Partner",
    icon: "fas fa-network-wired",
    desc: "Full bandwidth package",
    color: "#2563eb",
    light: "#eff6ff",
    border: "#bfdbfe",
    gradient: "135deg, #2563eb, #60a5fa",
  },
  {
    value: "channel_partner",
    label: "Channel Partner",
    icon: "fas fa-handshake",
    desc: "Reseller / sub-partner",
    color: "#059669",
    light: "#ecfdf5",
    border: "#a7f3d0",
    gradient: "135deg, #059669, #34d399",
  },
];

const BW_ROWS = [
  {
    bwKey: "iig_bw",
    rateKey: "rate_iig",
    label: "IIG",
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    bwKey: "bdix_bw",
    rateKey: "rate_bdix",
    label: "BDIX",
    color: "#059669",
    bg: "#ecfdf5",
  },
  {
    bwKey: "ggc_bw",
    rateKey: "rate_ggc",
    label: "GGC",
    color: "#d97706",
    bg: "#fffbeb",
  },
  {
    bwKey: "fna_bw",
    rateKey: "rate_fna",
    label: "FNA",
    color: "#0891b2",
    bg: "#ecfeff",
  },
  {
    bwKey: "cdn_bw",
    rateKey: "rate_cdn",
    label: "CDN",
    color: "#dc2626",
    bg: "#fef2f2",
  },
  {
    bwKey: "bcdn_bw",
    rateKey: "rate_bcdn",
    label: "Other",
    color: "#6b7280",
    bg: "#f9fafb",
  },
  {
    bwKey: "nttn_bw",
    rateKey: "rate_nttn",
    label: "NTTN",
    color: "#374151",
    bg: "#f3f4f6",
    isNttn: true,
  },
];
// ─────────────────────────────────────────────────────────────────────────────

// Small helper: section card wrapper
const SectionCard = ({ children, style }) => (
  <div
    style={{
      background: "#fff",
      borderRadius: 16,
      padding: "1.5rem",
      marginBottom: "1.25rem",
      boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      ...style,
    }}
  >
    {children}
  </div>
);

// Small helper: section header row (icon box + title + subtitle)
const SectionHeader = ({
  iconClass,
  iconBg,
  iconColor,
  title,
  subtitle,
  right,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "1rem",
      paddingBottom: "0.75rem",
      borderBottom: "1px solid #f3f4f6",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <i
          className={iconClass}
          style={{ color: iconColor, fontSize: "0.9rem" }}
        />
      </div>
      <div>
        <h6
          style={{
            margin: 0,
            fontWeight: 700,
            color: "#111827",
            fontSize: "0.95rem",
          }}
        >
          {title}
        </h6>
        {subtitle && (
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.76rem" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {right}
  </div>
);

// Small helper: field label
const FieldLabel = ({ children, required: req }) => (
  <label
    style={{
      fontSize: "0.79rem",
      fontWeight: 600,
      color: "#374151",
      marginBottom: 5,
      display: "block",
    }}
  >
    {children}
    {req && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
  </label>
);

// Small helper: input-group with prefix icon or text
const InputWithIcon = ({ iconClass, prefix, children }) => (
  <div className="input-group" style={{ flexWrap: "nowrap" }}>
    {iconClass && (
      <span
        className="input-group-text"
        style={{
          background: "#f9fafb",
          borderColor: "#e5e7eb",
          color: "#9ca3af",
          fontSize: "0.82rem",
        }}
      >
        <i className={iconClass} />
      </span>
    )}
    {prefix && (
      <span
        className="input-group-text"
        style={{
          background: "#fffbeb",
          borderColor: "#e5e7eb",
          color: "#d97706",
          fontWeight: 700,
          fontSize: "0.9rem",
        }}
      >
        {prefix}
      </span>
    )}
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const AddReseller = () => {
  const [searchParams] = useSearchParams();
  const requestedPartnerType = normalizePartnerType(
    searchParams.get("partner_type"),
  );
  const [form, setForm] = useState(() => ({
    ...init,
    partner_type: requestedPartnerType || init.partner_type,
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentPartnerType =
    normalizePartnerType(form.partner_type) || "distribution_partner";
  const isMacPartner = currentPartnerType === "mac_partner";
  const isChannelPartner = currentPartnerType === "channel_partner";

  const activeType =
    PARTNER_TYPES.find((t) => t.value === currentPartnerType) ||
    PARTNER_TYPES[1];
  const visibleBwRows = isMacPartner
    ? BW_ROWS.filter((r) => r.isNttn)
    : BW_ROWS;

  // Projected bill calculation (unchanged logic)
  const projected = useMemo(() => {
    const totalRate =
      num(form.iig_bw) * num(form.rate_iig) +
      num(form.bdix_bw) * num(form.rate_bdix) +
      num(form.ggc_bw) * num(form.rate_ggc) +
      num(form.fna_bw) * num(form.rate_fna) +
      num(form.cdn_bw) * num(form.rate_cdn) +
      num(form.bcdn_bw) * num(form.rate_bcdn) +
      num(form.nttn_bw) * num(form.rate_nttn) +
      num(form.real_ip_count) * num(form.real_ip_price);

    const now = new Date();
    const join = new Date(`${form.joining_date}T00:00:00`);
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const joinYM = `${join.getFullYear()}-${String(join.getMonth() + 1).padStart(2, "0")}`;
    if (joinYM > currentYM) return 0;
    if (joinYM === currentYM) {
      const daysInMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
      ).getDate();
      const daysActive = daysInMonth - join.getDate() + 1;
      return (
        (totalRate / daysInMonth) * Math.max(0, daysActive) +
        num(form.otc_charge)
      );
    }
    return totalRate;
  }, [form]);

  // BW breakdown for summary sidebar
  const bwBreakdown = useMemo(
    () =>
      visibleBwRows
        .filter((r) => num(form[r.bwKey]) > 0)
        .map((r) => ({
          label: r.label,
          color: r.color,
          bw: num(form[r.bwKey]),
          cost: num(form[r.bwKey]) * num(form[r.rateKey]),
        })),
    [form, visibleBwRows],
  );

  const toggleValue = (key, value) => {
    const s = new Set(form[key]);
    if (s.has(value)) s.delete(value);
    else s.add(value);
    setForm({ ...form, [key]: Array.from(s) });
  };

  const handleReset = () =>
    setForm({
      ...init,
      joining_date: new Date().toISOString().slice(0, 10),
      partner_type: requestedPartnerType || init.partner_type,
    });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createReseller({
        ...form,
        name: form.reseller_name,
        reseller_code: form.user_id,
        phone: form.contact_no,
        nttn_capacity: form.nttn_bw,
        partner_type:
          normalizePartnerType(form.partner_type) || "distribution_partner",
        status: "active",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      handleReset();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || "Partner profile save failed.";
      window.alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const f = (v) => setForm(v); // shorthand

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1400 }}>
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${activeType.color}12 0%, #ffffff 70%)`,
          borderRadius: 16,
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
          borderLeft: `4px solid ${activeType.color}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          transition: "border-color 0.3s ease, background 0.3s ease",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <Link
              to="/reseller-list"
              style={{
                color: "#9ca3af",
                fontSize: "0.78rem",
                textDecoration: "none",
              }}
            >
              Partner List
            </Link>
            <span style={{ color: "#d1d5db" }}>›</span>
            <span
              style={{
                color: activeType.color,
                fontSize: "0.78rem",
                fontWeight: 600,
              }}
            >
              New Partner
            </span>
          </div>
          <h4
            style={{
              margin: 0,
              fontWeight: 800,
              color: "#111827",
              letterSpacing: -0.5,
            }}
          >
            New Partner Profile
          </h4>
          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "0.82rem",
              marginTop: 2,
            }}
          >
            Fill in all required details to register a new network partner
          </p>
        </div>
        <Link
          to="/reseller-list"
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            color: "#374151",
            borderRadius: 10,
            padding: "0.5rem 1.25rem",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.84rem",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <i className="fas fa-arrow-left" style={{ fontSize: "0.73rem" }} />
          Back to List
        </Link>
      </div>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <form onSubmit={submit}>
        <div className="row g-4 align-items-start">
          {/* ═══ Left: Form Sections ═══════════════════════════════════════════ */}
          <div className="col-lg-8">
            {/* ── Partner Type Cards ───────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                iconClass="fas fa-tag"
                iconBg="#eff6ff"
                iconColor="#2563eb"
                title="Partner Type"
                subtitle="Select the category of this partner"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.75rem",
                }}
              >
                {PARTNER_TYPES.map((pt) => {
                  const sel = currentPartnerType === pt.value;
                  return (
                    <div
                      key={pt.value}
                      onClick={() =>
                        setForm({ ...form, partner_type: pt.value })
                      }
                      style={{
                        border: `2px solid ${sel ? pt.color : "#e5e7eb"}`,
                        borderRadius: 14,
                        padding: "1.1rem 0.75rem",
                        cursor: "pointer",
                        background: sel ? pt.light : "#fafafa",
                        transition: "all 0.2s ease",
                        textAlign: "center",
                        boxShadow: sel ? `0 4px 16px ${pt.color}28` : "none",
                        transform: sel ? "translateY(-2px)" : "none",
                        userSelect: "none",
                      }}
                    >
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: "50%",
                          background: sel
                            ? `linear-gradient(${pt.gradient})`
                            : "#f3f4f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 0.6rem",
                          transition: "all 0.2s ease",
                          boxShadow: sel ? `0 4px 12px ${pt.color}40` : "none",
                        }}
                      >
                        <i
                          className={pt.icon}
                          style={{
                            color: sel ? "#fff" : "#9ca3af",
                            fontSize: "1.1rem",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: sel ? pt.color : "#374151",
                          fontSize: "0.86rem",
                          marginBottom: 2,
                        }}
                      >
                        {pt.label}
                      </div>
                      <div
                        style={{
                          color: "#9ca3af",
                          fontSize: "0.73rem",
                          marginBottom: sel ? 8 : 0,
                        }}
                      >
                        {pt.desc}
                      </div>
                      {sel && (
                        <span
                          style={{
                            display: "inline-block",
                            background: pt.color,
                            color: "#fff",
                            borderRadius: 6,
                            padding: "2px 10px",
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            letterSpacing: 0.3,
                          }}
                        >
                          ✓ Selected
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* ── Basic Information ────────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                iconClass="fas fa-user-circle"
                iconBg="#eff6ff"
                iconColor="#2563eb"
                title="Basic Information"
                subtitle="Partner identity, location and contact"
              />
              <div className="row g-3">
                <div className="col-md-6">
                  <FieldLabel required>Partner Name</FieldLabel>
                  <InputWithIcon iconClass="fas fa-user">
                    <input
                      required
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="Full partner name"
                      value={form.reseller_name}
                      onChange={(e) =>
                        f({ ...form, reseller_name: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-6">
                  <FieldLabel>Company Name</FieldLabel>
                  <InputWithIcon iconClass="fas fa-building">
                    <input
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="Company / organization"
                      value={form.company_name}
                      onChange={(e) =>
                        f({ ...form, company_name: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-4">
                  <FieldLabel>User ID / Code</FieldLabel>
                  <InputWithIcon iconClass="fas fa-id-badge">
                    <input
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="e.g. SNK-001"
                      value={form.user_id}
                      onChange={(e) => f({ ...form, user_id: e.target.value })}
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-8">
                  <FieldLabel>POP Location</FieldLabel>
                  <InputWithIcon iconClass="fas fa-map-marker-alt">
                    <input
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="Point of Presence location"
                      value={form.pop_location}
                      onChange={(e) =>
                        f({ ...form, pop_location: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                <div className="col-6 col-md-3">
                  <FieldLabel>Latitude</FieldLabel>
                  <input
                    className="form-control"
                    style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                    placeholder="22.8456"
                    value={form.latitude}
                    onChange={(e) => f({ ...form, latitude: e.target.value })}
                  />
                </div>
                <div className="col-6 col-md-3">
                  <FieldLabel>Longitude</FieldLabel>
                  <input
                    className="form-control"
                    style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                    placeholder="89.5403"
                    value={form.longitude}
                    onChange={(e) => f({ ...form, longitude: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <FieldLabel>Contact Number</FieldLabel>
                  <InputWithIcon iconClass="fas fa-phone">
                    <input
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="01XXXXXXXXX"
                      value={form.contact_no}
                      onChange={(e) =>
                        f({ ...form, contact_no: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-6">
                  <FieldLabel>Password</FieldLabel>
                  <InputWithIcon iconClass="fas fa-lock">
                    <input
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="Default: contact number"
                      value={form.password}
                      onChange={(e) => f({ ...form, password: e.target.value })}
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-4">
                  <FieldLabel required>Joining Date</FieldLabel>
                  <InputWithIcon iconClass="fas fa-calendar-alt">
                    <input
                      type="date"
                      required
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      value={form.joining_date}
                      onChange={(e) =>
                        f({ ...form, joining_date: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>

                {/* Channel Partner only: joining user count */}
                {isChannelPartner && (
                  <div className="col-md-4">
                    <FieldLabel>যোগদানকারী User সংখ্যা</FieldLabel>
                    <InputWithIcon iconClass="fas fa-users">
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        style={{
                          borderColor: "#e5e7eb",
                          fontSize: "0.9rem",
                        }}
                        placeholder="0"
                        value={form.channel_user_count}
                        onChange={(e) =>
                          f({ ...form, channel_user_count: e.target.value })
                        }
                      />
                    </InputWithIcon>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: "0.73rem",
                        color: "#9ca3af",
                      }}
                    >
                      যোগ দেওয়ার সময় কতজন user নিয়ে আসছে
                    </div>
                  </div>
                )}

                {isChannelPartner && (
                  <div className="col-md-4">
                    <FieldLabel>Profit Share (%)</FieldLabel>
                    <InputWithIcon iconClass="fas fa-percent">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="form-control"
                        style={{
                          borderColor: "#e5e7eb",
                          fontSize: "0.9rem",
                        }}
                        placeholder="0.00"
                        value={form.profit_share_percentage}
                        onChange={(e) =>
                          f({ ...form, profit_share_percentage: e.target.value })
                        }
                      />
                    </InputWithIcon>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: "0.73rem",
                        color: "#9ca3af",
                      }}
                    >
                      পার্টনারের কমিশন রেট (যেমন: ২০%)
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── Bandwidth & Connectivity ─────────────────────────────────── */}
            {!isChannelPartner && (
              <SectionCard>
                <SectionHeader
                  iconClass="fas fa-wifi"
                  iconBg="#ecfdf5"
                  iconColor="#059669"
                  title="Bandwidth & Connectivity"
                  subtitle={
                    isMacPartner
                      ? "NTTN bandwidth only for MAC partners"
                      : "Bandwidth allocation and monthly rates per type"
                  }
                  right={
                    isMacPartner && (
                      <span
                        style={{
                          background: "#f5f3ff",
                          color: "#7c3aed",
                          borderRadius: 8,
                          padding: "3px 11px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          border: "1px solid #ddd6fe",
                        }}
                      >
                        NTTN Only
                      </span>
                    )
                  }
                />

                {/* BW Table */}
                <div
                  style={{
                    overflowX: "auto",
                    borderRadius: 10,
                    border: "1px solid #f3f4f6",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {[
                          "Type",
                          "Bandwidth (Mbps)",
                          "Rate (৳ / Mo)",
                          "Est. Monthly",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "9px 14px",
                              color: "#6b7280",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.6px",
                              textAlign:
                                h === "Est. Monthly" ? "right" : "left",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBwRows.map((row, idx) => {
                        const monthly =
                          num(form[row.bwKey]) * num(form[row.rateKey]);
                        const active = num(form[row.bwKey]) > 0;
                        return (
                          <tr
                            key={row.bwKey}
                            style={{
                              background: active
                                ? row.bg
                                : idx % 2 === 0
                                  ? "#fff"
                                  : "#fafafa",
                              transition: "background 0.2s ease",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <td style={{ padding: "8px 14px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  background: row.color + "18",
                                  color: row.color,
                                  borderRadius: 7,
                                  padding: "3px 11px",
                                  fontSize: "0.78rem",
                                  fontWeight: 800,
                                  minWidth: 54,
                                  textAlign: "center",
                                  border: `1px solid ${row.color}30`,
                                }}
                              >
                                {row.label}
                              </span>
                            </td>
                            <td style={{ padding: "6px 14px" }}>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm"
                                style={{
                                  borderColor: active
                                    ? row.color + "60"
                                    : "#e5e7eb",
                                  width: 115,
                                  fontSize: "0.88rem",
                                  fontWeight: active ? 600 : 400,
                                  color: active ? row.color : "#374151",
                                  background: active ? row.bg : "#fff",
                                  transition: "all 0.2s ease",
                                }}
                                value={form[row.bwKey]}
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    [row.bwKey]: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: "6px 14px" }}>
                              <div
                                className="input-group input-group-sm"
                                style={{ width: 130 }}
                              >
                                <span
                                  className="input-group-text"
                                  style={{
                                    background: "#fffbeb",
                                    borderColor: "#e5e7eb",
                                    color: "#d97706",
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                  }}
                                >
                                  ৳
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="form-control"
                                  style={{
                                    borderColor: "#e5e7eb",
                                    fontSize: "0.88rem",
                                  }}
                                  value={form[row.rateKey]}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      [row.rateKey]: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </td>
                            <td
                              style={{
                                padding: "8px 14px",
                                textAlign: "right",
                              }}
                            >
                              {monthly > 0 ? (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: row.color,
                                    fontSize: "0.88rem",
                                  }}
                                >
                                  ৳ {monthly.toLocaleString("en-IN")}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    color: "#d1d5db",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* NTTN Type + NTTN Link + Connection Type */}
                <div className="row g-3 mt-2">
                  <div className="col-md-4">
                    <FieldLabel>NTTN Type</FieldLabel>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["D2D", "OHF", "Longhaul"].map((v) => {
                        const on = form.nttn_type.includes(v);
                        return (
                          <button
                            type="button"
                            key={v}
                            onClick={() => toggleValue("nttn_type", v)}
                            style={{
                              border: `1.5px solid ${on ? "#374151" : "#d1d5db"}`,
                              background: on ? "#374151" : "#fff",
                              color: on ? "#fff" : "#6b7280",
                              borderRadius: 8,
                              padding: "5px 13px",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {on && (
                              <i
                                className="fas fa-check"
                                style={{ fontSize: "0.65rem" }}
                              />
                            )}
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <FieldLabel>NTTN Link</FieldLabel>
                    <input
                      className="form-control form-control-sm"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.88rem" }}
                      placeholder="e.g. Fiber / Microwave"
                      value={form.nttn_link}
                      onChange={(e) =>
                        setForm({ ...form, nttn_link: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-4">
                    <FieldLabel>Connection Type</FieldLabel>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["Speed Net", "L3"].map((v) => {
                        const on = form.connection_type.includes(v);
                        return (
                          <button
                            type="button"
                            key={v}
                            onClick={() => toggleValue("connection_type", v)}
                            style={{
                              border: `1.5px solid ${on ? "#2563eb" : "#d1d5db"}`,
                              background: on ? "#2563eb" : "#fff",
                              color: on ? "#fff" : "#6b7280",
                              borderRadius: 8,
                              padding: "5px 13px",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {on && (
                              <i
                                className="fas fa-check"
                                style={{ fontSize: "0.65rem" }}
                              />
                            )}
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── Payment & Security ────────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                iconClass="fas fa-money-bill-wave"
                iconBg="#fffbeb"
                iconColor="#d97706"
                title="Payment & Security"
                subtitle="Initial charges, security deposit and IP settings"
              />
              <div className="row g-3">
                {[
                  {
                    key: "initial_payment",
                    label: "Initial Payment",
                    placeholder: "0",
                    step: "1",
                  },
                  {
                    key: "security_deposit",
                    label: "Security Deposit",
                    placeholder: "0",
                    step: "1",
                  },
                  {
                    key: "otc_charge",
                    label: "OTC Charge",
                    placeholder: "0.00",
                    step: "0.01",
                  },
                ].map(({ key, label, placeholder, step }) => (
                  <div className="col-md-4" key={key}>
                    <FieldLabel>{label}</FieldLabel>
                    <InputWithIcon prefix="৳">
                      <input
                        type="number"
                        min="0"
                        step={step}
                        className="form-control"
                        style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                        placeholder={placeholder}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
                    </InputWithIcon>
                  </div>
                ))}
                <div className="col-md-4">
                  <FieldLabel>Real IP Quantity</FieldLabel>
                  <InputWithIcon iconClass="fas fa-globe">
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="0"
                      value={form.real_ip_count}
                      onChange={(e) =>
                        setForm({ ...form, real_ip_count: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                <div className="col-md-4">
                  <FieldLabel>Real IP Price (per IP)</FieldLabel>
                  <InputWithIcon prefix="৳">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      style={{ borderColor: "#e5e7eb", fontSize: "0.9rem" }}
                      placeholder="0.00"
                      value={form.real_ip_price}
                      onChange={(e) =>
                        setForm({ ...form, real_ip_price: e.target.value })
                      }
                    />
                  </InputWithIcon>
                </div>
                {/* Projected Bill — inline hint in payment section */}
                <div className="col-md-4">
                  <FieldLabel>Projected Bill (auto)</FieldLabel>
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1.5px solid #bbf7d0",
                      borderRadius: 9,
                      padding: "7px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <i
                      className="fas fa-calculator"
                      style={{ color: "#16a34a", fontSize: "0.85rem" }}
                    />
                    <span
                      style={{
                        fontWeight: 700,
                        color: "#15803d",
                        fontSize: "0.95rem",
                      }}
                    >
                      ৳{" "}
                      {projected.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
          {/* /col-lg-8 */}

          {/* ═══ Right: Sticky Summary Card ════════════════════════════════════ */}
          <div className="col-lg-4">
            <div style={{ position: "sticky", top: 20 }}>
              {/* Summary card */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 18,
                  boxShadow: "0 4px 28px rgba(0,0,0,0.09)",
                  overflow: "hidden",
                }}
              >
                {/* Gradient header */}
                <div
                  style={{
                    background: `linear-gradient(${activeType.gradient})`,
                    padding: "1.25rem 1.5rem",
                    transition: "background 0.3s ease",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <i
                        className={activeType.icon}
                        style={{ color: "#fff", fontSize: "1.1rem" }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.95rem",
                        }}
                      >
                        {activeType.label}
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.72)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {form.reseller_name || "Partner name not set"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Projected bill */}
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <div
                    style={{
                      color: "#9ca3af",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    Projected Monthly Bill
                  </div>
                  <div
                    style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      color: "#111827",
                      letterSpacing: -1,
                      lineHeight: 1.1,
                    }}
                  >
                    ৳{" "}
                    {projected.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  {num(form.otc_charge) > 0 && (
                    <div
                      style={{
                        color: "#d97706",
                        fontSize: "0.74rem",
                        marginTop: 3,
                        fontWeight: 600,
                      }}
                    >
                      + ৳ {num(form.otc_charge).toLocaleString("en-IN")} OTC
                      (1st month only)
                    </div>
                  )}
                </div>

                {/* BW Breakdown */}
                {!isChannelPartner && bwBreakdown.length > 0 && (
                  <div
                    style={{
                      padding: "1rem 1.5rem",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <div
                      style={{
                        color: "#9ca3af",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 10,
                      }}
                    >
                      Bandwidth Breakdown
                    </div>
                    {bwBreakdown.map((b) => (
                      <div
                        key={b.label}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 7,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: "50%",
                              background: b.color,
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: "0.83rem",
                              color: "#374151",
                              fontWeight: 600,
                            }}
                          >
                            {b.label}
                          </span>
                          <span
                            style={{ fontSize: "0.75rem", color: "#9ca3af" }}
                          >
                            {b.bw} Mbps
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.83rem",
                            fontWeight: 700,
                            color: b.color,
                          }}
                        >
                          ৳ {b.cost.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                    {num(form.real_ip_count) > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 7,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: "50%",
                              background: "#6366f1",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: "0.83rem",
                              color: "#374151",
                              fontWeight: 600,
                            }}
                          >
                            Real IP
                          </span>
                          <span
                            style={{ fontSize: "0.75rem", color: "#9ca3af" }}
                          >
                            {form.real_ip_count} IPs
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.83rem",
                            fontWeight: 700,
                            color: "#6366f1",
                          }}
                        >
                          ৳{" "}
                          {(
                            num(form.real_ip_count) * num(form.real_ip_price)
                          ).toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment summary */}
                {(num(form.initial_payment) > 0 ||
                  num(form.security_deposit) > 0) && (
                  <div
                    style={{
                      padding: "1rem 1.5rem",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <div
                      style={{
                        color: "#9ca3af",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      One-time Charges
                    </div>
                    {[
                      { label: "Initial Payment", val: form.initial_payment },
                      { label: "Security Deposit", val: form.security_deposit },
                    ]
                      .filter(({ val }) => num(val) > 0)
                      .map(({ label, val }) => (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 5,
                            fontSize: "0.82rem",
                          }}
                        >
                          <span style={{ color: "#6b7280" }}>{label}</span>
                          <span style={{ fontWeight: 700, color: "#374151" }}>
                            ৳ {num(val).toLocaleString("en-IN")}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ padding: "1.25rem 1.5rem" }}>
                  {saved && (
                    <div
                      style={{
                        background: "#ecfdf5",
                        borderRadius: 10,
                        padding: "0.6rem 0.9rem",
                        marginBottom: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        border: "1px solid #bbf7d0",
                      }}
                    >
                      <i
                        className="fas fa-check-circle"
                        style={{ color: "#059669", fontSize: "0.9rem" }}
                      />
                      <span
                        style={{
                          color: "#059669",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                        }}
                      >
                        Partner saved successfully!
                      </span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      width: "100%",
                      background: saving
                        ? "#9ca3af"
                        : `linear-gradient(${activeType.gradient})`,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "0.72rem",
                      fontWeight: 700,
                      fontSize: "0.92rem",
                      cursor: saving ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: "0.5rem",
                      boxShadow: saving
                        ? "none"
                        : `0 4px 14px ${activeType.color}45`,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {saving ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm"
                          role="status"
                        />{" "}
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save" /> Save Partner Profile
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    style={{
                      width: "100%",
                      background: "#f9fafb",
                      color: "#6b7280",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "0.6rem",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <i
                      className="fas fa-undo"
                      style={{ fontSize: "0.75rem" }}
                    />{" "}
                    Reset Form
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* /col-lg-4 */}
        </div>
        {/* /row */}
      </form>
    </div>
  );
};

export default AddReseller;
