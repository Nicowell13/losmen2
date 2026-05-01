const API_URL = ''; // Proxy via Vercel rewrites (next.config.mjs)

/**
 * Wrapper untuk fetch API dengan JWT token otomatis.
 */
async function apiFetch(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Auto-redirect ke login jika token expired
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('admin');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request gagal');
  }

  return data;
}

// Auth
export async function login(username, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('admin', JSON.stringify(data.admin));
  }
  return data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('admin');
  window.location.href = '/login';
}

export function getStoredAdmin() {
  if (typeof window === 'undefined') return null;
  const admin = localStorage.getItem('admin');
  return admin ? JSON.parse(admin) : null;
}

export function isLoggedIn() {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('token');
}

// Dashboard
export const getDashboard = () => apiFetch('/api/dashboard');

// Kamar
export const getKamar = () => apiFetch('/api/kamar');
export const createKamar = (data) => apiFetch('/api/kamar', { method: 'POST', body: JSON.stringify(data) });
export const updateKamar = (id, data) => apiFetch(`/api/kamar/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteKamar = (id) => apiFetch(`/api/kamar/${id}`, { method: 'DELETE' });

// Booking
export const getBooking = (params = '') => apiFetch(`/api/booking${params ? '?' + params : ''}`);
export const createBooking = (data) => apiFetch('/api/booking', { method: 'POST', body: JSON.stringify(data) });
export const updateBooking = (id, data) => apiFetch(`/api/booking/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBooking = (id) => apiFetch(`/api/booking/${id}`, { method: 'DELETE' });

// Info
export const getInfo = () => apiFetch('/api/info');
export const updateInfo = (items) => apiFetch('/api/info', { method: 'PUT', body: JSON.stringify({ items }) });
export const deleteInfo = (id) => apiFetch(`/api/info/${id}`, { method: 'DELETE' });

// Health
export const checkHealth = () => apiFetch('/api/health');

// WhatsApp (WAHA)
export const getWhatsAppStatus = () => apiFetch('/api/whatsapp/status');
export const getWhatsAppQR = () => apiFetch('/api/whatsapp/qr');
export const startWhatsApp = () => apiFetch('/api/whatsapp/start', { method: 'POST' });
export const stopWhatsApp = () => apiFetch('/api/whatsapp/stop', { method: 'POST' });
export const restartWhatsApp = () => apiFetch('/api/whatsapp/restart', { method: 'POST' });
export const logoutWhatsApp = () => apiFetch('/api/whatsapp/logout', { method: 'POST' });
