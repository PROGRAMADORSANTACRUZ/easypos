import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));

router.get('/', wrap(async (req, res) => {
  const { facturaId, tipoEvento, estado } = req.query;
  const where = {
    ...(facturaId && { facturaId: String(facturaId) }),
    ...(tipoEvento && { tipoEvento: String(tipoEvento) }),
    ...(estado && { estado: String(estado) }),
  };
  res.json(await prisma.eventoDIAN.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: { factura: true },
    orderBy: { fecha: 'desc' },
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const e = await prisma.eventoDIAN.findUnique({ where: { id: String(req.params.id) }, include: { factura: true } });
  if (!e) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(e);
}));

router.post('/', wrap(async (req, res) => {
  const { facturaId, tipoEvento, estado, cufe, mensaje, fecha } = req.body;
  const ev = await prisma.eventoDIAN.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      tipoEvento: limpiar(tipoEvento),
      estado: limpiar(estado),
      cufe: limpiar(cufe),
      mensaje: limpiar(mensaje),
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
    include: { factura: true },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'evento_dian', entidadId: ev.id, detalle: ev.tipoEvento || '' });
  res.status(201).json(ev);
}));

router.put('/:id', wrap(async (req, res) => {
  const { facturaId, tipoEvento, estado, cufe, mensaje, fecha } = req.body;
  try {
    const ev = await prisma.eventoDIAN.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(tipoEvento !== undefined && { tipoEvento: limpiar(tipoEvento) }),
        ...(estado !== undefined && { estado: limpiar(estado) }),
        ...(cufe !== undefined && { cufe: limpiar(cufe) }),
        ...(mensaje !== undefined && { mensaje: limpiar(mensaje) }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
      include: { factura: true },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'evento_dian', entidadId: ev.id });
    res.json(ev);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Evento no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.eventoDIAN.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'evento_dian', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Evento no encontrado' });
    throw e;
  }
}));

export default router;
