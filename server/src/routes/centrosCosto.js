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
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.centroCosto.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await prisma.centroCosto.findUnique({ where: { id: String(req.params.id) } });
  if (!c) return res.status(404).json({ error: 'Centro de costo no encontrado' });
  res.json(c);
}));

router.post('/', wrap(async (req, res) => {
  const { codigo, nombre, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const c = await prisma.centroCosto.create({
    data: { nombre: nombreLimpio, codigo: limpiar(codigo), ...(activo !== undefined && { activo: aBool(activo) }) },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'centro_costo', entidadId: c.id, detalle: c.nombre });
  res.status(201).json(c);
}));

router.put('/:id', wrap(async (req, res) => {
  const { codigo, nombre, activo } = req.body;
  try {
    const c = await prisma.centroCosto.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(codigo !== undefined && { codigo: limpiar(codigo) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'centro_costo', entidadId: c.id, detalle: c.nombre });
    res.json(c);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Centro de costo no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.centroCosto.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'centro_costo', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Centro de costo no encontrado' });
    throw e;
  }
}));

export default router;
