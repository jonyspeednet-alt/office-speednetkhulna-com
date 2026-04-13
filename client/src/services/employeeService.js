import apiClient from '../config/axiosConfig';

const API_URL = '/api/employees';

export const getEmployees = async (params) => {
    const response = await apiClient.get(API_URL, { params });
    return response.data;
};

export const getDepartments = async () => {
    const response = await apiClient.get(`${API_URL}/departments`);
    return response.data;
};

export const getNextEmployeeId = async () => {
    const response = await apiClient.get(`${API_URL}/next-id`);
    return response.data.id;
};

export const addEmployee = async (formData) => {
    const response = await apiClient.post(API_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const getEmployeeById = async (id) => {
    const response = await apiClient.get(`${API_URL}/${id}`);
    return response.data;
};

export const updateEmployee = async (id, formData) => {
    const response = await apiClient.put(`${API_URL}/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};