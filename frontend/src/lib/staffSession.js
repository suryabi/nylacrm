// Factory Staff scan session (Face/PIN) — shared by maintenance QR pages.
const KEY = 'factory_staff_session';
const HOURS = 12;

export const getStaffSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.id && Date.now() - (s.at || 0) < HOURS * 3600 * 1000) return s;
  } catch { /* ignore */ }
  return null;
};

export const saveStaffSession = (member, token) => {
  const s = { id: member.id, name: member.name, role: member.role || '', token: token || null, at: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
};

export const clearStaffSession = () => localStorage.removeItem(KEY);

// App session (supervisor tablet) OR staff token (personal phone).
export const scanAuthHeaders = (extra = {}) => {
  const h = { ...extra };
  const app = localStorage.getItem('session_token');
  const staff = getStaffSession();
  if (app) h.Authorization = `Bearer ${app}`;
  if (staff?.token) h['X-Staff-Token'] = staff.token;
  return h;
};
