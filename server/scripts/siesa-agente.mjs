// Agente de Siesa: corre en el PC que tiene la VPN de AWS. Cada hora pide al POS los documentos pendientes
// (clientes, recibos de caja y ventas ya armados), los envia al servicio web de Siesa y devuelve el resultado.
// Antes de enviar una venta consulta t350 en la base SQL de Siesa para no duplicar lo ya cargado.
//
// Uso (en una copia de la carpeta server, con `npm install` hecho y la VPN conectada):
//   copiar siesa-agente.env.example a siesa-agente.env, completarlo y ejecutar
//   node scripts/siesa-agente.mjs          (queda corriendo, un ciclo cada SIESA_AGENTE_INTERVALO_MIN)
//   node scripts/siesa-agente.mjs --una-vez (un solo ciclo y termina; util con el Programador de tareas)
//   node scripts/siesa-agente.mjs --simular (muestra lo que enviaria, sin enviar ni informar al POS; no necesita VPN)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import sql from 'mssql';
import { configSiesa, postSiesa } from '../src/siesaProtocolo.js';
import { asegurarTerceroConApi, procesarPendientes } from '../src/siesaAgenteNucleo.js';

const aqui = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(aqui, '..', 'siesa-agente.env') });

const env = process.env;
const API = String(env.POS_API_URL || '').replace(/\/+$/, '');
const TOKEN = env.SIESA_AGENTE_TOKEN || '';
const TENANTS = String(env.POS_TENANTS || '').split(',').map((t) => t.trim()).filter(Boolean);
const INTERVALO_MIN = Number(env.SIESA_AGENTE_INTERVALO_MIN ?? 60);
const UNA_VEZ = process.argv.includes('--una-vez') || INTERVALO_MIN === 0 || process.argv.includes('--simular');
// --simular: muestra lo que enviaria (sin llamar a Siesa ni informar al POS, no cambia nada). Un solo ciclo.
const SIMULAR = process.argv.includes('--simular');
const CA_BUNDLE_URL = 'https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem';

const cfg = configSiesa(env);
const hayBaseSql = Boolean(env.SIESA_SQL_USER && env.SIESA_SQL_PASSWORD);
// API de consulta (apiconsulta.grupo-santacruz.com): verifica y crea terceros en Siesa. Opcional.
const CONSULTA_URL = String(env.CONSULTA_API_URL || '').replace(/\/+$/, '');
const CONSULTA_KEY = env.CONSULTA_API_KEY || '';
const hayApiTerceros = Boolean(CONSULTA_URL && CONSULTA_KEY);
let pool = null;

const marca = () => new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
const log = (...args) => console.log(`[${marca()}]`, ...args);

async function consultaFetch(ruta, cuerpo) {
  const resp = await fetch(`${CONSULTA_URL}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': CONSULTA_KEY },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: resp.status, cuerpo: await resp.text() };
}

const apiTerceros = {
  async verificar(nit) {
    const { status, cuerpo } = await consultaFetch('/verificar-cliente', { nit, compania: Number(cfg.idCia) });
    const datos = JSON.parse(cuerpo || '{}');
    if (status !== 200 || !Number.isInteger(datos.resultado)) throw new Error(`verificar-cliente respondio HTTP ${status}: ${cuerpo.slice(0, 200)}`);
    return datos.resultado;
  },
  crearTercero: (payload) => consultaFetch(`/crear/terceros?cia=${encodeURIComponent(cfg.idCia)}`, [payload]),
};

async function posFetch(ruta, { metodo = 'GET', cuerpo, tenant } = {}) {
  const resp = await fetch(`${API}/api/siesa-agente${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'x-agente-token': TOKEN,
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || `El POS respondio HTTP ${resp.status}`);
  return datos;
}

async function cargarCa() {
  if (env.SIESA_SQL_CA_FILE) return readFileSync(env.SIESA_SQL_CA_FILE);
  const resp = await fetch(CA_BUNDLE_URL);
  if (!resp.ok) throw new Error('No se pudo obtener el certificado de Amazon RDS (define SIESA_SQL_CA_FILE)');
  return Buffer.from(await resp.arrayBuffer());
}

async function conectarSql() {
  if (pool?.connected) return pool;
  pool = new sql.ConnectionPool({
    server: env.SIESA_SQL_SERVER || 'siesa-m6-sqlsw-carnessantacruz.cu94u26q0284.us-east-1.rds.amazonaws.com',
    port: 1433,
    database: env.SIESA_SQL_DATABASE || 'UnoEE_Carnesantacruz_Real',
    user: env.SIESA_SQL_USER,
    password: env.SIESA_SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: false, cryptoCredentialsDetails: { ca: await cargarCa() } },
    connectionTimeout: 20_000,
    requestTimeout: 60_000,
  });
  await pool.connect();
  return pool;
}

