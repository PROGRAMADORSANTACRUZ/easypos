import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

router.get('/', wrap(async (req, res) => {
  const { q } = req.query;
  const where = q
    ? {
        OR: [
          { nombre: { contains: String(q) } },
          { nit: { contains: String(q) } },
          { email: { contains: String(q) } },
        ],
      }
    : undefined;
  const proveedores = await prisma.proveedor.findMany({ where, orderBy: { nombre: 'asc' } });
  res.json(proveedores);
}));

router.get('/:id', wrap(async (req, res) => {
  const p = await prisma.proveedor.findUnique({ where: { id: String(req.params.id) } });
  if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
  res.json(p);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, nit, telefono, email, direccion, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const p = await prisma.proveedor.create({
    data: {
      nombre: nombreLimpio,
      nit: limpiar(nit),
      telefono: limpiar(telefono),
      email: limpiar(email),
      direccion: limpiar(direccion),
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'proveedor', entidadId: p.id, detalle: p.nombre });
  res.status(201).json(p);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, nit, telefono, email, direccion, activo } = req.body;
  try {
    const p = await prisma.proveedor.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(nit !== undefined && { nit: limpiar(nit) }),
        ...(telefono !== undefined && { telefono: limpiar(telefono) }),
        ...(email !== undefined && { email: limpiar(email) }),
        ...(direccion !== undefined && { direccion: limpiar(direccion) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'proveedor', entidadId: p.id, detalle: p.nombre });
    res.json(p);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Proveedor no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.proveedor.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'proveedor', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Proveedor no encontrado' });
    throw e;
  }
}));

export default router;
