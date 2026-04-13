import apiClient from '../config/axiosConfig';

export const getUserProfile = async (id = null, month = '', year = '') => {
  try {
    const params = { month, year };
    let url = '/api/profile';
    if (id) {
      url += `/${id}`;
    }
    const response = await apiClient.get(url, { params });
    return response.data;
  } catch (error) {
    throw error;
  }
};