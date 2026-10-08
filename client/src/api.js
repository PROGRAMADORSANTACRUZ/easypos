// Cliente HTTP minimo para la API de EASYPOS
// BASE es relativo por defecto (funciona con el proxy de Vite en dev, o detrás de un
// reverse proxy en producción). Si el frontend corre en un origen distinto al backend
// (ej. la app de escritorio, que sirve cada uno en su propio puerto), se usa la URL
// absoluta inyectada en window.EASYPOS_API_URL.
const BASE = (typeof window !== 'undefined' && window.EASYPOS_API_URL) || '/api';

let usuarioSesion = null;
let tenantSesion = null;

function limpiarPersistenciaLocalAnterior() {
  try {
    for (let indice = localStorage.length - 1; indice >= 0; indice -= 1) {
      const clave = localStorage.key(indice);
      if (clave?.startsWith('easypos_')) localStorage.removeItem(clave);
    }
  } catch {
    // El almacenamiento local no es necesario para el funcionamiento de la app.
  }
}

if (typeof window !== 'undefined') limpiarPersistenciaLocalAnterior();

// Id del usuario en sesion, para que el backend registre la auditoria
function usuarioIdActual() {
  return usuarioSesion?.id ?? null;
}

// Token de sesion (JWT) devuelto por /usuarios/login. Sin este token, el backend
// rechaza la solicitud con 401 (no hay acceso anonimo a la API).
function tokenActual() {
  return usuarioSesion?.token ?? null;
}

// Restaurante (tenant) en sesion: cada request queda asociado a su base de datos
export function tenantActual() {
  return tenantSesion;
}

export function setTenantActual(slugOId) {
  tenantSesion = slugOId || null;
}

export function setUsuarioActual(usuario) {
  usuarioSesion = usuario || null;
}

export function limpiarSesionActual() {
  usuarioSesion = null;
  tenantSesion = null;
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
    limpiarSesionActual();
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
