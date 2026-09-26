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
const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.promocion.findMany({ orderBy: { createdAt: 'desc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const p = await prisma.promocion.findUnique({ where: { id: String(req.params.id) } });
  if (!p) return res.status(404).json({ error: 'Promoción no encontrada' });
  res.json(p);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, tipo, valor, fechaInicio, fechaFin, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const p = await prisma.promocion.create({
    data: {
      nombre: nombreLimpio,
      tipo: limpiar(tipo),
      valor: toNum(valor),
      ...(toDate(fechaInicio) && { fechaInicio: toDate(fechaInicio) }),
      ...(toDate(fechaFin) && { fechaFin: toDate(fechaFin) }),
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'promocion', entidadId: p.id, detalle: p.nombre });
  res.status(201).json(p);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, tipo, valor, fechaInicio, fechaFin, activo } = req.body;
  try {
    const p = await prisma.promocion.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(valor !== undefined && { valor: toNum(valor) }),
        ...(fechaInicio !== undefined && { fechaInicio: toDate(fechaInicio) ?? null }),
        ...(fechaFin !== undefined && { fechaFin: toDate(fechaFin) ?? null }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'promocion', entidadId: p.id, detalle: p.nombre });
    res.json(p);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Promoción no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.promocion.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'promocion', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Promoción no encontrada' });
    throw e;
  }
}));

export default router;
