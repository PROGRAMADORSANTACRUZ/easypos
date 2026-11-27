// Impresora termica de red para las tirillas en la APK (prefactura, factura, cierres...).
// Se configura en cada celular y la APK imprime directo por IP, sin RawBT.
import { llamarNativo } from './movil.js';

const CLAVE = 'pos.impresoraTirillas';
// Puntos por linea a 203 ppp segun el ancho del papel
export const PUNTOS_POR_PAPEL = { 58: 384, 80: 576 };

const IP_PRIVADA = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/;

export function validarImpresora({ ip, puerto, papel } = {}) {
  const ipLimpia = String(ip || '').trim();
  if (!IP_PRIVADA.test(ipLimpia) || ipLimpia.split('.').some((octeto) => Number(octeto) > 255)) {
    throw new Error('Escribe la IP de la impresora en la red del local (ej. 192.168.1.50).');
  }
  const puertoNum = Number(puerto || 9100);
  if (!Number.isInteger(puertoNum) || puertoNum < 1 || puertoNum > 65535) throw new Error('Puerto inválido.');
  const papelNum = Number(papel || 58);
  if (!PUNTOS_POR_PAPEL[papelNum]) throw new Error('El papel debe ser de 58 u 80 mm.');
  return { ip: ipLimpia, puerto: puertoNum, papel: papelNum };
}

export function leerImpresora(almacen = globalThis.localStorage) {
  try {
    const guardada = JSON.parse(almacen?.getItem(CLAVE) || 'null');
    return guardada ? validarImpresora(guardada) : null;
  } catch {
    return null;
  }
}

export function guardarImpresora(config, almacen = globalThis.localStorage) {
  const valida = validarImpresora(config);
  almacen.setItem(CLAVE, JSON.stringify(valida));
  return valida;
}

export function quitarImpresora(almacen = globalThis.localStorage) {
  almacen.removeItem(CLAVE);
}

// Ancho CSS en que se diseno la tirilla (segun su @page), para que la APK la ajuste al papel
export function anchoCssDeTirilla(html) {
  const coincidencia = /@page\s*\{\s*size:\s*(\d+(?:\.\d+)?)mm/i.exec(String(html || ''));
  const mm = coincidencia ? Number(coincidencia[1]) : 80;
  return Math.round((mm * 96) / 25.4);
}

// Una APK vieja no trae la impresion directa: Capacitor responde con codigo o con mensaje segun la version
export const sinImpresionDirecta = (error) => error?.code === 'UNIMPLEMENTED'
  || /not implemented|no method|unimplemented/i.test(String(error?.message || ''));

// --- Impresoras del local (compartidas por todos los celulares) ---
const CLAVE_CELULAR = 'pos.impresoraCelular';
export const SIN_IMPRESORA_DIRECTA = 'android';

// La prefactura sale siempre en esta impresora desde cualquier tablet, sin importar la que haya elegido cada una.
// Si en el engranaje se marca otra como "Imprime prefacturas y facturas", se usa esa.
export const IMPRESORA_PREFACTURAS = Object.freeze({ id: 'prefacturas', nombre: 'Prefacturas (192.168.0.93)', ip: '192.168.0.93', puerto: 9100, papel: 80 });

export function impresoraPrefacturas(impresoras = []) {
  return impresoras.find((impresora) => impresora.tirillas) || IMPRESORA_PREFACTURAS;
}

// Impresora donde este celular imprime prefacturas y facturas: la elegida en el celular; si no eligio, la
// marcada en el local como de prefacturas; si tampoco hay, la configuracion anterior de una sola IP.
export function impresoraDelCelular(impresoras = [], almacen = globalThis.localStorage) {
  let elegida = null;
  try { elegida = almacen?.getItem(CLAVE_CELULAR) ?? null; } catch { /* sin almacenamiento */ }
  if (elegida === SIN_IMPRESORA_DIRECTA) return null;
  const central = impresoras.find((impresora) => impresora.id === elegida);
  if (central) return central;
  const delLocal = impresoras.find((impresora) => impresora.tirillas);
  if (delLocal) return delLocal;
  const anterior = leerImpresora(almacen);
  return anterior ? { id: 'celular', nombre: `Este celular (${anterior.ip})`, ...anterior } : null;
}

export function elegirImpresoraCelular(id, almacen = globalThis.localStorage) {
  if (!id) {
    // Sin eleccion propia: el celular usa la impresora de prefacturas del local
    almacen.removeItem(CLAVE_CELULAR);
    return;
  }
  almacen.setItem(CLAVE_CELULAR, id);
  if (id !== 'celular') quitarImpresora(almacen);
}

export function impresoraCelularElegida(almacen = globalThis.localStorage) {
  try { return almacen?.getItem(CLAVE_CELULAR) ?? ''; } catch { return ''; }
}

// Reparte los productos del pedido entre las impresoras segun su categoria: cada producto sale SOLO en la
// impresora de su categoria. Lo que no tenga impresora asignada no se imprime en ninguna y se devuelve aparte.
export function repartirPorImpresora(items = [], impresoras = []) {
  const porCategoria = new Map();
  for (const impresora of impresoras) {
    for (const categoriaId of impresora.categoriaIds || []) {
      if (!porCategoria.has(categoriaId)) porCategoria.set(categoriaId, impresora);
    }
  }
  const grupos = new Map();
  const sinImpresora = [];
  for (const item of items) {
    const impresora = porCategoria.get(item.producto?.categoriaId || item.producto?.categoria?.id);
    if (!impresora) {
      sinImpresora.push(item);
      continue;
    }
    if (!grupos.has(impresora.id)) grupos.set(impresora.id, { impresora, items: [] });
    grupos.get(impresora.id).items.push(item);
  }
  const orden = (grupo) => impresoras.indexOf(grupo.impresora);
  return { grupos: [...grupos.values()].sort((a, b) => orden(a) - orden(b)), sinImpresora };
}

export function imprimirTirillaEnRed(html, config) {
  return llamarNativo('Impresion', 'imprimirTirillaRed', {
    html,
    ip: config.ip,
    puerto: config.puerto,
    anchoPuntos: PUNTOS_POR_PAPEL[config.papel],
    anchoCss: anchoCssDeTirilla(html),
  });
}

export const TIRILLA_PRUEBA = `<!doctype html><html><head><style>
@page { size: 80mm auto; margin: 0; } body { width: 80mm; margin: 0; font-family: sans-serif; text-align: center; }
h1 { font-size: 22px; margin: 8px 0; } p { font-size: 14px; margin: 4px 0; }
</style></head><body><h1>POS Santacruz</h1><p>Prueba de impresora</p><p>${'='.repeat(32)}</p>
<p>Si lees esto, la tirilla sale directo desde la APK.</p></body></html>`;
