import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { crearNotaCreditoFactus } from '../factus.js';
import { inicioDiaColombia, finDiaColombia } from '../fechaColombia.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));

router.get('/', wrap(async (req, res) => {
  const { facturaId, desde, hasta } = req.query;
  const where = { ...(facturaId && { facturaId: String(facturaId) }) };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = inicioDiaColombia(desde);
    if (hasta) where.fecha.lt = finDiaColombia(hasta);
  }
  const notas = await prisma.notaCredito.findMany({
    where,
    include: { factura: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(notas);
}));

router.get('/:id', wrap(async (req, res) => {
  const n = await prisma.notaCredito.findUnique({ where: { id: String(req.params.id) }, include: { factura: true } });
  if (!n) return res.status(404).json({ error: 'Nota crédito no encontrada' });
  res.json(n);
}));

// Reporta (o reintenta reportar) una nota credito ya creada localmente a Factus.
async function reportarNotaCreditoAFactus(nota) {
  if (!nota.facturaId) return nota;
  const factura = await prisma.factura.findUnique({
    where: { id: nota.facturaId },
    include: { cliente: true, detalle: { include: { producto: true } } },
  });
  if (!factura?.numeroFactus) return nota;
  try {
    const resp = await crearNotaCreditoFactus({ nota, factura });
    const data = resp.data || {};
    return prisma.notaCredito.update({
      where: { id: nota.id },
      data: { cufe: data.cufe || null, numeroFactus: data.number || null, pdfPath: data.links?.public_url || null, estadoDIAN: 'ACEPTADA' },
    });
  } catch (e) {
    console.error('Factus: fallo al emitir nota credito', nota.id, e.message, e.detalle);
    return prisma.notaCredito.update({ where: { id: nota.id }, data: { estadoDIAN: 'ERROR' } });
  }
}

router.post('/', wrap(async (req, res) => {
  const { facturaId, numeroNota, motivo, total, estadoDIAN, fecha } = req.body;
  const n = await prisma.notaCredito.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      numeroNota: numeroNota ? String(numeroNota) : null,
      motivo: motivo ? String(motivo) : null,
      total: toNum(total),
      estadoDIAN: estadoDIAN ? String(estadoDIAN) : null,
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'nota_credito', entidadId: n.id, detalle: n.numeroNota || '' });
  const notaFinal = await reportarNotaCreditoAFactus(n);
  res.status(201).json(notaFinal);
}));

// Reintenta el envío a Factus de una nota crédito que quedó con estadoDIAN = 'ERROR' o sin reportar.
router.post('/:id/reenviar-dian', wrap(async (req, res) => {
  const n = await prisma.notaCredito.findUnique({ where: { id: String(req.params.id) } });
  if (!n) return res.status(404).json({ error: 'Nota crédito no encontrada' });
  const notaFinal = await reportarNotaCreditoAFactus(n);
  await auditar({ req, accion: 'EDITAR', entidad: 'nota_credito', entidadId: n.id, detalle: `Reenvio a Factus • ${notaFinal.estadoDIAN}` });
  res.json(notaFinal);
}));


router.put('/:id', wrap(async (req, res) => {
  const { facturaId, numeroNota, motivo, total, estadoDIAN, fecha } = req.body;
  try {
    const n = await prisma.notaCredito.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(numeroNota !== undefined && { numeroNota: numeroNota ? String(numeroNota) : null }),
        ...(motivo !== undefined && { motivo: motivo ? String(motivo) : null }),
        ...(total !== undefined && { total: toNum(total) }),
        ...(estadoDIAN !== undefined && { estadoDIAN: estadoDIAN ? String(estadoDIAN) : null }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'nota_credito', entidadId: n.id, detalle: n.numeroNota || '' });
    res.json(n);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Nota crédito no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.notaCredito.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'nota_credito', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Nota crédito no encontrada' });
    throw e;
  }
}));

export default router;
