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
  const { q } = req.query;
  const where = q
    ? { OR: [{ nombre: { contains: String(q) } }, { codigo: { contains: String(q) } }, { ciudad: { contains: String(q) } }] }
    : undefined;
  res.json(await prisma.sucursal.findMany({ where, orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const s = await prisma.sucursal.findUnique({ where: { id: String(req.params.id) } });
  if (!s) return res.status(404).json({ error: 'Sucursal no encontrada' });
  res.json(s);
}));

router.post('/', wrap(async (req, res) => {
  const { codigo, nombre, direccion, telefono, ciudad, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const s = await prisma.sucursal.create({
    data: {
      nombre: nombreLimpio,
      codigo: limpiar(codigo),
      direccion: limpiar(direccion),
      telefono: limpiar(telefono),
      ciudad: limpiar(ciudad),
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'sucursal', entidadId: s.id, detalle: s.nombre });
  res.status(201).json(s);
}));

router.put('/:id', wrap(async (req, res) => {
  const { codigo, nombre, direccion, telefono, ciudad, activo } = req.body;
  try {
    const s = await prisma.sucursal.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(codigo !== undefined && { codigo: limpiar(codigo) }),
        ...(direccion !== undefined && { direccion: limpiar(direccion) }),
        ...(telefono !== undefined && { telefono: limpiar(telefono) }),
        ...(ciudad !== undefined && { ciudad: limpiar(ciudad) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'sucursal', entidadId: s.id, detalle: s.nombre });
    res.json(s);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Sucursal no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.sucursal.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'sucursal', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Sucursal no encontrada' });
    throw e;
  }
}));

export default router;
