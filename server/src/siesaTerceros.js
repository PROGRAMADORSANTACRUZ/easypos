// Terceros de Siesa desde la pantalla de Clientes, usando la API de consulta (apiconsulta.grupo-santacruz.com):
// /verificar-cliente (0 no existe, 1 solo tercero, 2 tercero y cliente), /clientes (datos actuales) y
// /crear/terceros (crea o reemplaza el tercero). Cada creacion/actualizacion queda en LogIntegracion (TERCERO:<nit>).
import { construirTerceroApi } from './siesaClientes.js';
import { registrar } from './siesaVentas.js';

const TIMEOUT_MS = 60_000;

export function configConsulta(env = process.env) {
  return {
    url: String(env.CONSULTA_API_URL || 'https://apiconsulta.grupo-santacruz.com').replace(/\/+$/, ''),
    clave: env.CONSULTA_API_KEY || '',
    cia: Number(env.SIESA_WS_CIA || 4),
  };
}

export const consultaDisponible = (env = process.env) => Boolean(configConsulta(env).clave);

const errorConsulta = (mensaje, status = 502) => Object.assign(new Error(mensaje), { status });

async function llamar(cfg, ruta, { metodo = 'GET', cuerpo } = {}, solicitar = fetch) {
  let resp;
  try {
    resp = await solicitar(`${cfg.url}${ruta}`, {
      method: metodo,
      headers: { 'X-API-Key': cfg.clave, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw errorConsulta(`No se pudo conectar con la API de Siesa: ${error.message}`);
  }
  const texto = await resp.text();
  if (!resp.ok) throw errorConsulta(`La API de Siesa respondio HTTP ${resp.status}: ${texto.slice(0, 200)}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw errorConsulta('La API de Siesa devolvio una respuesta no valida');
  }
}

const decodificar = (valor) => valor.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Motivos de rechazo de Siesa dentro de respuesta_siesa (etiquetas f_detalle, crudas o escapadas).
export function erroresSiesa(respuestaSiesa = '') {
  const texto = decodificar(String(respuestaSiesa));
  return [...texto.matchAll(/<f_detalle>([\s\S]*?)<\/f_detalle>/g)].map((m) => m[1].trim()).filter(Boolean);
}

export async function verificarTercero(nit, { env, solicitar } = {}) {
  const cfg = configConsulta(env);
  const datos = await llamar(cfg, '/verificar-cliente', { metodo: 'POST', cuerpo: { nit, compania: cfg.cia } }, solicitar);
  if (!Number.isInteger(datos.resultado)) throw errorConsulta('La API de Siesa no devolvio el resultado de la verificacion');
  return datos.resultado;
}

// Datos que hoy tiene Siesa del tercero/cliente, para mostrarlos antes de reemplazarlos.
export async function datosEnSiesa(nit, { env, solicitar } = {}) {
  const cfg = configConsulta(env);
  const datos = await llamar(cfg, `/clientes?cia=${cfg.cia}&nit=${encodeURIComponent(nit)}`, {}, solicitar);
  const filas = datos.data || [];
  const fila = filas.find((f) => String(f.SUCURSAL).trim() === '001') || filas[0];
  if (!fila) return null;
  const limpio = (v) => (v == null ? '' : String(v).trim());
  const departamento = limpio(fila.COD_DEPTO);
  const ciudad = limpio(fila.COD_CIUDAD);
  return {
    nombre: limpio(fila.TERCERO),
    sucursal: limpio(fila.SUCURSAL),
    direccion: limpio(fila.DIRECCION),
    ciudad: [limpio(fila.CIUDAD_MUNICIPIO), limpio(fila.DEPARTAMENTO)].filter(Boolean).join(', '),
    ciudadNombre: limpio(fila.CIUDAD_MUNICIPIO),
    // Codigos del catalogo de ubicaciones del POS: departamento 169+08 y municipio 169+08+001.
    departamentoCodigo: /^\d{2}$/.test(departamento) ? `169${departamento}` : '',
    municipioCodigo: /^\d{2}$/.test(departamento) && /^\d{3}$/.test(ciudad) ? `169${departamento}${ciudad}` : '',
    telefono: limpio(fila.CELULAR),
    email: limpio(fila.EMAIL),
  };
}

// Siesa guarda el nombre de una persona natural como "APELLIDO1 APELLIDO2 NOMBRES"; se separa para el formulario.
export function separarNombreSiesa(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length <= 1) return { primerApellido: palabras[0] || '', segundoApellido: '', nombres: '' };
  if (palabras.length === 2) return { primerApellido: palabras[0], segundoApellido: '', nombres: palabras[1] };
  return { primerApellido: palabras[0], segundoApellido: palabras[1], nombres: palabras.slice(2).join(' ') };
}

// Busca un tercero por documento para precargar el formulario de cliente.
export async function buscarTerceroPorNit(nit, opciones = {}) {
  const resultado = await verificarTercero(nit, opciones);
  if (resultado === 0) return { existe: false, resultado };
  const datos = await datosEnSiesa(nit, opciones);
  return {
    existe: true,
    resultado,
    datos: datos && { ...datos, ...separarNombreSiesa(datos.nombre) },
  };
}

// Consulta previa al guardar un cliente: arma el tercero con lo digitado y dice si ya existe en Siesa.
export async function consultarTerceroCliente(cliente, opciones = {}) {
  const tercero = construirTerceroApi({ sucursales: [], ...cliente });
  const resultado = await verificarTercero(tercero.nit, opciones);
  const existente = resultado > 0 ? await datosEnSiesa(tercero.nit, opciones).catch(() => null) : null;
  return { resultado, existe: resultado > 0, existente, tercero };
}

// Crea el tercero (o reemplaza sus datos si ya existe) y lo confirma con una nueva verificacion.
export async function guardarTerceroCliente(cliente, { actualizar = false, ...opciones } = {}) {
  const cfg = configConsulta(opciones.env);
  const tercero = construirTerceroApi({ sucursales: [], ...cliente });
  const clave = `TERCERO:${tercero.nit}`;
  const antes = await verificarTercero(tercero.nit, opciones);
  if (antes > 0 && !actualizar) {
    throw errorConsulta('El tercero ya existe en Siesa; confirma si deseas actualizar sus datos', 409);
  }
  const respuesta = await llamar(cfg, `/crear/terceros?cia=${cfg.cia}`, { metodo: 'POST', cuerpo: [tercero] }, opciones.solicitar);
  const errores = erroresSiesa(respuesta.respuesta_siesa);
  const request = JSON.stringify(tercero);
  if (respuesta.estado !== 'ok' || errores.length) {
    const mensaje = `Siesa rechazo el tercero: ${errores.join(' | ') || respuesta.estado || 'sin detalle'}`.slice(0, 500);
    await registrar(clave, 'ERROR', { request, response: respuesta.respuesta_siesa, mensaje });
    throw errorConsulta(mensaje, 422);
  }
  const despues = await verificarTercero(tercero.nit, opciones);
  if (despues === 0) {
    const mensaje = `Siesa no confirmo el tercero ${tercero.nit} despues de enviarlo`;
    await registrar(clave, 'ERROR', { request, response: respuesta.respuesta_siesa, mensaje });
    throw errorConsulta(mensaje, 422);
  }
  const accion = antes > 0 ? 'actualizado' : 'creado';
  await registrar(clave, 'OK', { request, response: respuesta.respuesta_siesa, mensaje: `Tercero ${accion} en Siesa` });
  return { accion, nit: tercero.nit, resultado: despues };
}
