import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Leads API
export const leadsAPI = {
  getAll: (limit = 1000) => axios.get(`${API_URL}/leads?limit=${limit}`, { headers: getAuthHeaders() }),
  getById: (id) => axios.get(`${API_URL}/leads/${id}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/leads`, data, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/leads/${id}`, data, { headers: getAuthHeaders() }),
  delete: (id) => axios.delete(`${API_URL}/leads/${id}`, { headers: getAuthHeaders() }),
};

// Activities API
export const activitiesAPI = {
  getByLeadId: (leadId) => axios.get(`${API_URL}/activities/${leadId}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/activities`, data, { headers: getAuthHeaders() }),
};

// Follow-ups API
export const followUpsAPI = {
  getAll: () => axios.get(`${API_URL}/follow-ups`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/follow-ups`, data, { headers: getAuthHeaders() }),
  complete: (id) => axios.put(`${API_URL}/follow-ups/${id}/complete`, {}, { headers: getAuthHeaders() }),
};

// Comments API
export const commentsAPI = {
  getByLeadId: (leadId) => axios.get(`${API_URL}/comments/${leadId}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/comments`, data, { headers: getAuthHeaders() }),
};

// Users API
export const usersAPI = {
  getAll: () => axios.get(`${API_URL}/users`, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/users/${id}`, data, { headers: getAuthHeaders() }),
};

// Analytics API
export const analyticsAPI = {
  getDashboard: () => axios.get(`${API_URL}/analytics/dashboard`, { headers: getAuthHeaders() }),
  getReports: () => axios.get(`${API_URL}/analytics/reports`, { headers: getAuthHeaders() }),
};
