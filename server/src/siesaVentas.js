// Envio automatico de ventas a Siesa UNO EE (servicio web wsUNOEE, metodo ImportarXML).
// Arma el plano de ancho fijo (461 encabezado, 358 medios de pago, 470 movimientos), lo envuelve en XML/SOAP
// y registra cada intento en LogIntegracion (sistema SIESA, tipo VENTA:<id de la factura>).
import { prisma } from './prisma.js';
import { diaColombia } from './fechaColombia.js';

const LOG_SISTEMA = 'SIESA';
const TIMEOUT_MS = 30_000;

// Valores iguales para todos los restaurantes.
export const SIESA_FIJOS = Object.freeze({
  tipoCliente: '001',
  sucursal: '001',
  clienteGenerico: '222222222',
  vendedor: '900326452',
  condicionPago: 'CON',
  moneda: 'COP',
  puntoEnvio: '001',
  caja: '001',
  bodega: '42001',
  concepto: '501',
  motivo: '01',
  listaPrecio: '001',
  unidadNegocio: '001',
  claseDocumento: 522,
  claseDocumentoProceso: '070',
  unidadDefecto: 'UND',
  direccionDefecto: 'Calle 123 # 45-67',
  pais: '169',
  departamento: '08',
  ciudad: '001',
});

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

// NIT sin puntos ni digito de verificacion; vacio si no hay documento.
export function nitSiesa(documento) {
  const bruto = String(documento ?? '').replace(/[.\s]/g, '');
  return limpiarTexto(bruto.replace(/-\d$/, ''));
}

function documentoCliente(factura) {
  return nitSiesa(factura.numeroDocumentoCliente) || SIESA_FIJOS.clienteGenerico;
}

export function medioSiesa(codigo) {
  const partes = String(codigo ?? '').trim().toUpperCase().split('/');
  if (partes.every((parte) => ['EFE', 'EFECTIVO', 'AJP'].includes(parte))) return 'EFE';
  if (partes.every((parte) => ['DAT', 'DTF', 'TARJETA'].includes(parte))) return 'DAT';
  return 'TRA';
}

// Suma lo pagado por medio de Siesa (una sola linea 358 por medio).
export function mediosDePago(factura) {
  const totales = new Map();
  for (const indice of [1, 2, 3, 4]) {
    const valor = Number(factura[`valor${indice}`]) || 0;
    if (valor <= 0) continue;
    const medio = medioSiesa(factura[`metodoPago${indice}`]);
    totales.set(medio, (totales.get(medio) || 0) + valor);
  }
  return [...totales.entries()].map(([medio, valor]) => ({ medio, valor }));
}

const DATOS_MEDIO = {
  EFE: { banco: '', cuenta: '', seguridad: '', autorizacion: '', vencimiento: '', referencia: '' },
  DAT: { banco: '', cuenta: '10000000000', seguridad: '001', autorizacion: '0000001000', vencimiento: '20301231', referencia: '001' },
  TRA: { banco: '01', cuenta: '', seguridad: '', autorizacion: '', vencimiento: '', referencia: '001' },
};

function registro461(fecha, doc, cia, orden) {
  const cliente = documentoCliente(doc);
  const F = SIESA_FIJOS;
  return [
    consecutivo(orden), '0461', '00', '02', cia, '1', '1', '0',
    texto(doc.centroOperacionCodigo, 3), texto(doc.tipoDocumentoCodigo, 3), numero(doc.numeroFactura, 8), fecha,
    texto(cliente, 15), numero(F.claseDocumento, 3), '0', '0', texto(F.sucursal, 3), texto(F.tipoCliente, 4),
    texto(doc.centroOperacionCodigo, 3), texto('', 15), texto(cliente, 15), texto(F.sucursal, 3), texto(F.vendedor, 15),
    texto('', 10), texto('', 12), texto('', 10), texto(F.condicionPago, 3), texto(F.moneda, 3), texto(F.moneda, 3),
    numero(1, 13, 4), texto(F.moneda, 3), numero(1, 13, 4),
    texto(`POS ${doc.prefijo || ''}${doc.numeroFactura}`, 2000), texto(F.puntoEnvio, 3), '1',
    texto(doc.nombreCliente, 50), texto(doc.direccionCliente || F.direccionDefecto, 40), texto('', 40), texto('', 40),
    texto(F.pais, 3), texto(F.departamento, 2), texto(F.ciudad, 3), texto('', 40), texto('', 20), texto('', 20),
    texto('', 10), texto('', 50), texto('', 10), texto('', 15), texto('', 3), texto('', 15), texto('', 50), texto('', 15),
    texto('', 30), numero(0, 15), numero(0, 20), numero(0, 20), numero(0, 20), texto('', 255), texto(F.caja, 3), '0',
    texto(doc.tipoDocumentoCodigo, 3), texto('', 5), texto('', 2), texto('', 2), texto(F.claseDocumentoProceso, 3),
    texto('', 20), texto('', 15),
  ].join('');
}

