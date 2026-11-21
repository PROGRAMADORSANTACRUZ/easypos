// Programador del envio a Siesa: cada SIESA_ENVIO_INTERVALO_MIN minutos (60 por defecto) envia, por cada restaurante
// activo y en este orden, los clientes de las facturas pendientes, los recibos de caja (abonos) y las ventas.
// Solo toma documentos creados desde SIESA_ENVIO_DESDE, para no reenviar el historial; sin esa fecha no arranca.
import { prisma, tenantStorage } from './prisma.js';
import { platformPrisma } from './platformPrisma.js';
import { getTenantPrisma } from './tenantManager.js';
import { configSiesa, intentarEnvioVentaSiesa } from './siesaVentas.js';
import { intentarEnvioClienteSiesa } from './siesaClientes.js';
import { intentarEnvioReciboSiesa } from './siesaRecibos.js';

const MAX_ERRORES = 5;
const LIMITE_POR_CORRIDA = 200;

function resumirLogs(logs) {
  const porTipo = new Map();
  for (const { tipo, estado } of logs) {
    const resumen = porTipo.get(tipo) || { cerrada: false, errores: 0 };
    if (estado === 'OK' || estado === 'OMITIDO') resumen.cerrada = true;
    if (estado === 'ERROR') resumen.errores += 1;
    porTipo.set(tipo, resumen);
  }
  return porTipo;
}

// Pendiente = sin envio aceptado ni omitido y con menos de MAX_ERRORES rechazos de Siesa.
// Las fallas de red/servidor (estado REINTENTAR) no cuentan: se reintentan en cada corrida.
export function seleccionarPendientes(items, logs, limite = LIMITE_POR_CORRIDA, prefijo = 'VENTA') {
  const porTipo = resumirLogs(logs);
  return items
    .filter(({ id }) => {
      const resumen = porTipo.get(`${prefijo}:${id}`);
      return !resumen || (!resumen.cerrada && resumen.errores < MAX_ERRORES);
    })
    .slice(0, limite);
}

const logsDe = (prefijo, ids) => (ids.length
  ? prisma.logIntegracion.findMany({
    where: { sistema: 'SIESA', tipo: { in: ids.map((id) => `${prefijo}:${id}`) } },
    select: { tipo: true, estado: true },
  })
  : []);

// Envia las pendientes de la base activa (la del restaurante dentro de tenantStorage o la base por defecto).
export async function enviarPendientesSiesa({
  desde,
  limite = LIMITE_POR_CORRIDA,
  intentar = intentarEnvioVentaSiesa,
  intentarCliente = intentarEnvioClienteSiesa,
  intentarRecibo = intentarEnvioReciboSiesa,
} = {}) {
  const resumen = { OK: 0, ERROR: 0, REINTENTAR: 0, OMITIDO: 0 };
  const contar = ({ estado }) => { if (estado in resumen) resumen[estado] += 1; };

  const abonos = await prisma.abono.findMany({
    where: { createdAt: { gte: desde } }, select: { id: true }, orderBy: { createdAt: 'asc' },
  });
  const logsAbonos = await logsDe('RECIBO', abonos.map(({ id }) => id));

  const facturasPorModelo = [];
  for (const modelo of ['factura', 'facturaVenta']) {
    const facturas = await prisma[modelo].findMany({
      where: { createdAt: { gte: desde } },
      select: { id: true, clienteId: true, numeroDocumentoCliente: true },
      orderBy: { createdAt: 'asc' },
    });
    const logs = await logsDe('VENTA', facturas.map(({ id }) => id));
    facturasPorModelo.push([modelo, seleccionarPendientes(facturas, logs, limite)]);
  }

  // Un cliente con documento debe existir en Siesa antes que sus facturas; se intenta una vez por corrida.
  const clientes = new Map();
  const clienteListo = async (clienteId) => {
    if (!clientes.has(clienteId)) {
      const logs = await logsDe('CLIENTE', [clienteId]);
      const { errores = 0, cerrada = false } = resumirLogs(logs).get(`CLIENTE:${clienteId}`) || {};
      if (!cerrada && errores >= MAX_ERRORES) clientes.set(clienteId, false);
      else {
        const resultado = await intentarCliente(clienteId);
        if (resultado.estado !== 'OK') contar(resultado);
        clientes.set(clienteId, resultado.estado === 'OK');
      }
    }
    return clientes.get(clienteId);
  };

  for (const { id } of seleccionarPendientes(abonos, logsAbonos, limite, 'RECIBO')) contar(await intentarRecibo(id));
  for (const [modelo, pendientes] of facturasPorModelo) {
    for (const factura of pendientes) {
      if (factura.clienteId && factura.numeroDocumentoCliente && !await clienteListo(factura.clienteId)) continue;
      contar(await intentar(modelo, factura.id));
    }
  }
  return resumen;
}

async function recorrerBases(trabajo) {
  await trabajo('base por defecto');
  const restaurantes = await platformPrisma.restaurante.findMany({ where: { estado: 'ACTIVO' } });
  for (const restaurante of restaurantes) {
    if (!restaurante.dbUrl || restaurante.dbUrl === process.env.DATABASE_URL) continue;
    await tenantStorage.run(getTenantPrisma(restaurante.dbUrl), () => trabajo(restaurante.slug || restaurante.id));
  }
}

let corriendo = false;

export async function correrProgramadorSiesa(desde) {
  if (corriendo) return;
  corriendo = true;
  try {
    await recorrerBases(async (nombre) => {
      try {
        const resumen = await enviarPendientesSiesa({ desde });
        if (Object.values(resumen).some(Boolean)) console.log(`Siesa [${nombre}]:`, JSON.stringify(resumen));
      } catch (error) {
        console.error(`Siesa [${nombre}]: no se pudo enviar el lote`, error.message);
      }
    });
  } catch (error) {
    console.error('Siesa: fallo el programador', error.message);
  } finally {
    corriendo = false;
  }
}

export function iniciarProgramadorSiesa(env = process.env) {
  if (!configSiesa(env).activo) return null;
  const desde = new Date(env.SIESA_ENVIO_DESDE || '');
  if (Number.isNaN(desde.getTime())) {
    console.error('Siesa: SIESA_VENTAS_ACTIVO=true pero falta SIESA_ENVIO_DESDE (ej. 2026-11-21T00:00:00-05:00); no se enviara nada.');
    return null;
  }
  const minutos = Number(env.SIESA_ENVIO_INTERVALO_MIN) > 0 ? Number(env.SIESA_ENVIO_INTERVALO_MIN) : 60;
  console.log(`Siesa: envio programado cada ${minutos} min de documentos desde ${desde.toISOString()}`);
  const temporizador = setInterval(() => correrProgramadorSiesa(desde), minutos * 60_000);
  temporizador.unref();
  return temporizador;
}
