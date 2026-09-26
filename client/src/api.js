// Cliente HTTP minimo para la API de EASYPOS
// BASE es relativo por defecto (funciona con el proxy de Vite en dev, o detrás de un
// reverse proxy en producción). Si el frontend corre en un origen distinto al backend
// (ej. la app de escritorio, que sirve cada uno en su propio puerto), se usa la URL
// absoluta inyectada en window.EASYPOS_API_URL.
const BASE = (typeof window !== 'undefined' && window.EASYPOS_API_URL) || '/api';

// Id del usuario en sesion, para que el backend registre la auditoria
function usuarioIdActual() {
  try {
    return JSON.parse(localStorage.getItem('easypos_user'))?.id ?? null;
  } catch {
    return null;
  }
}

// Token de sesion (JWT) devuelto por /usuarios/login. Sin este token, el backend
// rechaza la solicitud con 401 (no hay acceso anonimo a la API).
function tokenActual() {
  try {
    return JSON.parse(localStorage.getItem('easypos_user'))?.token ?? null;
  } catch {
    return null;
  }
}

// Restaurante (tenant) en sesion: cada request queda asociado a su base de datos
export function tenantActual() {
  return localStorage.getItem('easypos_tenant') || null;
}
export function setTenantActual(slugOId) {
  if (slugOId) localStorage.setItem('easypos_tenant', slugOId);
  else localStorage.removeItem('easypos_tenant');
}

async function request(path, options = {}) {
  const uid = usuarioIdActual();
  const tenant = tenantActual();
  const token = tokenActual();
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(uid != null && { 'x-usuario-id': String(uid) }),
      ...(tenant && { 'x-tenant-id': tenant }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  });
  if (res.status === 401 && !path.startsWith('/usuarios/login')) {
    // Sesion vencida o token invalido: se limpia y se vuelve a pedir login.
    localStorage.removeItem('easypos_user');
    window.location.reload();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let msg = 'Error en la solicitud';
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      // respuesta sin cuerpo JSON
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body) }),
  del: (p) => request(p, { method: 'DELETE' }),
};

export const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
