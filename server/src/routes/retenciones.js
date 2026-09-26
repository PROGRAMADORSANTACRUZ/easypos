import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));
const redondear = (n) => Math.round(n * 100) / 100;

// Valor de la retencion: si no viene, se calcula como base * porcentaje / 100.
const calcularValor = (valor, base, porcentaje) => {
  const v = toNum(valor);
  if (v != null) return v;
  const b = toNum(base);
  const p = toNum(porcentaje);
  if (b != null && p != null) return redondear((b * p) / 100);
  return null;
};

router.get('/', wrap(async (req, res) => {
  const { facturaId, tipo, desde, hasta } = req.query;
  const where = {
    ...(facturaId && { facturaId: String(facturaId) }),
    ...(tipo && { tipo: String(tipo) }),
  };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999`);
  }
  const retenciones = await prisma.retencionFactura.findMany({
    where,
    include: { factura: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(retenciones);
}));

router.get('/:id', wrap(async (req, res) => {
  const r = await prisma.retencionFactura.findUnique({ where: { id: String(req.params.id) }, include: { factura: true } });
  if (!r) return res.status(404).json({ error: 'Retención no encontrada' });
  res.json(r);
}));

router.post('/', wrap(async (req, res) => {
  const { facturaId, tipo, base, porcentaje, valor, fecha } = req.body;
  const r = await prisma.retencionFactura.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      tipo: tipo ? String(tipo) : null,
      base: toNum(base),
      porcentaje: toNum(porcentaje),
      valor: calcularValor(valor, base, porcentaje),
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'retencion_factura', entidadId: r.id, detalle: `${r.tipo || ''} ${r.valor || ''}`.trim() });
  res.status(201).json(r);
}));

router.put('/:id', wrap(async (req, res) => {
  const { facturaId, tipo, base, porcentaje, valor, fecha } = req.body;
  try {
    const r = await prisma.retencionFactura.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(tipo !== undefined && { tipo: tipo ? String(tipo) : null }),
        ...(base !== undefined && { base: toNum(base) }),
        ...(porcentaje !== undefined && { porcentaje: toNum(porcentaje) }),
        ...(valor !== undefined && { valor: toNum(valor) }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'retencion_factura', entidadId: r.id, detalle: `${r.tipo || ''} ${r.valor || ''}`.trim() });
    res.json(r);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Retención no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.retencionFactura.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'retencion_factura', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Retención no encontrada' });
    throw e;
  }
}));

export default router;
