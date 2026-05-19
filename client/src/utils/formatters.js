/**
 * Utility functions for formatting data in the Reseller Profile
 */

export const money = (v) => `${Number(v || 0).toLocaleString('bn-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ৳`;

export const bw = (v) => `${Number(v || 0).toLocaleString('bn-BD')} Mbps`;

export const splitCsv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

export const fmtDate = (v) => {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const toDhakaDateInputValue = (v) => {
    if (!v) return '';
    const raw = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : '';
};

export const getDhakaDateYmd = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
};

export const partnerTypeLabel = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'mac_partner') return 'Mac Partner';
    if (normalized === 'distribution_partner') return 'Distribution Partner';
    return 'Channel Partner';
};
