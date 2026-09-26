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
  const { q, tipo } = req.query;
  const where = {
    ...(tipo && { tipo: String(tipo) }),
    ...(q && {
      OR: [
        { nombre: { contains: String(q) } },
        { numeroDocumento: { contains: String(q) } },
        { email: { contains: String(q) } },
      ],
    }),
  };
  res.json(await prisma.tercero.findMany({ where: Object.keys(where).length ? where : undefined, orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const t = await prisma.tercero.findUnique({ where: { id: String(req.params.id) } });
  if (!t) return res.status(404).json({ error: 'Tercero no encontrado' });
  res.json(t);
}));

router.post('/', wrap(async (req, res) => {
  const { tipoDocumento, numeroDocumento, nombre, tipo, telefono, email, direccion, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const t = await prisma.tercero.create({
    data: {
      nombre: nombreLimpio,
      tipoDocumento: limpiar(tipoDocumento),
      numeroDocumento: limpiar(numeroDocumento),
      tipo: limpiar(tipo),
      telefono: limpiar(telefono),
      email: limpiar(email),
      direccion: limpiar(direccion),
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'tercero', entidadId: t.id, detalle: t.nombre });
  res.status(201).json(t);
}));

router.put('/:id', wrap(async (req, res) => {
  const { tipoDocumento, numeroDocumento, nombre, tipo, telefono, email, direccion, activo } = req.body;
  try {
    const t = await prisma.tercero.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipoDocumento !== undefined && { tipoDocumento: limpiar(tipoDocumento) }),
        ...(numeroDocumento !== undefined && { numeroDocumento: limpiar(numeroDocumento) }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(telefono !== undefined && { telefono: limpiar(telefono) }),
        ...(email !== undefined && { email: limpiar(email) }),
        ...(direccion !== undefined && { direccion: limpiar(direccion) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'tercero', entidadId: t.id, detalle: t.nombre });
    res.json(t);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tercero no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.tercero.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'tercero', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tercero no encontrado' });
    throw e;
  }
}));

export default router;
