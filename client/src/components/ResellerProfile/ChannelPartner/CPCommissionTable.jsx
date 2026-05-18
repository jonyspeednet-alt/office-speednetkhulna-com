import React from "react";
import { money } from "../../../utils/formatters";

/**
 * Unified Channel Partner Commission Invoice Table.
 * Renders ONE table with all rows in the correct order:
 *  1. মোট গ্রাহক দাবি (Total Billing Due)
 *  2. আদায়কৃত গ্রাহক বিল (Paid Collection)
 *  3. কমিশন (Collection × %)
 *  4. গ্রাহক বকেয়া বিল (Deferred Amount)   ← deducted
 *  5. (−) প্রোডাক্ট চার্জ কর্তন
 *  6. (−) অগ্রিম সমন্বয়           (if any)
 *  7. (+) সমন্বয় বোনাস            (if any)
 *  8. (−) কর্তন                   (if any)
 *  9. নেট কমিশন
 * 10. পূর্ববর্তী ব্যালেন্স         (if any)
 * 11. মোট প্রদেয় (Total Payable)
 * 12. (−) পরিশোধিত               (if any)
 * 13. বকেয়া ব্যালেন্স (Closing Due) — highlighted
 */
const CPCommissionTable = ({ summary, reseller, fmtMoney }) => {
  const fmt = fmtMoney || money;

  const totalDue      = Number(summary.total_due        || 0);
  const totalUsers    = Number(summary.total_users      || 0);
  const paying        = Number(summary.paying_users     || 0);
  const nonPaying     = Number(summary.non_paying_users || 0);
  const partialPaying = Number(summary.partial_paying_users || 0);
  const collected     = Number(summary.total_collected  || 0);
  const realized      = Number(summary.total_realized   || summary.total_collected || 0);
  const deferred      = Number(summary.total_deferred   || 0);
  const profitPct     = Number(summary.profit_share_percentage ?? reseller?.profit_share_percentage ?? 0);
  const gross         = Number(summary.gross_commission  || 0);
  const prodDed       = Number(summary.product_deduction || 0);
  const advances      = Number(summary.partner_advances  || 0);
  const adj           = Number(summary.adjustments       || 0);
  const ded           = Number(summary.deductions        || 0);
  const net           = Number(summary.net_commission    || 0);
  const prevBal       = Number(summary.previous_balance  || 0);
  const totalPayable  = Number(summary.total_payable     || 0);
  const paid          = Number(summary.paid_to_partner   || 0);
  const closing       = Number(summary.closing_balance   || 0);

  const closingPos = closing >= 0;

  const th = { padding: '8px 12px', fontWeight: 600, fontSize: '0.82rem', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' };
  const td = { padding: '9px 12px', borderBottom: '1px solid #f0f4f8', fontSize: '0.85rem', verticalAlign: 'middle' };
  const tdCount = { ...td, textAlign: 'center', color: '#64748b', fontFamily: 'monospace', width: 140 };
  const tdAmt = { ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, width: 140 };

  return (
    <div className="table-responsive">
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '52%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '26%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>বিবরণ (DESCRIPTION)</th>
            <th style={{ ...th, textAlign: 'center' }}>গ্রাহক (COUNT)</th>
            <th style={{ ...th, textAlign: 'right' }}>পরিমাণ (AMOUNT)</th>
          </tr>
        </thead>
        <tbody>

          {/* ① মোট গ্রাহক দাবি */}
          <tr>
            <td style={td}>মোট গ্রাহক দাবি (Total Billing Due)</td>
            <td style={tdCount}>{totalUsers.toLocaleString('bn-BD')} জন</td>
            <td style={tdAmt}>{fmt(totalDue)}</td>
          </tr>

          {/* ② আদায়কৃত গ্রাহক বিল */}
          <tr style={{ background: '#f0fdf4' }}>
            <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>আদায়কৃত গ্রাহক বিল (Paid Collection)</td>
            <td style={{ ...tdCount, color: '#16a34a', fontWeight: 600 }}>{paying.toLocaleString('bn-BD')} জন পেমেন্ট</td>
            <td style={{ ...tdAmt, color: '#16a34a' }}>{fmt(collected)}</td>
          </tr>

          {/* ③ কমিশন */}
          <tr style={{ background: '#eff6ff' }}>
            <td style={{ ...td, fontWeight: 700 }}>
              কমিশন (গ্রাহক বিল কালেকশন {fmt(realized)} × {profitPct}%)
            </td>
            <td style={tdCount}>—</td>
            <td style={{ ...tdAmt, color: '#2563eb', fontSize: '1rem' }}>{fmt(gross)}</td>
          </tr>

          {/* ④ গ্রাহক বকেয়া বিল */}
          {deferred > 0 && (
            <tr>
              <td style={{ ...td, color: '#dc2626', paddingLeft: 24 }}>
                (−) গ্রাহক বকেয়া বিল (Deferred Amount)
              </td>
              <td style={{ ...tdCount, color: '#dc2626' }}>{nonPaying.toLocaleString('bn-BD')} জন বাকি{partialPaying > 0 ? ` (${partialPaying.toLocaleString('bn-BD')} আংশিক)` : ''}</td>
              <td style={{ ...tdAmt, color: '#dc2626' }}>(-) {fmt(deferred)}</td>
            </tr>
          )}

          {/* ⑤ প্রোডাক্ট চার্জ কর্তন */}
          {prodDed > 0 && (
            <tr>
              <td style={{ ...td, color: '#dc2626', paddingLeft: 24 }}>(−) প্রোডাক্ট চার্জ কর্তন</td>
              <td style={tdCount}>—</td>
              <td style={{ ...tdAmt, color: '#dc2626' }}>(-) {fmt(prodDed)}</td>
            </tr>
          )}

          {/* ⑥ অগ্রিম সমন্বয় */}
          {advances > 0 && (
            <tr>
              <td style={{ ...td, color: '#dc2626', paddingLeft: 24 }}>(−) অগ্রিম সমন্বয়</td>
              <td style={tdCount}>—</td>
              <td style={{ ...tdAmt, color: '#dc2626' }}>(-) {fmt(advances)}</td>
            </tr>
          )}

          {/* ⑦ সমন্বয় বোনাস */}
          {adj > 0 && (
            <tr>
              <td style={{ ...td, color: '#16a34a', paddingLeft: 24 }}>
                (+) সমন্বয় বোনাস{summary.adjustment_note ? `: ${summary.adjustment_note}` : ''}
              </td>
              <td style={tdCount}>—</td>
              <td style={{ ...tdAmt, color: '#16a34a' }}>(+) {fmt(adj)}</td>
            </tr>
          )}

          {/* ⑧ ম্যানুয়াল কর্তন */}
          {ded > 0 && (
            <tr>
              <td style={{ ...td, color: '#dc2626', paddingLeft: 24 }}>
                {summary.deduction_note?.startsWith('[পার্টনার বিল কালেকশন]')
                  ? '(−) পার্টনার সরাসরি গ্রাহক বিল সংগ্রহ'
                  : `(−) কর্তন: ${summary.deduction_note || 'ম্যানুয়াল কর্তন'}`}
              </td>
              <td style={tdCount}>—</td>
              <td style={{ ...tdAmt, color: '#dc2626' }}>(-) {fmt(ded)}</td>
            </tr>
          )}

          {/* ⑨ নেট কমিশন — shown as মোট প্রদেয় when no prev balance or paid */}
          {prevBal !== 0 && (
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>নেট কমিশন (Net Commission)</td>
              <td style={{ ...tdCount, borderTop: '2px solid #cbd5e1' }}>—</td>
              <td style={{ ...tdAmt, color: '#16a34a', fontSize: '0.95rem', borderTop: '2px solid #cbd5e1' }}>{fmt(net)}</td>
            </tr>
          )}

          {/* ⑩ পূর্ববর্তী ব্যালেন্স */}
          {prevBal !== 0 && (
            <tr>
              <td style={{ ...td, paddingLeft: 24, color: prevBal > 0 ? '#dc2626' : '#16a34a' }}>
                {prevBal > 0 ? '(+) পূর্ববর্তী বকেয়া ব্যালেন্স (Carry Forward)' : '(−) পূর্ববর্তী ক্রেডিট ব্যালেন্স'}
              </td>
              <td style={tdCount}>—</td>
              <td style={{ ...tdAmt, color: prevBal > 0 ? '#dc2626' : '#16a34a' }}>
                {prevBal > 0 ? '+' : '-'} {fmt(Math.abs(prevBal))}
              </td>
            </tr>
          )}

          {/* ⑪ মোট প্রদেয় / Closing */}
          <tr style={{ background: closingPos ? '#f0fdf4' : '#fef2f2', borderTop: '2px solid #cbd5e1' }}>
            <td style={{ ...td, fontWeight: 700, fontSize: '1rem', color: closingPos ? '#15803d' : '#b91c1c', borderTop: '2px solid #cbd5e1' }}>
              <i className={`fas ${closingPos ? 'fa-arrow-circle-up' : 'fa-arrow-circle-down'} me-2`} />
              মোট প্রদেয় (Total Payable)
            </td>
            <td style={{ ...tdCount, borderTop: '2px solid #cbd5e1' }}>—</td>
            <td style={{ ...tdAmt, fontSize: '1.05rem', fontWeight: 700, color: closingPos ? '#15803d' : '#b91c1c', borderTop: '2px solid #cbd5e1' }}>
              {fmt(Math.abs(closing))}
            </td>
          </tr>

        </tbody>
      </table>
    </div>
  );
};

export default CPCommissionTable;
