// Programador del envio de ventas a Siesa: cada SIESA_ENVIO_INTERVALO_MIN minutos (60 por defecto) envia las
// facturas pendientes de cada restaurante activo. Solo toma facturas creadas desde SIESA_ENVIO_DESDE, para no
// reenviar el historial; sin esa fecha el programador no arranca.
import { prisma, tenantStorage } from './prisma.js';
import { platformPrisma } from './platformPrisma.js';
import { getTenantPrisma } from './tenantManager.js';
import { configSiesa, intentarEnvioVentaSiesa } from './siesaVentas.js';

const MAX_ERRORES = 5;
const LIMITE_POR_CORRIDA = 200;

// Pendiente = sin envio aceptado ni omitido y con menos de MAX_ERRORES rechazos de Siesa.
// Las fallas de red/servidor (estado REINTENTAR) no cuentan: se reintentan en cada corrida.
export function seleccionarPendientes(facturas, logs, limite = LIMITE_POR_CORRIDA) {
  const porTipo = new Map();
  for (const { tipo, estado } of logs) {
    const resumen = porTipo.get(tipo) || { cerrada: false, errores: 0 };
    if (estado === 'OK' || estado === 'OMITIDO') resumen.cerrada = true;
    if (estado === 'ERROR') resumen.errores += 1;
    porTipo.set(tipo, resumen);
  }
  return facturas
    .filter(({ id }) => {
      const resumen = porTipo.get(`VENTA:${id}`);
      return !resumen || (!resumen.cerrada && resumen.errores < MAX_ERRORES);
    })
    .slice(0, limite);
}

// Envia las pendientes de la base activa (la del restaurante dentro de tenantStorage o la base por defecto).
export async function enviarPendientesSiesa({ desde, limite = LIMITE_POR_CORRIDA, intentar = intentarEnvioVentaSiesa } = {}) {
  const resumen = { OK: 0, ERROR: 0, REINTENTAR: 0, OMITIDO: 0 };
  for (const modelo of ['factura', 'facturaVenta']) {
    const facturas = await prisma[modelo].findMany({
      where: { createdAt: { gte: desde } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!facturas.length) continue;
    const logs = await prisma.logIntegracion.findMany({
      where: { sistema: 'SIESA', tipo: { in: facturas.map(({ id }) => `VENTA:${id}`) } },
      select: { tipo: true, estado: true },
    });
    for (const { id } of seleccionarPendientes(facturas, logs, limite)) {
      const { estado } = await intentar(modelo, id);
      if (estado in resumen) resumen[estado] += 1;
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
  console.log(`Siesa: envio programado cada ${minutos} min de facturas desde ${desde.toISOString()}`);
  const temporizador = setInterval(() => correrProgramadorSiesa(desde), minutos * 60_000);
  temporizador.unref();
  return temporizador;
}
