import { createInterface } from 'node:readline';
import sql from 'mssql';

const API_BASE = (process.env.EASYPOS_API_BASE || 'https://pos.grupo-santacruz.com/api').replace(/\/$/, '');
const SIESA_SERVER = 'siesa-m6-sqlsw-carnessantacruz.cu94u26q0284.us-east-1.rds.amazonaws.com';
const SIESA_DATABASE = 'UnoEE_Carnesantacruz_Real';
const SIESA_TABLE = '[dbo].[t120_mc_items]';
const SIESA_CA_BUNDLE = 'https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem';
const COMPANY_ID = 4;
const TAMANO_LOTE = 250;
const CAMPOS = [
  'f120_id_cia',
  'f120_id',
  'f120_rowid',
  'f120_referencia',
  'f120_descripcion',
  'f120_descripcion_corta',
  'f120_id_grupo_impositivo',
  'f120_id_tipo_inv_serv',
  'f120_ind_tipo_item',
  'f120_ind_compra',
  'f120_ind_venta',
  'f120_ind_manufactura',
];

function preguntar(texto) {
  const interfaz = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => interfaz.question(texto, (respuesta) => {
    interfaz.close();
    resolve(respuesta.trim());
  }));
}

function preguntarSecreto(texto) {
  const entrada = process.stdin;
  const salida = process.stdout;
  if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
    throw new Error('Ejecuta este comando desde una terminal interactiva para ocultar las contraseñas');
  }

  return new Promise((resolve, reject) => {
    let valor = '';
    const rawAnterior = entrada.isRaw;
    salida.write(texto);
    entrada.setEncoding('utf8');
    entrada.setRawMode(true);
    entrada.resume();

    const limpiar = () => {
      entrada.removeListener('data', alRecibir);
      entrada.setRawMode(rawAnterior);
      salida.write('\n');
    };
    const alRecibir = (fragmento) => {
      for (const caracter of fragmento) {
        if (caracter === '\u0003') {
          limpiar();
          reject(new Error('Operación cancelada'));
          return;
        }
        if (caracter === '\r' || caracter === '\n') {
          limpiar();
          resolve(valor);
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') valor = valor.slice(0, -1);
        else valor += caracter;
      }
    };
    entrada.on('data', alRecibir);
  });
}

async function jsonRespuesta(respuesta) {
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `La API respondió HTTP ${respuesta.status}`);
  return datos;
}

async function elegirRestaurante() {
  const respuesta = await fetch(`${API_BASE}/plataforma/restaurantes/publico`);
  const restaurantes = await jsonRespuesta(respuesta);
  if (restaurantes.length === 0) return null;
  restaurantes.forEach((restaurante, indice) => {
    console.log(`${indice + 1}. ${restaurante.nombre}`);
  });
  const seleccion = restaurantes.length === 1
    ? '1'
    : await preguntar('Número del restaurante EasyPOS: ');
  const restaurante = restaurantes[Number(seleccion) - 1];
  if (!restaurante) throw new Error('Selecciona un restaurante válido');
  return restaurante;
}

function validarReferencias(items) {
  const vistas = new Set();
  const duplicadas = new Set();
  for (const item of items) {
    const referencia = String(item.f120_referencia ?? '').trim();
    if (!referencia) continue;
    if (vistas.has(referencia)) duplicadas.add(referencia);
    vistas.add(referencia);
  }
  if (duplicadas.size > 0) {
    throw new Error(`Hay referencias repetidas en Siesa: ${[...duplicadas].slice(0, 10).join(', ')}`);
  }
}

async function autenticar(restaurante, usuario, password) {
  const respuesta = await fetch(`${API_BASE}/usuarios/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(restaurante && { 'x-tenant-id': restaurante.id }),
    },
    body: JSON.stringify({ usuario, password }),
  });
  const sesion = await jsonRespuesta(respuesta);
  if (!sesion.token) throw new Error('El inicio de sesión no devolvió un token');
  return sesion.token;
}

async function enviarLote(items, token, restaurante) {
  const respuesta = await fetch(`${API_BASE}/productos/siesa/importar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(restaurante && { 'x-tenant-id': restaurante.id }),
    },
    body: JSON.stringify({ items }),
  });
  return jsonRespuesta(respuesta);
}

