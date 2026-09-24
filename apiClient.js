export function resolveApiBase() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return process.env.API_BASE || 'http://127.0.0.1:3001';
}

function getToken() {
  try {
    const s = localStorage.getItem('jansahyog_twotensors_session_v1');
    if (!s) return null;
    const obj = JSON.parse(s);
    return obj.token || null;
  } catch {
    return null;
  }
}

async function apiFetch(path, opts = {}) {
  const base = resolveApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const headers = opts.headers ? { ...opts.headers } : {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!headers['Content-Type'] && opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...opts, headers });
  return res;
}

export default {
  get: (p) => apiFetch(p, { method: 'GET' }),
  post: (p, body) => apiFetch(p, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  fetch: apiFetch,
};
