import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { diaColombia, inicioDiaColombia } from '../fechaColombia.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const HORA = 60 * 60 * 1000;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CAMPOS_OBJETIVO = { hoy: 'objetivoHoy', dias7: 'objetivo7Dias', dias30: 'objetivo30Dias', anio: 'objetivoAnio' };

const redondear = (valor) => Math.round(valor * 100) / 100;

// Suma dias a una fecha YYYY-MM-DD sin depender de la zona horaria del servidor.
export function sumarDias(dia, dias) {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, d + dias)).toISOString().slice(0, 10);
}

// Calcula los indicadores y series del dashboard a partir de datos ya consultados.
export function calcularDashboard({ ahora, horas, ventas, pedidos, compras, egresosCaja, objetivos }) {
  const hoy = diaColombia(ahora);
  const desde7 = sumarDias(hoy, -6);
  const desde30 = sumarDias(hoy, -29);
  const inicioAnio = `${hoy.slice(0, 4)}-01-01`;

  const totalDesde = (dia) => redondear(ventas
    .filter((venta) => diaColombia(venta.fecha) >= dia)
    .reduce((suma, venta) => suma + (venta.total || 0), 0));
  const indicadores = [
    { id: 'hoy', label: 'Facturado hoy', valor: totalDesde(hoy), objetivo: objetivos?.objetivoHoy ?? null },
    { id: 'dias7', label: 'Últimos 7 días', valor: totalDesde(desde7), objetivo: objetivos?.objetivo7Dias ?? null },
    { id: 'dias30', label: 'Últimos 30 días', valor: totalDesde(desde30), objetivo: objetivos?.objetivo30Dias ?? null },
    { id: 'anio', label: 'Año actual', valor: totalDesde(inicioAnio), objetivo: objetivos?.objetivoAnio ?? null },
  ];

  // Colombia no tiene horario de verano: las horas UTC y locales comparten los mismos cortes.
  const horaActual = Math.floor(ahora.getTime() / HORA) * HORA;
  const pedidosPorHora = Array.from({ length: horas }, (_, indice) => {
    const inicio = horaActual - (horas - 1 - indice) * HORA;
    return {
      hora: new Date(inicio).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }),
      cantidad: pedidos.filter((pedido) => {
        const t = new Date(pedido.createdAt).getTime();
        return t >= inicio && t < inicio + HORA;
      }).length,
    };
  });

  const facturado7Dias = Array.from({ length: 7 }, (_, indice) => {
    const dia = sumarDias(desde7, indice);
    const [anio, mes, d] = dia.split('-').map(Number);
    return {
      fecha: dia,
      etiqueta: dia === hoy ? 'Hoy' : DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, d)).getUTCDay()],
      total: redondear(ventas.filter((venta) => diaColombia(venta.fecha) === dia).reduce((suma, venta) => suma + (venta.total || 0), 0)),
    };
  });

  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  const ingresosEgresos = Array.from({ length: 12 }, (_, indice) => {
    const fecha = new Date(Date.UTC(anioHoy, mesHoy - 1 - (11 - indice), 1));
    const clave = fecha.toISOString().slice(0, 7);
    const delMes = (lista) => redondear(lista
      .filter((registro) => diaColombia(registro.fecha).slice(0, 7) === clave)
      .reduce((suma, registro) => suma + (registro.total || 0), 0));
    return {
      mes: clave,
      etiqueta: `${MESES[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`,
      ingresos: delMes(ventas),
      egresos: redondear(delMes(compras) + delMes(egresosCaja)),
    };
  });

  return { hoy, indicadores, pedidosPorHora, facturado7Dias, ingresosEgresos };
}

router.get('/', wrap(async (req, res) => {
  const horas = [12, 24].includes(Number(req.query.horas)) ? Number(req.query.horas) : 12;
  const ahora = new Date();
  const hoy = diaColombia(ahora);
  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  const inicio12Meses = new Date(Date.UTC(anioHoy, mesHoy - 12, 1)).toISOString().slice(0, 10);
  const desdeDia = [inicio12Meses, `${hoy.slice(0, 4)}-01-01`, sumarDias(hoy, -29)].sort()[0];
  const desde = inicioDiaColombia(desdeDia);
  const desdeMeses = inicioDiaColombia(inicio12Meses);

  const [facturas, ventasPos, pedidos, compras, egresos, objetivos] = await Promise.all([
    prisma.factura.findMany({ where: { createdAt: { gte: desde } }, select: { createdAt: true, total: true } }),
    prisma.facturaVenta.findMany({ where: { createdAt: { gte: desde } }, select: { createdAt: true, total: true } }),
    prisma.pedido.findMany({
      where: { createdAt: { gte: new Date(ahora.getTime() - (horas + 1) * HORA) }, estado: { not: 'CANCELADO' } },
      select: { createdAt: true },
    }),
    prisma.compra.findMany({ where: { fecha: { gte: desdeMeses } }, select: { fecha: true, total: true } }),
    prisma.movimientoCaja.findMany({ where: { tipo: 'EGRESO', fecha: { gte: desdeMeses } }, select: { fecha: true, monto: true } }),
    prisma.objetivoDashboard.findUnique({ where: { id: 1 } }),
  ]);

  res.json(calcularDashboard({
    ahora,
    horas,
    ventas: [...facturas, ...ventasPos].map((venta) => ({ fecha: new Date(venta.createdAt), total: venta.total })),
    pedidos,
    compras: compras.map((compra) => ({ fecha: new Date(compra.fecha), total: compra.total })),
    egresosCaja: egresos.map((egreso) => ({ fecha: new Date(egreso.fecha), total: egreso.monto })),
    objetivos,
  }));
}));

// Objetivos de ventas: un valor vacio deja el indicador sin objetivo.
router.put('/objetivos', wrap(async (req, res) => {
  const data = {};
  for (const [clave, campo] of Object.entries(CAMPOS_OBJETIVO)) {
    const valor = req.body?.[clave];
    if (valor === undefined) continue;
    if (valor === null || valor === '') { data[campo] = null; continue; }
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return res.status(400).json({ error: 'Los objetivos deben ser valores mayores o iguales a cero.' });
    data[campo] = redondear(numero);
  }
  const objetivos = await prisma.objetivoDashboard.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await auditar({ req, accion: 'EDITAR', entidad: 'objetivos_dashboard', entidadId: 1, detalle: JSON.stringify(data) });
  res.json(objetivos);
}));

export default router;
