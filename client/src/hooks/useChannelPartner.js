import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  getChannelUsers,
  addChannelUser,
  updateChannelUser,
  deleteChannelUser,
  getUserPayments,
  initMonthlyPayments,
  recordUserPayment,
  bulkRecordPayments,
  getCommissionSummary,
  generateCommission,
  adjustCommission,
  finalizeCommission,
  getCommissionHistory,
  recordCommissionPayment,
  getCommissionPayments,
  getChannelStatement,
  importChannelData,
  getReconciliations,
  downloadReconciliationReport,
  listChannelProducts,
  importChannelProducts,
  getProductSummary,
  getUserProducts,
  saveUserProducts,
  getManualProductCharge,
  saveManualProductCharge,
} from "../services/channelPartnerService";
import { getDhakaDateYmd } from "../utils/formatters";

export const useChannelPartner = (profileId, isChannel, onProfileRefresh) => {
  const [cpUsers, setCpUsers] = useState([]);
  const [cpMonth, setCpMonth] = useState(getDhakaDateYmd().slice(0, 7));
  const [cpUserPayments, setCpUserPayments] = useState([]);
  const [cpCommission, setCpCommission] = useState(null);
  const [cpHistory, setCpHistory] = useState([]);
  const [cpStatement, setCpStatement] = useState([]);
  const [cpPayments, setCpPayments] = useState([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpUserSearch, setCpUserSearch] = useState("");
  const [cpProductSummary, setCpProductSummary] = useState(null);
  const [cpProductCatalog, setCpProductCatalog] = useState([]);
  const [showUserProducts, setShowUserProducts] = useState(null);
  const [userProductsUsage, setUserProductsUsage] = useState([]);
  const [userProductsLoading, setUserProductsLoading] = useState(false);
  const [savingUserProducts, setSavingUserProducts] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState(false);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(null);
  const [showCommissionPay, setShowCommissionPay] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showManualProductCharge, setShowManualProductCharge] = useState(false);

  // Form states
  const [newUser, setNewUser] = useState({
    user_name: "",
    user_id_code: "",
    phone: "",
    package_name: "",
    monthly_rate: "",
  });
  const [commPayForm, setCommPayForm] = useState({
    amount: "",
    payment_date: getDhakaDateYmd(),
    payment_method: "Cash",
    reference_no: "",
    note: "",
  });
  const [adjForm, setAdjForm] = useState({
    type: "adjustment",
    amount: "",
    note: "",
  });
  const [manualProductChargeForm, setManualProductChargeForm] = useState({
    amount: "",
    note: "",
  });
  const [manualProductChargeLoading, setManualProductChargeLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMonth, setImportMonth] = useState(getDhakaDateYmd().slice(0, 7));

  const loadChannelData = useCallback(async () => {
    if (!profileId || !isChannel) return;
    setCpLoading(true);
    try {
      const [users, commission, history, statement, payments, productSummary, manualCharge] =
        await Promise.all([
          getChannelUsers(profileId).catch(() => []),
          getCommissionSummary(profileId, cpMonth).catch(() => null),
          getCommissionHistory(profileId).catch(() => []),
          getChannelStatement(profileId).catch(() => []),
          getCommissionPayments(profileId).catch(() => []),
          getProductSummary(profileId, cpMonth).catch(() => null),
          getManualProductCharge(profileId, cpMonth).catch(() => null),
        ]);
      setCpUsers(users);
      setCpCommission(commission);
      setCpHistory(history);
      setCpStatement(statement);
      setCpPayments(payments);
      setCpProductSummary(productSummary);
      setManualProductChargeForm({
        amount: manualCharge?.amount ?? "",
        note: manualCharge?.note || "",
      });
    } catch (e) {
      toast.error(e?.response?.data?.message || "Channel partner data load failed");
    }
    setCpLoading(false);
  }, [profileId, isChannel, cpMonth]);

  const loadUserPayments = useCallback(async () => {
    if (!profileId) return;
    try {
      const rows = await getUserPayments(profileId, cpMonth);
      setCpUserPayments(rows);
    } catch (e) {
      /* ignore */
    }
  }, [profileId, cpMonth]);

  useEffect(() => {
    if (isChannel) {
      loadChannelData();
      loadUserPayments();
    }
  }, [isChannel, loadChannelData, loadUserPayments]);

  useEffect(() => {
    if (!isChannel) return;
    listChannelProducts(true)
      .then((rows) => setCpProductCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => setCpProductCatalog([]));
  }, [isChannel]);

  const refreshProfile = useCallback(async () => {
    if (typeof onProfileRefresh === "function") {
      await onProfileRefresh();
    }
  }, [onProfileRefresh]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await addChannelUser(profileId, newUser);
      setShowAddUser(false);
      setNewUser({
        user_name: "",
        user_id_code: "",
        phone: "",
        package_name: "",
        monthly_rate: "",
      });
      await loadChannelData();
      await refreshProfile();
      toast.success("ইউজার যোগ হয়েছে");
    } catch (err) {
      toast.error(err?.response?.data?.message || "ইউজার যোগ করা যায়নি");
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      await updateChannelUser(profileId, showEditUser.id, showEditUser);
      setShowEditUser(null);
      await loadChannelData();
      await refreshProfile();
      toast.success("ইউজার আপডেট হয়েছে");
    } catch (err) {
      toast.error(err?.response?.data?.message || "ইউজার আপডেট করা যায়নি");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm("এই ইউজার মুছে ফেলতে চান?")) {
      try {
        await deleteChannelUser(profileId, userId);
        await loadChannelData();
        await refreshProfile();
        toast.success("ইউজার মুছে ফেলা হয়েছে");
      } catch (err) {
        toast.error(err?.response?.data?.message || "ইউজার মুছতে সমস্যা হয়েছে");
      }
    }
  };

  const handleInitPayments = async () => {
    await initMonthlyPayments(profileId, cpMonth);
    loadUserPayments();
  };

  const handleRecordPayment = async (userId, amount) => {
    await recordUserPayment(profileId, {
      user_id: userId,
      month: cpMonth,
      amount_paid: amount,
      payment_date: getDhakaDateYmd(),
    });
    loadUserPayments();
    loadChannelData();
  };

  const handleBulkFullPaid = async () => {
    const unpaid = cpUserPayments.filter((p) => Number(p.amount_paid) === 0);
    if (unpaid.length === 0) return;
    if (
      !window.confirm(
        `${unpaid.length} জন unpaid ইউজারকে full paid হিসেবে মার্ক করতে চান?`,
      )
    )
      return;
    await bulkRecordPayments(
      profileId,
      cpMonth,
      unpaid.map((p) => ({
        user_id: p.user_id,
        amount_paid: Number(p.amount_due || p.monthly_rate || 0),
        payment_date: getDhakaDateYmd(),
      })),
    );
    loadUserPayments();
    loadChannelData();
  };

  const handleGenerateCommission = async () => {
    try {
      await generateCommission(profileId, cpMonth);
      await loadChannelData();
      toast.success("কমিশন জেনারেট ও আপডেট সম্পন্ন হয়েছে");
    } catch (err) {
      toast.error(err?.response?.data?.message || "কমিশন জেনারেট করা যায়নি");
    }
  };

  const handleCommissionPayment = async (e) => {
    e.preventDefault();
    if (!commPayForm.commission_log_id) {
      toast.error("কমিশন পেমেন্ট করার আগে finalized কমিশন মাস নির্বাচন করুন।");
      return;
    }
    try {
      await recordCommissionPayment(profileId, {
        commission_log_id: commPayForm.commission_log_id,
        amount: Number(commPayForm.amount),
        payment_method: commPayForm.payment_method,
        payment_date: commPayForm.payment_date,
        reference_no: commPayForm.reference_no,
        note: commPayForm.note,
      });
      setShowCommissionPay(false);
      setCommPayForm({
        commission_log_id: null,
        commission_month: "",
        closing_balance: 0,
        amount: "",
        payment_date: getDhakaDateYmd(),
        payment_method: "Cash",
        reference_no: "",
        note: "",
      });
      await loadChannelData();
      toast.success("কমিশন পেমেন্ট রেকর্ড হয়েছে");
    } catch (err) {
      toast.error(err?.response?.data?.message || "কমিশন পেমেন্ট সেভ হয়নি");
    }
  };

  const handleAdjustment = async (e) => {
    e.preventDefault();
    await adjustCommission(profileId, showAdjust.id, adjForm);
    setShowAdjust(false);
    setAdjForm({ type: "adjustment", amount: "", note: "" });
    loadChannelData();
  };

  const handleFinalize = async (logId) => {
    if (window.confirm("কমিশন Finalize করতে চান?")) {
      await finalizeCommission(profileId, logId);
      loadChannelData();
    }
  };

  const handleImport = async (customFile = null) => {
    setImporting(true);
    try {
      const res = await importChannelData(profileId, importMonth, customFile || importFile);
      window.alert(
        `✅ ইম্পোর্ট সফল!\nমোট রেকর্ড: ${res.total}\nনতুন ইউজার: ${res.created}\nআপডেট করা হয়েছে: ${res.updated}\nস্কিপ: ${res.skipped || 0}\nমোট কালেকশন: ${res.total_received || 0}\nমোট বাকি: ${res.total_not_paid || 0}`,
      );
      setShowImport(false);
      setImportFile(null);
      loadChannelData();
      loadUserPayments();
    } catch (err) {
      window.alert(
        err?.response?.data?.message || "ইম্পোর্ট করতে সমস্যা হয়েছে।",
      );
    } finally {
      setImporting(false);
    }
  };

  const openCommissionPayment = (log) => {
    const target =
      log ||
      (cpHistory || []).find(
        (h) => h.status === "finalized" && Number(h.closing_balance || 0) > 0,
      );
    if (!target) {
      toast.error("পেমেন্টযোগ্য finalized কমিশন পাওয়া যায়নি");
      return;
    }
    setCommPayForm({
      commission_log_id: target.id,
      commission_month: target.month || "",
      closing_balance: Number(target.closing_balance || 0),
      amount: target.closing_balance
        ? String(Number(target.closing_balance || 0))
        : "",
      payment_date: getDhakaDateYmd(),
      payment_method: "Cash",
      reference_no: "",
      note: "",
    });
    setShowCommissionPay(true);
  };

  const handleImportCatalog = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportingCatalog(true);
      try {
        const res = await importChannelProducts(file);
        const rows = await listChannelProducts(true);
        setCpProductCatalog(Array.isArray(rows) ? rows : []);
        toast.success(
          `ক্যাটালগ ইম্পোর্ট: ${res.created || 0} নতুন, ${res.updated || 0} আপডেট`,
        );
        await loadChannelData();
      } catch (err) {
        toast.error(
          err?.response?.data?.message || "প্রোডাক্ট ক্যাটালগ ইম্পোর্ট ব্যর্থ",
        );
      } finally {
        setImportingCatalog(false);
      }
    };
    input.click();
  };

  const handleEditUserProducts = async (user) => {
    setShowUserProducts(user);
    setUserProductsLoading(true);
    setUserProductsUsage([]);
    try {
      const data = await getUserProducts(profileId, user.id, cpMonth);
      if (Array.isArray(data?.catalog) && data.catalog.length) {
        setCpProductCatalog(data.catalog);
      }
      setUserProductsUsage(data?.usage || []);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "ইউজার প্রোডাক্ট লোড করা যায়নি",
      );
      setShowUserProducts(null);
    } finally {
      setUserProductsLoading(false);
    }
  };

  const closeUserProductsModal = () => {
    setShowUserProducts(null);
    setUserProductsUsage([]);
  };

  const handleSaveUserProducts = async ({ month, items }) => {
    if (!showUserProducts?.id) return;
    setSavingUserProducts(true);
    try {
      await saveUserProducts(profileId, showUserProducts.id, { month, items });
      closeUserProductsModal();
      await loadChannelData();
      toast.success("প্রোডাক্ট বরাদ্দ সেভ হয়েছে");
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "প্রোডাক্ট সেভ করা যায়নি",
      );
    } finally {
      setSavingUserProducts(false);
    }
  };

  const handleDownloadReport = async (log) => {
    try {
      // First find the reconciliation ID for this month
      const reconciliationPayload = await getReconciliations(profileId);
      const reconciliations = Array.isArray(reconciliationPayload)
        ? reconciliationPayload
        : reconciliationPayload?.data || [];
      const matched = reconciliations.find((r) =>
        String(r.reconciliation_month || "").startsWith(log.month),
      );

      if (!matched) {
        window.alert(
          "এই মাসের নিষ্পত্তি রিপোর্ট পাওয়া যায়নি। আগে Reconciliation initiate/approve করুন।",
        );
        return;
      }

      await downloadReconciliationReport(profileId, matched.id);
    } catch (err) {
      window.alert("রিপোর্ট ডাউনলোড করতে সমস্যা হয়েছে।");
    }
  };

  const handleSaveManualProductCharge = async (e) => {
    e.preventDefault();
    setManualProductChargeLoading(true);
    try {
      await saveManualProductCharge(profileId, {
        month: cpMonth,
        amount: manualProductChargeForm.amount,
        note: manualProductChargeForm.note,
      });
      toast.success("Manual product charge saved successfully!");
      setShowManualProductCharge(false);
      await loadChannelData();
      await refreshProfile();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to save manual product charge");
    } finally {
      setManualProductChargeLoading(false);
    }
  };

  return {
    cpUsers,
    cpMonth,
    setCpMonth,
    cpUserPayments,
    cpCommission,
    cpHistory,
    cpStatement,
    cpPayments,
    cpLoading,
    cpUserSearch,
    setCpUserSearch,
    cpProductSummary,
    cpProductCatalog,
    showUserProducts,
    setShowUserProducts,
    userProductsUsage,
    userProductsLoading,
    savingUserProducts,
    importingCatalog,
    loadChannelData,
    loadUserPayments,
    // Modal states
    showAddUser,
    setShowAddUser,
    showEditUser,
    setShowEditUser,
    showCommissionPay,
    setShowCommissionPay,
    showAdjust,
    setShowAdjust,
    showImport,
    setShowImport,
    // Form states
    newUser,
    setNewUser,
    commPayForm,
    setCommPayForm,
    adjForm,
    setAdjForm,
    importing,
    importFile,
    setImportFile,
    importMonth,
    setImportMonth,
    // Handlers
    handleAddUser,
    handleEditUser,
    handleDeleteUser,
    handleInitPayments,
    handleRecordPayment,
    handleBulkFullPaid,
    handleGenerateCommission,
    handleCommissionPayment,
    handleAdjustment,
    handleFinalize,
    handleImport,
    handleDownloadReport,
    openCommissionPayment,
    handleImportCatalog,
    handleEditUserProducts,
    handleSaveUserProducts,
    closeUserProductsModal,
    showManualProductCharge,
    setShowManualProductCharge,
    manualProductChargeForm,
    setManualProductChargeForm,
    manualProductChargeLoading,
    handleSaveManualProductCharge,
  };
};
