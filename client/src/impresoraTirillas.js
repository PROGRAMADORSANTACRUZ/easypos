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
