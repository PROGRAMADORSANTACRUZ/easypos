// Piezas de bajo nivel para hablar con Siesa UNO EE (plano de ancho fijo, XML/SOAP de ImportarXML).
// No depende de Prisma, asi que tambien las usa el agente que corre en el PC con la VPN de AWS.
const TIMEOUT_MS = 30_000;

export function configSiesa(env = process.env) {
  return {
    activo: String(env.SIESA_VENTAS_ACTIVO || '').toLowerCase() === 'true',
    url: env.SIESA_WS_URL || '',
    conexion: env.SIESA_WS_CONEXION || '',
    idCia: env.SIESA_WS_CIA || '',
    usuario: env.SIESA_WS_USER || '',
    clave: env.SIESA_WS_PASSWORD || '',
  };
}

export function limpiarTexto(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}

// Texto de ancho fijo: se recorta si sobra y se completa con espacios a la derecha.
export const texto = (valor, ancho) => limpiarTexto(valor).slice(0, ancho).padEnd(ancho, ' ');

export function numero(valor, ancho, decimales = 0) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor numerico invalido para Siesa: ${valor}`);
  const cifras = n.toFixed(decimales);
  if (cifras.length > ancho) throw new Error(`Valor numerico fuera de rango para Siesa: ${valor}`);
  return cifras.padStart(ancho, '0');
}

export const consecutivo = (n) => String(n).padStart(7, '0');

// Codigo de sucursal de Siesa (3 digitos) de un cliente del POS: la posicion de la sucursal entre todas las del
// cliente, ordenadas por id (el id sigue la secuencia de creacion). Sin sucursales, o si no se encuentra, es 001.
export function codigoSucursalSiesa(sucursales, { id, nombre } = {}) {
  const todas = [...(sucursales || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const normal = (v) => limpiarTexto(v).toLowerCase();
  let indice = id ? todas.findIndex((s) => s.id === id) : -1;
  if (indice < 0 && nombre) indice = todas.findIndex((s) => normal(s.nombre) === normal(nombre));
  return String(indice < 0 ? 1 : indice + 1).padStart(3, '0');
}

// NIT sin puntos ni digito de verificacion; vacio si no hay documento. El codigo del tercero en Siesa es solo
// numerico, asi que un documento con letras u otros simbolos se rechaza en vez de enviarse.
export function nitSiesa(documento) {
  const bruto = String(documento ?? '').replace(/[.\s]/g, '');
  const nit = limpiarTexto(bruto.replace(/-\d$/, ''));
  if (nit && !/^\d{1,15}$/.test(nit)) {
    throw new Error(`El documento "${nit.slice(0, 20)}" no es numerico: corrigelo en el cliente (solo numeros, maximo 15)`);
  }
  return nit;
}

const escaparXml = (valor) => String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function construirXmlImportar(lineas, cfg) {
  const datos = lineas.map((linea) => `<Linea>${escaparXml(linea)}\n</Linea>`).join('');
  return `<Importar><NombreConexion>${escaparXml(cfg.conexion)}</NombreConexion><IdCia>${escaparXml(cfg.idCia)}</IdCia>`
    + `<Usuario>${escaparXml(cfg.usuario)}</Usuario><Clave>${escaparXml(cfg.clave)}</Clave><Datos>${datos}</Datos></Importar>`;
}

export function construirSobreSoap(xml) {
  return '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">'
    + '<soapenv:Header/><soapenv:Body><tem:ImportarXML>'
    + `<tem:pvstrDatos><![CDATA[${xml}]]></tem:pvstrDatos><tem:printTipoError>0</tem:printTipoError>`
    + '</tem:ImportarXML></soapenv:Body></soapenv:Envelope>';
}

const decodificarXml = (valor) => valor.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Siesa responde HTTP 200 aunque rechace el plano: los errores vienen como filas (f_detalle) en el DataSet.
export function interpretarRespuestaSiesa(status, cuerpo = '') {
  if (status >= 500 || status === 0) {
    return { ok: false, transitorio: true, mensaje: `Siesa respondio HTTP ${status || 'sin respuesta'}` };
  }
  const falla = cuerpo.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (falla) return { ok: false, transitorio: false, mensaje: decodificarXml(falla[1]).trim().slice(0, 500) };
  if (status !== 200) return { ok: false, transitorio: false, mensaje: `Siesa respondio HTTP ${status}` };
  const detalles = [...cuerpo.matchAll(/<f_detalle>([\s\S]*?)<\/f_detalle>/g)].map((m) => decodificarXml(m[1]).trim()).filter(Boolean);
  if (detalles.length || /<(?:Resultado|Table)[\s>]/.test(cuerpo)) {
    return { ok: false, transitorio: false, mensaje: (detalles.join(' | ') || 'Siesa devolvio errores al importar').slice(0, 500) };
  }
  return { ok: true, transitorio: false, mensaje: 'Importado en Siesa' };
}

export async function postSiesa(cfg, xml) {
  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://tempuri.org/ImportarXML' },
      body: construirSobreSoap(xml),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: resp.status, cuerpo: await resp.text() };
  } catch (error) {
    return { status: 0, cuerpo: String(error?.message || error) };
  }
}