async function existeEnSiesa({ compania, centro, tipo, numero }) {
  const conexion = await conectarSql();
  const resultado = await conexion.request()
    .input('cia', sql.Int, compania)
    .input('co', sql.VarChar(3), centro)
    .input('tipo', sql.VarChar(3), tipo)
    .input('numero', sql.Int, numero)
    .query('SELECT TOP 1 1 AS existe FROM t350_co_docto_contable WHERE f350_id_cia = @cia AND f350_id_co = @co '
      + 'AND f350_id_tipo_docto = @tipo AND f350_consec_docto = @numero');
  return resultado.recordset.length > 0;
}

async function ciclo(tenant) {
  const nombre = tenant || 'base por defecto';
  const { items } = await posFetch('/pendientes?limite=100', { tenant });
  if (!items.length) return log(`[${nombre}] sin pendientes`);
  log(`[${nombre}] ${items.length} documento(s) pendientes`);
  if (SIMULAR) {
    for (const item of items) {
      log(`  ${item.clave}${item.depende ? ` (depende de ${item.depende})` : ''}${item.verificar ? ` [t350: ${item.verificar.tipo}-${item.verificar.numero}]` : ''}`);
      item.lineas.forEach((linea) => console.log(`    ${linea.length} car. | ${linea.slice(0, 120).trimEnd()}`));
      if (item.tercero) console.log(`    tercero (API /crear/terceros): ${JSON.stringify(item.tercero)}`);
    }
    return;
  }
  const resumen = await procesarPendientes(items, {
    cfg,
    existeEnSiesa: hayBaseSql ? existeEnSiesa : null,
    asegurarTercero: hayApiTerceros ? (item) => asegurarTerceroConApi(item, apiTerceros) : null,
    enviar: postSiesa,
    informar: (resultado) => posFetch('/resultado', { metodo: 'POST', cuerpo: resultado, tenant }),
  });
  log(`[${nombre}]`, JSON.stringify(resumen));
}

async function correr() {
  for (const tenant of TENANTS.length ? TENANTS : [null]) {
    try {
      await ciclo(tenant);
    } catch (error) {
      log(`[${tenant || 'base por defecto'}] ciclo detenido: ${error.message}`);
    }
  }
}

function validar() {
  const obligatorias = [['POS_API_URL', API], ['SIESA_AGENTE_TOKEN', TOKEN]];
  if (!SIMULAR) {
    obligatorias.push(['SIESA_WS_URL', cfg.url], ['SIESA_WS_CONEXION', cfg.conexion], ['SIESA_WS_CIA', cfg.idCia],
      ['SIESA_WS_USER', cfg.usuario], ['SIESA_WS_PASSWORD', cfg.clave]);
  }
  const faltan = obligatorias.filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) {
    console.error(`Faltan variables en siesa-agente.env: ${faltan.join(', ')}`);
    process.exit(1);
  }
}

validar();
log(`Agente de Siesa -> ${API}${hayBaseSql ? ' (con verificacion en t350)' : ' (sin verificacion en t350: falta SIESA_SQL_USER/PASSWORD)'}${hayApiTerceros ? ' (creando terceros con la API de consulta)' : ' (sin creacion de terceros: falta CONSULTA_API_URL/KEY)'}`);
await correr();
if (!UNA_VEZ) {
  log(`Proximo ciclo en ${INTERVALO_MIN} min. Ctrl+C para salir.`);
  setInterval(correr, INTERVALO_MIN * 60_000);
} else {
  await pool?.close().catch(() => {});
}
