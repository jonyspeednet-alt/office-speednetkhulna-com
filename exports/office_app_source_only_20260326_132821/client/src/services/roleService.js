import apiClient from '../config/axiosConfig';

export const getRoles = async () => {
  const response = await apiClient.get('/api/roles');
  return response.data;
};

export const saveRole = async (roleData) => {
  const response = await apiClient.post('/api/roles/save', roleData);
  return response.data;
};

export const deleteRole = async (id) => {
  const response = await apiClient.delete(`/api/roles/${id}`);
  return response.data;
};

export const assignRoleToUser = async (userId, roleId) => {
  const response = await apiClient.post('/api/roles/assign', { user_id: userId, role_id: roleId });
  return response.data;
};
