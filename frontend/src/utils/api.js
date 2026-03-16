import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Leads API with server-side pagination
export const leadsAPI = {
  getAll: (params = {}) => {
    const { page = 1, pageSize = 25, status, city, state, country, region, search, territory, assigned_to, time_filter, quadrant, sort_by, sort_order } = params;
    const queryParams = new URLSearchParams();
    queryParams.append('page', page);
    queryParams.append('page_size', pageSize);
    if (status) queryParams.append('status', status);
    if (city) queryParams.append('city', city);
    if (state) queryParams.append('state', state);
    if (country) queryParams.append('country', country);
    if (region) queryParams.append('region', region);
    if (territory) queryParams.append('territory', territory);
    if (assigned_to) queryParams.append('assigned_to', assigned_to);
    if (time_filter) queryParams.append('time_filter', time_filter);
    if (search) queryParams.append('search', search);
    if (quadrant) queryParams.append('quadrant', quadrant);
    if (sort_by) queryParams.append('sort_by', sort_by);
    if (sort_order) queryParams.append('sort_order', sort_order);
    return axios.get(`${API_URL}/leads?${queryParams.toString()}`, { headers: getAuthHeaders() });
  },
  getById: (id) => axios.get(`${API_URL}/leads/${id}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/leads`, data, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/leads/${id}`, data, { headers: getAuthHeaders() }),
  delete: (id) => axios.delete(`${API_URL}/leads/${id}`, { headers: getAuthHeaders() }),
  generateLeadId: (id) => axios.post(`${API_URL}/leads/${id}/generate-lead-id`, {}, { headers: getAuthHeaders() }),
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

// Accounts API with server-side pagination
export const accountsAPI = {
  getAll: (params = {}) => {
    const { page = 1, pageSize = 25, search, territory, account_type } = params;
    const queryParams = new URLSearchParams();
    queryParams.append('page', page);
    queryParams.append('page_size', pageSize);
    if (search) queryParams.append('search', search);
    if (territory) queryParams.append('territory', territory);
    if (account_type) queryParams.append('account_type', account_type);
    return axios.get(`${API_URL}/accounts?${queryParams.toString()}`, { headers: getAuthHeaders() });
  },
  getById: (id) => axios.get(`${API_URL}/accounts/${id}`, { headers: getAuthHeaders() }),
  convertFromLead: (leadId) => axios.post(`${API_URL}/accounts/convert-lead`, { lead_id: leadId }, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/accounts/${id}`, data, { headers: getAuthHeaders() }),
  delete: (id) => axios.delete(`${API_URL}/accounts/${id}`, { headers: getAuthHeaders() }),
  getInvoices: (id) => axios.get(`${API_URL}/accounts/${id}/invoices`, { headers: getAuthHeaders() }),
  createInvoice: (id, data) => axios.post(`${API_URL}/accounts/${id}/invoices`, data, { headers: getAuthHeaders() }),
};

// Master SKUs API with full CRUD
export const skusAPI = {
  getMasterList: (includeInactive = false) => 
    axios.get(`${API_URL}/master-skus?include_inactive=${includeInactive}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/master-skus`, data, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/master-skus/${id}`, data, { headers: getAuthHeaders() }),
  delete: (id) => axios.delete(`${API_URL}/master-skus/${id}`, { headers: getAuthHeaders() }),
  getCategories: () => axios.get(`${API_URL}/sku-categories`, { headers: getAuthHeaders() }),
};

// Files & Documents API
export const filesAPI = {
  // Categories
  getCategories: () => axios.get(`${API_URL}/document-categories`, { headers: getAuthHeaders() }),
  createCategory: (data) => axios.post(`${API_URL}/document-categories`, data, { headers: getAuthHeaders() }),
  updateCategory: (id, data) => axios.put(`${API_URL}/document-categories/${id}`, data, { headers: getAuthHeaders() }),
  deleteCategory: (id) => axios.delete(`${API_URL}/document-categories/${id}`, { headers: getAuthHeaders() }),
  
  // Subcategories
  getSubcategories: (categoryId = null) => {
    const url = categoryId 
      ? `${API_URL}/document-subcategories?category_id=${categoryId}`
      : `${API_URL}/document-subcategories`;
    return axios.get(url, { headers: getAuthHeaders() });
  },
  createSubcategory: (data) => axios.post(`${API_URL}/document-subcategories`, data, { headers: getAuthHeaders() }),
  updateSubcategory: (id, data) => axios.put(`${API_URL}/document-subcategories/${id}`, data, { headers: getAuthHeaders() }),
  deleteSubcategory: (id) => axios.delete(`${API_URL}/document-subcategories/${id}`, { headers: getAuthHeaders() }),
  
  // Documents
  getDocuments: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.category_id) queryParams.append('category_id', params.category_id);
    if (params.subcategory_id) queryParams.append('subcategory_id', params.subcategory_id);
    const url = queryParams.toString() ? `${API_URL}/documents?${queryParams.toString()}` : `${API_URL}/documents`;
    return axios.get(url, { headers: getAuthHeaders() });
  },
  getDocument: (id) => axios.get(`${API_URL}/documents/${id}`, { headers: getAuthHeaders() }),
  uploadDocument: (formData) => axios.post(`${API_URL}/documents/upload`, formData, { 
    headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' }
  }),
  deleteDocument: (id) => axios.delete(`${API_URL}/documents/${id}`, { headers: getAuthHeaders() }),
};
