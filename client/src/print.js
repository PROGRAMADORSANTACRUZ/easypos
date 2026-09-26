// Utilidades compartidas para imprimir tickets/documentos POS en distintos formatos de papel,
// configurables por tipo de documento en Empresa (Parámetros).
import { api } from './api.js';

export const FORMATOS_IMPRESION = {
  TICKET_80: { mm: 80, label: 'Ticket 80mm (térmica estándar)' },
  TICKET_58: { mm: 58, label: 'Ticket 58mm (térmica angosta)' },
  A5: { mm: 148, label: 'Media carta A5 (impresora normal)' },
};

let empresaCache = null;
let empresaCargando = null;

// Trae (con cache) los datos de Empresa para saber que formato usar; evita que cada
// pantalla tenga que cargar /empresa solo para esto.
async function obtenerEmpresa() {
  if (empresaCache) return empresaCache;
  if (!empresaCargando) empresaCargando = api.get('/empresa').catch(() => null);
  empresaCache = await empresaCargando;
  return empresaCache;
}

// Si una pantalla ya cargó /empresa, comparte el dato para no repetir la llamada.
export function registrarEmpresa(empresa) {
  if (empresa) empresaCache = empresa;
}

// Formato de impresión (TICKET_80 por defecto) configurado para un campo de Empresa
// (ej. 'formatoFactura', 'formatoComanda', 'formatoCortesia', 'formatoPrefactura', 'formatoFacturaVenta').
export async function formatoDe(campoEmpresa) {
  const empresa = await obtenerEmpresa();
  const clave = empresa?.[campoEmpresa];
  return FORMATOS_IMPRESION[clave] ? clave : 'TICKET_80';
}

// Bloque CSS de página/ancho según el formato. Las plantillas se diseñan en base a 80mm;
// para otros anchos se reescala todo con `zoom` en vez de retocar cada plantilla a mano.
export function estiloPagina(formato) {
  const cfg = FORMATOS_IMPRESION[formato] || FORMATOS_IMPRESION.TICKET_80;
  const zoom = cfg.mm / FORMATOS_IMPRESION.TICKET_80.mm;
  return `
    @page { size: ${cfg.mm}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; margin: 0; padding: 0; zoom: ${zoom}; }
  `;
}

// Abre una ventana en blanco. Debe llamarse de forma SÍNCRONA (primera línea de la función,
// antes de cualquier await) para que el navegador no bloquee el popup por no venir de un gesto
// del usuario "reciente" — si se abre después de un await, Chrome/Edge lo bloquean en silencio.
export function abrirVentanaVacia() {
  return window.open('', '_blank', 'width=380,height=640');
}

// Escribe el HTML en una ventana ya abierta (ver abrirVentanaVacia) y espera a que las imágenes
// (ej. QR externo) carguen antes de imprimir. No cierra la ventana sola (evita la "pantalla en blanco").
export function escribirEImprimir(win, html) {
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  let yaImprimio = false;
  const imprimirAhora = () => {
    if (yaImprimio) return;
    yaImprimio = true;
    try { win.print(); } catch { /* ignorar */ }
  };
  const imprimirCuandoListo = () => {
    const imgs = Array.from(win.document.images || []);
    const pendientes = imgs.filter((img) => !img.complete);
    if (pendientes.length === 0) return imprimirAhora();
    let restantes = pendientes.length;
    const seguir = () => { restantes -= 1; if (restantes <= 0) imprimirAhora(); };
    pendientes.forEach((img) => { img.addEventListener('load', seguir); img.addEventListener('error', seguir); });
    setTimeout(imprimirAhora, 2000); // respaldo si alguna imagen nunca carga
  };
  win.onload = imprimirCuandoListo;
  setTimeout(imprimirCuandoListo, 300);
}

// Atajo para cuando no hay ningun await previo (no hay riesgo de bloqueo de popup).
export function imprimirHtml(html) {
  escribirEImprimir(abrirVentanaVacia(), html);
}
