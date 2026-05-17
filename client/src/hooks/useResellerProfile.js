import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  getResellerProfileDetails,
  updateReseller,
  addBillingLog,
  addDiscount,
  changeResellerRate,
  getResellerRateChangeLogs,
} from "../services/resellerService";
import { toDhakaDateInputValue, getDhakaDateYmd } from "../utils/formatters";

export const useResellerProfile = (profileId) => {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal visibility states
  const [showPay, setShowPay] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showProductCharge, setShowProductCharge] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBillHistory, setShowBillHistory] = useState(false);
  const [showRateChange, setShowRateChange] = useState(false);

  // Form states
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(getDhakaDateYmd());
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentNote, setPaymentNote] = useState("");

  const [discountAmount, setDiscountAmount] = useState("");
  const [discountDate, setDiscountDate] = useState(getDhakaDateYmd());
  const [discountNote, setDiscountNote] = useState("");

  const [productChargeAmount, setProductChargeAmount] = useState("");
  const [productChargeDate, setProductChargeDate] = useState(getDhakaDateYmd());
  const [productChargeNote, setProductChargeNote] = useState("");

  const [editForm, setEditForm] = useState(null);
  const [rateChangeForm, setRateChangeForm] = useState(null);
  const [rateChangeSaving, setRateChangeSaving] = useState(false);
  const [rateChangeLogs, setRateChangeLogs] = useState([]);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoadError("");
    try {
      const payload = await getResellerProfileDetails(profileId);
      setData(payload);
      const r = payload.reseller;
      setEditForm({
        name: r.name || "",
        company_name: r.company_name || "",
        phone: r.phone || "",
        pop_location: r.pop_location || "",
        latitude: r.latitude || "",
        longitude: r.longitude || "",
        reseller_code: r.reseller_code || "",
        status: r.status || "active",
        partner_type: r.partner_type || "distribution_partner",
        iig_bw: Number(r.iig_bw || 0),
        bdix_bw: Number(r.bdix_bw || 0),
        ggc_bw: Number(r.ggc_bw || 0),
        fna_bw: Number(r.fna_bw || 0),
        cdn_bw: Number(r.cdn_bw || 0),
        bcdn_bw: Number(r.bcdn_bw || 0),
        nttn_capacity: Number(r.nttn_capacity || 0),
        nttn_type: r.nttn_type || "",
        nttn_link: r.nttn_link || "",
        connection_type: r.connection_type || "",
        rate_iig: Number(r.rate_iig || 0),
        rate_bdix: Number(r.rate_bdix || 0),
        rate_ggc: Number(r.rate_ggc || 0),
        rate_fna: Number(r.rate_fna || 0),
        rate_cdn: Number(r.rate_cdn || 0),
        rate_bcdn: Number(r.rate_bcdn || 0),
        rate_nttn: Number(r.rate_nttn || 0),
        monthly_rate: Number(r.current_projected_bill || 0),
        due_amount: Number(r.previous_month_due || 0),
        next_pay_date: toDhakaDateInputValue(r.next_pay_date),
        security_deposit: Number(r.security_deposit || 0),
        otc_charge: Number(r.otc_charge || 0),
        real_ip_count: Number(r.real_ip_count || 0),
        real_ip_price: Number(r.real_ip_price || 0),
        channel_user_count: Number(r.channel_user_count || 0),
        profit_share_percentage: Number(r.profit_share_percentage || 0),
        joining_date: toDhakaDateInputValue(r.joining_date || r.created_at),
      });
    } catch (e) {
      setData(null);
      setLoadError(e?.response?.data?.message || "Profile data load failed");
    }
  }, [profileId]);

  const loadRateChangeLogs = useCallback(async () => {
    if (!profileId) return;
    try {
      const logs = await getResellerRateChangeLogs(profileId);
      setRateChangeLogs(logs || []);
    } catch (_) {
      /* ignore */
    }
  }, [profileId]);

  useEffect(() => {
    load();
    loadRateChangeLogs();
  }, [load, loadRateChangeLogs]);

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!Number(paymentAmount)) return;
    const note = `Payment Received (${paymentMethod}): ${Number(paymentAmount).toFixed(2)} Tk.${paymentNote ? ` Note: ${paymentNote}` : ""}`;
    await addBillingLog({
      reseller_id: profileId,
      log_type: "payment",
      amount: Number(paymentAmount),
      note,
      effective_date: `${paymentDate}T${new Date().toTimeString().slice(0, 8)}`,
    });
    setShowPay(false);
    setPaymentAmount("");
    setPaymentMethod("Cash");
    setPaymentNote("");
    await load();
  };

  const submitDiscount = async (e) => {
    e.preventDefault();
    if (!Number(discountAmount)) return;
    try {
      const payload = {
        amount: Number(discountAmount),
        note: discountNote || "Monthly discount",
        effective_date: `${discountDate}T${new Date().toTimeString().slice(0, 8)}`,
      };
      try {
        await addDiscount(profileId, payload);
      } catch (primaryErr) {
        const status = Number(primaryErr?.response?.status || 0);
        if ([403, 404, 500].includes(status)) {
          await addBillingLog({
            reseller_id: profileId,
            log_type: "discount",
            amount: payload.amount,
            note: `Discount: ${payload.note}`,
            effective_date: payload.effective_date,
          });
        } else {
          throw primaryErr;
        }
      }
      setShowDiscount(false);
      setDiscountAmount("");
      setDiscountNote("");
      await load();
    } catch (err) {
      window.alert(err?.response?.data?.message || "Discount save failed");
    }
  };

  const submitProductCharge = async (e) => {
    e.preventDefault();
    if (!Number(productChargeAmount)) return;
    try {
      const note = `Product Charge: ${Number(productChargeAmount).toFixed(2)} Tk.${productChargeNote ? ` Note: ${productChargeNote}` : ""}`;
      await addBillingLog({
        reseller_id: profileId,
        log_type: "product",
        amount: Number(productChargeAmount),
        note,
        effective_date: `${productChargeDate}T${new Date().toTimeString().slice(0, 8)}`,
      });
      toast.success("প্রোডাক্ট চার্জ সফলভাবে যুক্ত হয়েছে!");
      setShowProductCharge(false);
      setProductChargeAmount("");
      setProductChargeNote("");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "প্রোডাক্ট চার্জ যোগ করতে সমস্যা হয়েছে");
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!String(payload.password || "").trim()) delete payload.password;
      if (payload.partner_type !== "channel_partner") {
        delete payload.profit_share_percentage;
        delete payload.channel_user_count;
      }

      await updateReseller(profileId, payload);
      toast.success("প্রোফাইল সফলভাবে আপডেট হয়েছে!");
      setShowEdit(false);
      await load();
    } catch (err) {
      console.error("Update failed:", err);
      toast.error(err?.response?.data?.message || "আপডেট করতে সমস্যা হয়েছে");
    } finally {
      setSaving(false);
    }
  };

  const openRateChangeModal = () => {
    const r = data?.reseller || {};
    setRateChangeForm({
      effective_date: getDhakaDateYmd(),
      note: "",
      rate_iig: Number(r.rate_iig || 0),
      rate_bdix: Number(r.rate_bdix || 0),
      rate_ggc: Number(r.rate_ggc || 0),
      rate_fna: Number(r.rate_fna || 0),
      rate_cdn: Number(r.rate_cdn || 0),
      rate_bcdn: Number(r.rate_bcdn || 0),
      rate_nttn: Number(r.rate_nttn || 0),
    });
    setShowRateChange(true);
  };

  const submitRateChange = async (e) => {
    e.preventDefault();
    setRateChangeSaving(true);
    try {
      const result = await changeResellerRate(profileId, rateChangeForm);
      setShowRateChange(false);
      await load();
      await loadRateChangeLogs();
      if (
        result?.new_projected_bill !== undefined &&
        result?.new_projected_bill !== null
      ) {
        window.alert(
          `✅ রেট পরিবর্তন সফল!\n\nনতুন Projected Bill: ${Number(result.new_projected_bill).toLocaleString("en-BD", { minimumFractionDigits: 2 })} Tk`,
        );
      }
    } catch (err) {
      window.alert(err?.response?.data?.message || "রেট পরিবর্তন সেভ হয়নি");
    } finally {
      setRateChangeSaving(false);
    }
  };

  return {
    data,
    loadError,
    saving,
    load,
    // Modal states
    showPay,
    setShowPay,
    showDiscount,
    setShowDiscount,
    showEdit,
    setShowEdit,
    showBillHistory,
    setShowBillHistory,
    showRateChange,
    setShowRateChange,
    // Payment form
    paymentAmount,
    setPaymentAmount,
    paymentDate,
    setPaymentDate,
    paymentMethod,
    setPaymentMethod,
    paymentNote,
    setPaymentNote,
    submitPayment,
    // Discount form
    discountAmount,
    setDiscountAmount,
    discountDate,
    setDiscountDate,
    discountNote,
    setDiscountNote,
    submitDiscount,
    // Product Charge form
    showProductCharge,
    setShowProductCharge,
    productChargeAmount,
    setProductChargeAmount,
    productChargeDate,
    setProductChargeDate,
    productChargeNote,
    setProductChargeNote,
    submitProductCharge,
    // Edit form
    editForm,
    setEditForm,
    saveProfile,
    // Rate change
    rateChangeForm,
    setRateChangeForm,
    rateChangeSaving,
    rateChangeLogs,
    openRateChangeModal,
    submitRateChange,
  };
};
