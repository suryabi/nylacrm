import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Leads API with server-side pagination
export const leadsAPI = {
  getAll: (params = {}) => {
    const { page = 1, pageSize = 25, status, city, state, country, region, search, territory, assigned_to, time_filter, quadrant, sort_by, sort_order, target_closure_month, target_closure_year, target_closure_months, target_closure_years, pipeline_view } = params;
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
    if (target_closure_month) queryParams.append('target_closure_month', target_closure_month);
    if (target_closure_year) queryParams.append('target_closure_year', target_closure_year);
    if (target_closure_months) queryParams.append('target_closure_months', target_closure_months);
    if (target_closure_years) queryParams.append('target_closure_years', target_closure_years);
    if (pipeline_view) queryParams.append('pipeline_view', pipeline_view);
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
  getInvoices: (id, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.time_filter) queryParams.append('time_filter', params.time_filter);
    const queryString = queryParams.toString();
    return axios.get(`${API_URL}/accounts/${id}/invoices${queryString ? '?' + queryString : ''}`, { headers: getAuthHeaders() });
  },
  createInvoice: (id, data) => axios.post(`${API_URL}/accounts/${id}/invoices`, data, { headers: getAuthHeaders() }),
};

// Invoices API
export const invoicesAPI = {
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] && params[key] !== 'all') {
        queryParams.append(key, params[key]);
      }
    });
    return axios.get(`${API_URL}/invoices?${queryParams.toString()}`, { headers: getAuthHeaders() });
  },
  delete: (id) => axios.delete(`${API_URL}/invoices/${id}`, { headers: getAuthHeaders() }),
  bulkDelete: (ids) => axios.delete(`${API_URL}/invoices`, { 
    data: ids, 
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
  }),
  getSummary: (params = {}) => axios.get(`${API_URL}/invoices/summary`, { headers: getAuthHeaders(), params }),
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

// Investor Module API
export const investorAPI = {
  getPlan: (fy) => {
    const params = fy ? `?fy=${fy}` : '';
    return axios.get(`${API_URL}/investor/plan${params}`, { headers: getAuthHeaders() });
  },
  updatePlan: (data) => axios.put(`${API_URL}/investor/plan`, data, { headers: getAuthHeaders() }),
  getMonthly: (year, month) => axios.get(`${API_URL}/investor/monthly/${year}/${month}`, { headers: getAuthHeaders() }),
  updateMonthly: (year, month, data) => axios.put(`${API_URL}/investor/monthly/${year}/${month}`, data, { headers: getAuthHeaders() }),
  getComments: (params = {}) => {
    const q = new URLSearchParams();
    if (params.section) q.append('section', params.section);
    if (params.fy) q.append('fy', params.fy);
    if (params.year) q.append('year', params.year);
    if (params.month) q.append('month', params.month);
    return axios.get(`${API_URL}/investor/comments?${q.toString()}`, { headers: getAuthHeaders() });
  },
  addComment: (data) => axios.post(`${API_URL}/investor/comments`, data, { headers: getAuthHeaders() }),
  deleteComment: (id) => axios.delete(`${API_URL}/investor/comments/${id}`, { headers: getAuthHeaders() }),
};

