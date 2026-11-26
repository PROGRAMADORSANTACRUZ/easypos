// Lista de impresoras del local guardada en el servidor. Se guarda una copia en el celular para
// seguir imprimiendo si la red al servidor falla un momento.
import { api } from './api.js';

const CLAVE_COPIA = 'pos.impresorasLocal';
const VIGENCIA_MS = 60 * 1000;
let cache = null;

export async function obtenerImpresorasLocal({ refrescar = false } = {}) {
  if (!refrescar && cache && Date.now() - cache.fecha < VIGENCIA_MS) return cache.datos;
  try {
    const datos = await api.get('/impresoras');
    cache = { fecha: Date.now(), datos };
    try { localStorage.setItem(CLAVE_COPIA, JSON.stringify(datos)); } catch { /* sin almacenamiento */ }
    return datos;
  } catch (error) {
    try {
      const copia = JSON.parse(localStorage.getItem(CLAVE_COPIA) || 'null');
      if (copia) return copia;
    } catch { /* copia dañada */ }
    throw error;
  }
}

export async function guardarImpresorasLocal(impresoras) {
  const respuesta = await api.put('/impresoras', { impresoras });
  cache = null;
  return respuesta;
}
