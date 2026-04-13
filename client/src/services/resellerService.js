import apiClient from '../config/axiosConfig';

export const getResellers = async (search = '', options = {}) => {
  const params = { search };
  if (options.status) params.status = options.status;
  return (await apiClient.get('/api/resellers/resellers', { params })).data;
};
export const getPartnerSheetRows = async (tab) => (await apiClient.get('/api/resellers/partner-sheets', { params: { tab } })).data;
export const createReseller = async (payload) => (await apiClient.post('/api/resellers/resellers', payload)).data;
export const getResellerProfile = async (id) => (await apiClient.get(`/api/resellers/resellers/${id}`)).data;
export const getResellerProfileDetails = async (id) => (await apiClient.get(`/api/resellers/resellers/${id}/details`)).data;
export const updateReseller = async (id, payload) => (await apiClient.put(`/api/resellers/resellers/${id}`, payload)).data;

export const getResellerStatusNoc = async (options = {}) => {
  const params = {};
  if (options.status) params.status = options.status;
  return (await apiClient.get('/api/resellers/reseller-status-noc', { params })).data;
};

export const submitBandwidthRequest = async (payload) => (await apiClient.post('/api/resellers/bandwidth-requests', payload)).data;
export const getBandwidthRequests = async (status = '') => (await apiClient.get('/api/resellers/bandwidth-requests', { params: { status } })).data;
export const reviewBandwidthRequest = async (id, status, note = undefined) => (
  await apiClient.patch(`/api/resellers/bandwidth-requests/${id}/review`, {
    status,
    ...(note !== undefined ? { note } : {})
  })
).data;
export const applyBandwidthRequest = async (id, payload = {}) => (await apiClient.post(`/api/resellers/bandwidth-requests/${id}/apply`, payload)).data;

export const getBillingLogs = async (reseller_id = '') => (await apiClient.get('/api/resellers/billing-logs', { params: { reseller_id } })).data;
export const addBillingLog = async (payload) => (await apiClient.post('/api/resellers/billing-logs', payload)).data;
export const addDiscount = async (resellerId, payload) => (await apiClient.post(`/api/resellers/resellers/${resellerId}/discounts`, payload)).data;

export const getMonthlySummary = async (month = '') =>
  (await apiClient.get('/api/resellers/monthly-summary', {
    params: { month },
    timeout: 60000
  })).data;

export const getInvoice = async (resellerId, month = '') => (await apiClient.get(`/api/resellers/invoice/${resellerId}`, { params: { month } })).data;
export const getInvoiceByBillId = async (billId) => (await apiClient.get(`/api/resellers/invoice/by-bill/${billId}`)).data;
export const sendInvoiceEmail = async (resellerId, payload) => (await apiClient.post(`/api/resellers/invoice/${resellerId}/send-email`, payload)).data;
export const sendInvoiceEmailByBillId = async (billId, payload) => (await apiClient.post(`/api/resellers/invoice/by-bill/${billId}/send-email`, payload)).data;


export const updateMonthlySummaryPayDate = async (reseller_id, date) => (await apiClient.patch('/api/resellers/monthly-summary/next-pay-date', { reseller_id, date })).data;