function registro358(orden, doc, cia, { medio, valor }) {
  const d = DATOS_MEDIO[medio];
  return [
    consecutivo(orden), '0358', '00', '01', cia, texto(doc.centroOperacionCodigo, 3), texto(doc.tipoDocumentoCodigo, 3),
    numero(doc.numeroFactura, 8), medio, numero(valor, 20), texto(d.banco, 10), '00000000', texto(d.cuenta, 25),
    texto(d.seguridad, 3), texto(d.autorizacion, 10), texto(d.vencimiento, 8), texto(d.referencia, 30), texto('', 8),
    texto('', 3), texto('', 15), texto('', 255), texto('', 15),
  ].join('');
}

function unidadSiesa(detalle) {
  const deItem = limpiarTexto(detalle.producto?.siesaIdUnidadInventario);
  if (deItem) return deItem;
  const local = limpiarTexto(detalle.unidad);
  return local.length > 1 ? local : SIESA_FIJOS.unidadDefecto;
}

// El item de Siesa se resuelve por la referencia (Producto.codigo); si el producto ya trae el id de Siesa tambien se envia.
function itemSiesa(detalle) {
  const id = String(detalle.producto?.siesaId ?? '').trim();
  return /^\d{1,7}$/.test(id) ? id.padStart(7, '0') : '0000000';
}

function registro470(orden, doc, cia, detalle, linea) {
  const F = SIESA_FIJOS;
  const unidad = unidadSiesa(detalle);
  return [
    consecutivo(orden), '0470', '01', '10', cia, texto(doc.centroOperacionCodigo, 3), texto(doc.tipoDocumentoCodigo, 3),
    numero(doc.numeroFactura, 8), numero(linea, 10), texto('', 55), texto(F.bodega, 5), texto('', 10), texto('', 15),
    texto(F.concepto, 3), texto(F.motivo, 2), '0', texto(doc.centroOperacionCodigo, 3), texto('', 2), texto('', 15),
    texto('', 15), texto(F.listaPrecio, 3), texto('', 4), texto(unidad, 4), numero(detalle.cantidad, 20, 4),
    numero(0, 20, 4), numero(detalle.total, 20, 4), '2', '0', '0', texto('', 255), texto('', 2000), texto('', 40),
    texto(unidad, 4), itemSiesa(detalle), texto(detalle.productoCodigo || detalle.producto?.codigo, 50), texto('', 20),
    texto('', 20), texto('', 20), texto(F.unidadNegocio, 20),
  ].join('');
}

