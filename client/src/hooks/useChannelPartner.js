import { useState, useEffect, useCallback } from "react";
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
} from "../services/channelPartnerService";
import { getDhakaDateYmd } from "../utils/formatters";

export const useChannelPartner = (profileId, isChannel) => {
  const [cpUsers, setCpUsers] = useState([]);
  const [cpMonth, setCpMonth] = useState(getDhakaDateYmd().slice(0, 7));
  const [cpUserPayments, setCpUserPayments] = useState([]);
  const [cpCommission, setCpCommission] = useState(null);
  const [cpHistory, setCpHistory] = useState([]);
  const [cpStatement, setCpStatement] = useState([]);
  const [cpPayments, setCpPayments] = useState([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpUserSearch, setCpUserSearch] = useState("");

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(null);
  const [showCommissionPay, setShowCommissionPay] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMonth, setImportMonth] = useState(getDhakaDateYmd().slice(0, 7));

  const loadChannelData = useCallback(async () => {
    if (!profileId || !isChannel) return;
    setCpLoading(true);
    try {
      const [users, commission, history, statement, payments] =
        await Promise.all([
          getChannelUsers(profileId).catch(() => []),
          getCommissionSummary(profileId, cpMonth).catch(() => null),
          getCommissionHistory(profileId).catch(() => []),
          getChannelStatement(profileId).catch(() => []),
          getCommissionPayments(profileId).catch(() => []),
        ]);
      setCpUsers(users);
      setCpCommission(commission);
      setCpHistory(history);
      setCpStatement(statement);
      setCpPayments(payments);
    } catch (e) {
      /* ignore */
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

  const handleAddUser = async (e) => {
    e.preventDefault();
    await addChannelUser(profileId, newUser);
    setShowAddUser(false);
    setNewUser({
      user_name: "",
      user_id_code: "",
      phone: "",
      package_name: "",
      monthly_rate: "",
    });
    loadChannelData();
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    await updateChannelUser(profileId, showEditUser.id, showEditUser);
    setShowEditUser(null);
    loadChannelData();
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm("এই ইউজার মুছে ফেলতে চান?")) {
      await deleteChannelUser(profileId, userId);
      loadChannelData();
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
    await generateCommission(profileId, cpMonth);
    loadChannelData();
  };

  const handleCommissionPayment = async (e) => {
    e.preventDefault();
    if (!commPayForm.commission_log_id) {
      window.alert(
        "কমিশন পেমেন্ট করার আগে একটি finalized কমিশন মাস নির্বাচন করুন।",
      );
      return;
    }
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
    loadChannelData();
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

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importChannelData(profileId, importMonth, importFile);
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
  };
};