async function cargarBundleCaSiesa() {
  const respuesta = await fetch(SIESA_CA_BUNDLE);
  if (!respuesta.ok) throw new Error('No se pudo obtener el certificado oficial de Amazon RDS');
  return Buffer.from(await respuesta.arrayBuffer());
}

async function main() {
  let pool;
  try {
    console.log(`EasyPOS: ${API_BASE}`);
    const restaurante = await elegirRestaurante();
    console.log(`Restaurante: ${restaurante?.nombre || 'base predeterminada'}`);

    const usuarioSiesa = process.env.SIESA_LOCAL_SQL_USER || (await preguntar('Usuario SQL Server [Carnesantacruz]: ')) || 'Carnesantacruz';
    const passwordSiesa = process.env.SIESA_LOCAL_SQL_PASSWORD || await preguntarSecreto('Contraseña SQL Server (no se mostrará): ');
    const usuarioPos = process.env.EASYPOS_LOCAL_USER || await preguntar('Usuario de EasyPOS: ');
    const passwordPos = process.env.EASYPOS_LOCAL_PASSWORD || await preguntarSecreto('Contraseña de EasyPOS (no se mostrará): ');
    const caSiesa = await cargarBundleCaSiesa();

    pool = new sql.ConnectionPool({
      server: SIESA_SERVER,
      port: 1433,
      database: SIESA_DATABASE,
      user: usuarioSiesa,
      password: passwordSiesa,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        cryptoCredentialsDetails: { ca: caSiesa },
      },
      connectionTimeout: 15000,
      requestTimeout: 120000,
    });
    await pool.connect();
    const metadata = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 't120_mc_items' ORDER BY ORDINAL_POSITION",
    );
    const disponibles = metadata.recordset.map((fila) => String(fila.COLUMN_NAME));
    const conjunto = new Set(disponibles.map((campo) => campo.toLowerCase()));
    const faltantes = CAMPOS.filter((campo) => !conjunto.has(campo.toLowerCase()));
    if (faltantes.length > 0) {
      const similares = disponibles.filter((campo) => campo.toLowerCase().startsWith('f120_'));
      throw new Error(`Campos no encontrados: ${faltantes.join(', ')}. Campos f120 disponibles: ${similares.join(', ')}`);
    }
    const columnas = CAMPOS.map((campo) => `[${campo}]`).join(', ');
    const consulta = await pool.request()
      .input('companyId', sql.Int, COMPANY_ID)
      .query(`SELECT ${columnas} FROM ${SIESA_TABLE} WHERE [f120_id_cia] = @companyId`);
    const items = consulta.recordset;
    await pool.close();
    pool = null;

    if (items.length === 0) throw new Error('Siesa no devolvió artículos para la compañía 4');
    validarReferencias(items);
    console.log(`Artículos consultados en Siesa, compañía 4: ${items.length}`);
    if ((await preguntar('¿Enviar estos artículos a EasyPOS? (s/N): ')).toLowerCase() !== 's') {
      console.log('Importación cancelada; no se modificó EasyPOS.');
      return;
    }

    const token = await autenticar(restaurante, usuarioPos, passwordPos);
    const total = { actualizados: 0, omitidos: 0 };
    const cantidadLotes = Math.ceil(items.length / TAMANO_LOTE);
    for (let inicio = 0; inicio < items.length; inicio += TAMANO_LOTE) {
      const lote = items.slice(inicio, inicio + TAMANO_LOTE);
      const resultado = await enviarLote(lote, token, restaurante);
      total.actualizados += resultado.actualizados;
      total.omitidos += resultado.omitidos;
      console.log(`Lote ${Math.floor(inicio / TAMANO_LOTE) + 1}/${cantidadLotes} enviado`);
    }
    console.log(`Finalizado: ${total.actualizados} actualizados, ${total.omitidos} omitidos (sin crear productos).`);
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`No se completó la sincronización: ${error.message}`);
  process.exitCode = 1;
});