// Devuelve las lineas del plano de UNA factura ya cargada (con detalle y producto).
export function construirPlanoVenta(doc) {
  const cia = numero(Number(doc.companiaCodigo), 3);
  const detalles = doc.detalle || [];
  const medios = mediosDePago(doc);
  if (!detalles.length) throw new Error('La factura no tiene lineas de detalle para enviar a Siesa');
  if (!medios.length) throw new Error('La factura no tiene medios de pago para enviar a Siesa');
  const fecha = diaColombia(new Date(doc.createdAt)).replaceAll('-', '');

  const lineas = [`${consecutivo(1)}00000001${cia}`];
  let orden = 2;
  lineas.push(registro461(fecha, doc, cia, orden++));
  for (const medio of medios) lineas.push(registro358(orden++, doc, cia, medio));
  detalles.forEach((detalle, indice) => lineas.push(registro470(orden++, doc, cia, detalle, indice + 1)));
  lineas.push(`${consecutivo(orden)}99990001${cia}`);
  return lineas;
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

async function registrar(clave, estado, { request, response, mensaje } = {}) {
  try {
    await prisma.logIntegracion.create({
      data: {
        sistema: LOG_SISTEMA,
        tipo: clave,
        estado,
        request: request ?? null,
        response: response == null ? null : String(response).slice(0, 20000),
        mensaje: mensaje == null ? null : String(mensaje).slice(0, 500),
      },
    });
  } catch (error) {
    console.error('Siesa: no se pudo registrar el log', clave, error.message);
  }
}

const enCurso = new Set();

// Un intento de envio de cualquier documento. `clave` es el tipo del log (VENTA:<id>, CLIENTE:<id>, RECIBO:<id>).
// `preparar(cfg)` devuelve { lineas } | { omitido } | { noEncontrado }; si lanza, el error queda registrado.
// Nunca lanza: devuelve { estado, mensaje }. Con `forzar` ignora un envio previo ya aceptado.
export async function intentarEnvioSiesa(clave, preparar, { env = process.env, enviar = postSiesa, forzar = false } = {}) {
  const cfg = configSiesa(env);
  if (!cfg.activo) return { estado: 'INACTIVO', mensaje: 'El envio a Siesa no esta activo' };
  if (!cfg.url || !cfg.conexion || !cfg.idCia || !cfg.usuario || !cfg.clave) {
    return { estado: 'ERROR', mensaje: 'Faltan variables SIESA_WS_* en el servidor' };
  }
  if (enCurso.has(clave)) return { estado: 'EN_CURSO', mensaje: 'Ya hay un envio en curso' };
  enCurso.add(clave);
  try {
    if (!forzar) {
      const previo = await prisma.logIntegracion.findFirst({ where: { sistema: LOG_SISTEMA, tipo: clave, estado: 'OK' } });
      if (previo) return { estado: 'OK', mensaje: 'Ya fue enviado a Siesa' };
    }

    let preparado;
    try {
      preparado = await preparar(cfg);
    } catch (error) {
      await registrar(clave, 'ERROR', { mensaje: error.message });
      return { estado: 'ERROR', mensaje: error.message };
    }
    if (preparado.noEncontrado) return { estado: 'ERROR', mensaje: 'Documento no encontrado' };
    if (preparado.omitido) {
      await registrar(clave, 'OMITIDO', { mensaje: preparado.omitido });
      return { estado: 'OMITIDO', mensaje: preparado.omitido };
    }
    const { status, cuerpo } = await enviar(cfg, construirXmlImportar(preparado.lineas, cfg));
    const resultado = interpretarRespuestaSiesa(status, cuerpo);
    const estado = resultado.ok ? 'OK' : resultado.transitorio ? 'REINTENTAR' : 'ERROR';
    await registrar(clave, estado, { request: preparado.lineas.join('\n'), response: cuerpo, mensaje: resultado.mensaje });
    return { estado, mensaje: resultado.mensaje };
  } catch (error) {
    console.error('Siesa: fallo inesperado al enviar', clave, error.message);
    return { estado: 'ERROR', mensaje: error.message };
  } finally {
    enCurso.delete(clave);
  }
}

// Venta. modelo: 'factura' | 'facturaVenta'.
export function intentarEnvioVentaSiesa(modelo, id, opciones) {
  return intentarEnvioSiesa(`VENTA:${id}`, async () => {
    const doc = await prisma[modelo].findUnique({
      where: { id },
      include: { detalle: { include: { producto: true } } },
    });
    if (!doc) return { noEncontrado: true };
    if (doc.credito) return { omitido: 'Factura a credito: no se envia automaticamente a Siesa' };
    return { lineas: construirPlanoVenta(doc) };
  }, opciones);
}
