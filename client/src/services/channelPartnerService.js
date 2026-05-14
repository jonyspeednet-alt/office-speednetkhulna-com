import apiClient from "../config/axiosConfig";

const base = "/api/channel-partners";

// User management
export const getChannelUsers = async (resellerId, options = {}) => {
  const params = {};
  if (options.status) params.status = options.status;
  if (options.search) params.search = options.search;
  return (await apiClient.get(`${base}/${resellerId}/users`, { params })).data;
};

export const addChannelUser = async (resellerId, payload) =>
  (await apiClient.post(`${base}/${resellerId}/users`, payload)).data;

export const updateChannelUser = async (resellerId, userId, payload) =>
  (await apiClient.put(`${base}/${resellerId}/users/${userId}`, payload)).data;

export const deleteChannelUser = async (resellerId, userId) =>
  (await apiClient.delete(`${base}/${resellerId}/users/${userId}`)).data;

// User payment collection tracking
export const getUserPayments = async (resellerId, month) =>
  (
    await apiClient.get(`${base}/${resellerId}/user-payments`, {
      params: { month },
    })
  ).data;

export const initMonthlyPayments = async (resellerId, month) =>
  (await apiClient.post(`${base}/${resellerId}/user-payments/init`, { month }))
    .data;

export const recordUserPayment = async (resellerId, payload) =>
  (await apiClient.post(`${base}/${resellerId}/user-payments/record`, payload))
    .data;

export const bulkRecordPayments = async (resellerId, month, payments) =>
  (
    await apiClient.post(`${base}/${resellerId}/user-payments/bulk`, {
      month,
      payments,
    })
  ).data;

// Commission
export const getCommissionSummary = async (resellerId, month) =>
  (
    await apiClient.get(`${base}/${resellerId}/commission-summary`, {
      params: { month },
    })
  ).data;

export const generateCommission = async (resellerId, month) =>
  (await apiClient.post(`${base}/${resellerId}/commission-generate`, { month }))
    .data;

export const adjustCommission = async (resellerId, logId, payload) =>
  (
    await apiClient.patch(
      `${base}/${resellerId}/commission/${logId}/adjust`,
      payload,
    )
  ).data;

export const finalizeCommission = async (resellerId, logId) =>
  (await apiClient.patch(`${base}/${resellerId}/commission/${logId}/finalize`))
    .data;

export const getCommissionHistory = async (resellerId) =>
  (await apiClient.get(`${base}/${resellerId}/commission-history`)).data;

// Commission payments (to partner)
export const recordCommissionPayment = async (resellerId, payload) =>
  (await apiClient.post(`${base}/${resellerId}/commission-payments`, payload))
    .data;

export const getCommissionPayments = async (resellerId) =>
  (await apiClient.get(`${base}/${resellerId}/commission-payments`)).data;

// Statement
export const getChannelStatement = async (resellerId) =>
  (await apiClient.get(`${base}/${resellerId}/statement`)).data;

// Excel Import
export const importChannelData = async (resellerId, month, file) => {
  const formData = new FormData();
  formData.append("month", month);
  formData.append("file", file);
  return (
    await apiClient.post(`${base}/${resellerId}/import-user-list`, formData)
  ).data;
};

export const downloadReconciliationReport = async (
  resellerId,
  reconciliationId,
) => {
  const response = await apiClient.get(
    `${base}/${resellerId}/reconciliation/${reconciliationId}/report`,
  );
  if (response.data?.pdf_url) {
    window.open(response.data.pdf_url, "_blank");
  }
  return response.data;
};

export const getReconciliations = async (resellerId) =>
  (await apiClient.get(`${base}/${resellerId}/reconciliation/list`)).data;
