import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const redondear = (n) => Math.round(n * 100) / 100;

// Resumen de una factura a credito con lo abonado y su saldo pendiente
const resumenFactura = (f) => {
  const abonado = redondear((f.abonos || []).reduce((s, a) => s + a.monto, 0));
  const notasCredito = redondear((f.notasCredito || []).reduce((s, n) => s + (n.total || 0), 0));
  const notasDebito = redondear((f.notasDebito || []).reduce((s, n) => s + (n.total || 0), 0));
  const retenciones = redondear((f.retenciones || []).reduce((s, r) => s + (r.valor || 0), 0));
  const saldo = redondear(f.total + notasDebito - abonado - notasCredito - retenciones);
  return {
    id: f.id,
    createdAt: f.createdAt,
    vence: f.vence,
    creditoDias: f.creditoDias,
    total: f.total,
    abonado,
    notasCredito,
    notasDebito,
    retenciones,
    saldo,
    pagada: saldo <= 0,
    abonos: f.abonos,
  };
};

// Cuentas por cobrar: clientes con facturas a credito y saldo pendiente.
// ?todas=1 incluye tambien las facturas ya pagadas.
router.get('/', wrap(async (req, res) => {
  const incluirPagadas = req.query.todas === '1';
  const include = { abonos: true, pedido: { include: { clienteRel: true } } };
  const [facturas, ventas] = await Promise.all([
    prisma.factura.findMany({
      where: { credito: true },
      include: { ...include, notasCredito: true, notasDebito: true, retenciones: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.facturaVenta.findMany({ where: { credito: true }, include, orderBy: { createdAt: 'asc' } }),
  ]);
  facturas.push(...ventas.map((f) => ({ ...f, notasCredito: [], notasDebito: [], retenciones: [] })));
  facturas.sort((a, b) => a.createdAt - b.createdAt);

  const porCliente = new Map();
  for (const f of facturas) {
    const resumen = resumenFactura(f);
    if (!incluirPagadas && resumen.pagada) continue;
    const cli = f.pedido?.clienteRel;
    const clave = cli?.id ?? `sin-${f.pedido?.cliente || 'Consumidor Final'}`;
    if (!porCliente.has(clave)) {
      porCliente.set(clave, {
        clienteId: cli?.id ?? null,
        nombre: cli?.nombre || f.pedido?.cliente || 'Consumidor Final',
        documento: cli?.documento || null,
        telefono: cli?.telefono || null,
        creditoCupo: cli?.creditoCupo ?? null,
        saldoTotal: 0,
        facturas: [],
      });
    }
    const grupo = porCliente.get(clave);
    grupo.facturas.push(resumen);
    grupo.saldoTotal = redondear(grupo.saldoTotal + resumen.saldo);
  }

  const lista = [...porCliente.values()].sort((a, b) => b.saldoTotal - a.saldoTotal);
  res.json(lista);
}));

// Registrar un abono a una factura a credito
// body: { facturaId, monto, metodoPago?, nota? }
router.post('/abonos', wrap(async (req, res) => {
  const facturaId = String(req.body?.facturaId || '');
  const monto = Number(req.body?.monto);
  if (!facturaId) return res.status(400).json({ error: 'facturaId es requerido' });
  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto del abono debe ser mayor a 0' });

  let esVenta = false;
  let factura = await prisma.factura.findUnique({ where: { id: facturaId }, include: { abonos: true, notasCredito: true, notasDebito: true, retenciones: true } });
  if (!factura) {
    factura = await prisma.facturaVenta.findUnique({ where: { id: facturaId }, include: { abonos: true } });
    esVenta = !!factura;
    if (factura) Object.assign(factura, { notasCredito: [], notasDebito: [], retenciones: [] });
  }
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  if (!factura.credito) return res.status(400).json({ error: 'La factura no es a crédito' });

  const abonado = factura.abonos.reduce((s, a) => s + a.monto, 0);
  const notasCredito = (factura.notasCredito || []).reduce((s, n) => s + (n.total || 0), 0);
  const notasDebito = (factura.notasDebito || []).reduce((s, n) => s + (n.total || 0), 0);
  const retenciones = (factura.retenciones || []).reduce((s, r) => s + (r.valor || 0), 0);
  const saldo = redondear(factura.total + notasDebito - abonado - notasCredito - retenciones);
  if (saldo <= 0) return res.status(409).json({ error: 'La factura ya está pagada' });
  if (monto > saldo) return res.status(409).json({ error: `El abono supera el saldo pendiente (${saldo})` });

  await prisma.abono.create({
    data: {
      ...(esVenta ? { facturaVentaId: facturaId } : { facturaId }),
      monto: redondear(monto),
      metodoPago: (req.body?.metodoPago || 'EFECTIVO'),
      nota: req.body?.nota ? String(req.body.nota).trim() : null,
    },
  });

  const actualizada = esVenta
    ? await prisma.facturaVenta.findUnique({ where: { id: facturaId }, include: { abonos: true } })
    : await prisma.factura.findUnique({ where: { id: facturaId }, include: { abonos: true } });
  res.status(201).json(resumenFactura(actualizada));
}));

export default router;
