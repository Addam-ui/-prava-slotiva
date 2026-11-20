export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(url, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(url.startsWith('/api/app') && sessionStorage.getItem('slotiva-staff-id') ? { 'X-Slotiva-Staff': sessionStorage.getItem('slotiva-staff-id') } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Server je nedostupný. Zkontrolujte připojení.', 0, {});
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && (url.startsWith('/api/app') || url.startsWith('/api/admin'))) window.dispatchEvent(new CustomEvent('auth:required'));
  if (!res.ok) throw new ApiError(data.error || `Chyba serveru (${res.status}).`, res.status, data);
  return data;
}

export const api = (path, options) => request(`/api/app${path}`, options);
export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const put = (path, body = {}) => api(path, { method: 'PUT', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
export const del = (path, body) => api(path, { method: 'DELETE', body });
export const authPost = async (path, body = {}) => {
  const result = await request(`/api/auth${path}`, { method: 'POST', body });
  if (['/login', '/logout'].includes(path)) sessionStorage.removeItem('slotiva-staff-id');
  return result;
};

/* Správcovská část – jen pro účty s právy správce. */
const adminApi = (path, options) => request(`/api/admin${path}`, options);
export const adminGet = (path) => adminApi(path);
export const adminPost = (path, body = {}) => adminApi(path, { method: 'POST', body });
export const adminDel = (path) => adminApi(path, { method: 'DELETE' });

export function query(params) {
  const clean = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
}