// Marketing Module API
export const marketingAPI = {
  getCalendar: (month, year) => axios.get(`${API_URL}/marketing/calendar?month=${month}&year=${year}`, { headers: getAuthHeaders() }),
  getPosts: (params = {}) => {
    const q = new URLSearchParams();
    if (params.month) q.append('month', params.month);
    if (params.year) q.append('year', params.year);
    if (params.status) q.append('status', params.status);
    if (params.category) q.append('category', params.category);
    return axios.get(`${API_URL}/marketing/posts?${q.toString()}`, { headers: getAuthHeaders() });
  },
  getPost: (id) => axios.get(`${API_URL}/marketing/posts/${id}`, { headers: getAuthHeaders() }),
  createPost: (data) => axios.post(`${API_URL}/marketing/posts`, data, { headers: getAuthHeaders() }),
  updatePost: (id, data) => axios.put(`${API_URL}/marketing/posts/${id}`, data, { headers: getAuthHeaders() }),
  deletePost: (id) => axios.delete(`${API_URL}/marketing/posts/${id}`, { headers: getAuthHeaders() }),
  updatePostStatus: (id, status) => axios.put(`${API_URL}/marketing/posts/${id}/status`, { status }, { headers: getAuthHeaders() }),
  updatePostLinks: (id, platformLinks) => axios.put(`${API_URL}/marketing/posts/${id}/links`, { platform_links: platformLinks }, { headers: getAuthHeaders() }),
  getCategories: () => axios.get(`${API_URL}/marketing/categories`, { headers: getAuthHeaders() }),
  createCategory: (data) => axios.post(`${API_URL}/marketing/categories`, data, { headers: getAuthHeaders() }),
  updateCategory: (id, data) => axios.put(`${API_URL}/marketing/categories/${id}`, data, { headers: getAuthHeaders() }),
  deleteCategory: (id) => axios.delete(`${API_URL}/marketing/categories/${id}`, { headers: getAuthHeaders() }),
  getPlatforms: () => axios.get(`${API_URL}/marketing/platforms`, { headers: getAuthHeaders() }),
  updatePlatform: (id, data) => axios.put(`${API_URL}/marketing/platforms/${id}`, data, { headers: getAuthHeaders() }),
  getEvents: (month, year) => {
    const q = new URLSearchParams();
    if (month) q.append('month', month);
    if (year) q.append('year', year);
    return axios.get(`${API_URL}/marketing/events?${q.toString()}`, { headers: getAuthHeaders() });
  },
  createEvent: (data) => axios.post(`${API_URL}/marketing/events`, data, { headers: getAuthHeaders() }),
  deleteEvent: (id) => axios.delete(`${API_URL}/marketing/events/${id}`, { headers: getAuthHeaders() }),
  downloadTemplate: () => axios.get(`${API_URL}/marketing/template`, { headers: getAuthHeaders(), responseType: 'blob' }),
  exportPosts: (month, year) => axios.get(`${API_URL}/marketing/export?month=${month}&year=${year}`, { headers: getAuthHeaders(), responseType: 'blob' }),
  uploadPreview: (file) => { const fd = new FormData(); fd.append('file', file); const h = getAuthHeaders(); delete h['Content-Type']; return axios.post(`${API_URL}/marketing/upload-preview`, fd, { headers: h }); },
  uploadConfirm: (month, year, rows) => axios.post(`${API_URL}/marketing/upload-confirm`, { month, year, rows }, { headers: getAuthHeaders() }),
  // Event Types (master data)
  getEventTypes: () => axios.get(`${API_URL}/marketing/event-types`, { headers: getAuthHeaders() }),
  createEventType: (data) => axios.post(`${API_URL}/marketing/event-types`, data, { headers: getAuthHeaders() }),
  updateEventType: (id, data) => axios.put(`${API_URL}/marketing/event-types/${id}`, data, { headers: getAuthHeaders() }),
  deleteEventType: (id) => axios.delete(`${API_URL}/marketing/event-types/${id}`, { headers: getAuthHeaders() }),
  // Calendar Events (full events with requirements & tasks)
  getCalendarEvents: (month, year) => {
    const q = new URLSearchParams();
    if (month) q.append('month', month);
    if (year) q.append('year', year);
    return axios.get(`${API_URL}/marketing/calendar-events?${q.toString()}`, { headers: getAuthHeaders() });
  },
  getCalendarEvent: (id) => axios.get(`${API_URL}/marketing/calendar-events/${id}`, { headers: getAuthHeaders() }),
  createCalendarEvent: (data) => axios.post(`${API_URL}/marketing/calendar-events`, data, { headers: getAuthHeaders() }),
  updateCalendarEvent: (id, data) => axios.put(`${API_URL}/marketing/calendar-events/${id}`, data, { headers: getAuthHeaders() }),
  deleteCalendarEvent: (id) => axios.delete(`${API_URL}/marketing/calendar-events/${id}`, { headers: getAuthHeaders() }),
  // Comments (shared for posts & events)
  getComments: (entityType, entityId) => axios.get(`${API_URL}/marketing/comments/${entityType}/${entityId}`, { headers: getAuthHeaders() }),
  addComment: (entityType, entityId, content) => axios.post(`${API_URL}/marketing/comments/${entityType}/${entityId}`, { content }, { headers: getAuthHeaders() }),
  deleteComment: (commentId) => axios.delete(`${API_URL}/marketing/comments/${commentId}`, { headers: getAuthHeaders() }),
};


export const meetingMinutesAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.month) q.append('month', params.month);
    if (params.year) q.append('year', params.year);
    if (params.periodicity) q.append('periodicity', params.periodicity);
    if (params.purpose) q.append('purpose', params.purpose);
    if (params.participant) q.append('participant', params.participant);
    return axios.get(`${API_URL}/meeting-minutes?${q.toString()}`, { headers: getAuthHeaders() });
  },
  get: (id) => axios.get(`${API_URL}/meeting-minutes/${id}`, { headers: getAuthHeaders() }),
  create: (data) => axios.post(`${API_URL}/meeting-minutes`, data, { headers: getAuthHeaders() }),
  update: (id, data) => axios.put(`${API_URL}/meeting-minutes/${id}`, data, { headers: getAuthHeaders() }),
  delete: (id) => axios.delete(`${API_URL}/meeting-minutes/${id}`, { headers: getAuthHeaders() }),
};
