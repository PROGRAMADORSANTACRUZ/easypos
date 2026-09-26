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
  const { sistema, tipo, estado } = req.query;
  const where = {
    ...(sistema && { sistema: String(sistema) }),
    ...(tipo && { tipo: String(tipo) }),
    ...(estado && { estado: String(estado) }),
  };
  res.json(await prisma.logIntegracion.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { fecha: 'desc' },
    take: 500,
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const l = await prisma.logIntegracion.findUnique({ where: { id: String(req.params.id) } });
  if (!l) return res.status(404).json({ error: 'Log no encontrado' });
  res.json(l);
}));

router.post('/', wrap(async (req, res) => {
  const { sistema, tipo, estado, request, response, mensaje, fecha } = req.body;
  const l = await prisma.logIntegracion.create({
    data: {
      sistema: limpiar(sistema),
      tipo: limpiar(tipo),
      estado: limpiar(estado),
      request: limpiar(request),
      response: limpiar(response),
      mensaje: limpiar(mensaje),
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'log_integracion', entidadId: l.id, detalle: l.sistema || '' });
  res.status(201).json(l);
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.logIntegracion.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'log_integracion', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Log no encontrado' });
    throw e;
  }
}));

export default router;
