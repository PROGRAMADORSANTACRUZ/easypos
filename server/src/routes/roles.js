import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const soloAdmin = wrap(async (req, res, next) => {
  const admin = await prisma.usuarioRol.findFirst({ where: { usuarioId: req.usuario.id, rol: { nombre: 'ADMIN' } } });
  if (!admin) return res.status(403).json({ error: 'Solo el administrador puede gestionar roles' });
  next();
});

// Lista de roles con sus permisos y conteo de usuarios
router.get('/', wrap(async (_req, res) => {
  const roles = await prisma.rol.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      permisos: { include: { permiso: true } },
      _count: { select: { usuarios: true } },
    },
  });
  res.json(
    roles.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      activo: r.activo,
      usuarios: r._count.usuarios,
      permisos: r.permisos.map((rp) => rp.permiso.codigo),
    }))
  );
}));

router.post('/', soloAdmin, wrap(async (req, res) => {
  const { nombre, descripcion, permisos } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre del rol es requerido' });
  const existe = await prisma.rol.findUnique({ where: { nombre } });
  if (existe) return res.status(409).json({ error: 'Ese rol ya existe' });

  const rol = await prisma.rol.create({ data: { nombre, descripcion: descripcion || null } });
  await asignarPermisos(rol.id, permisos);
  await auditar({ req, accion: 'CREAR', entidad: 'Rol', entidadId: rol.id, detalle: nombre });
  res.status(201).json(rol);
}));

router.put('/:id', soloAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion, activo, permisos } = req.body;
  const actual = await prisma.rol.findUnique({ where: { id } });
  if (actual?.nombre === 'ADMIN') return res.status(403).json({ error: 'El rol ADMIN mantiene acceso total y no se puede modificar' });
  const rol = await prisma.rol.update({
    where: { id },
    data: {
      ...(nombre !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(activo !== undefined && { activo }),
    },
  });
  if (Array.isArray(permisos)) {
    await prisma.rolPermiso.deleteMany({ where: { rolId: id } });
    await asignarPermisos(id, permisos);
  }
  await auditar({ req, accion: 'EDITAR', entidad: 'Rol', entidadId: id, detalle: rol.nombre });
  res.json(rol);
}));

router.delete('/:id', soloAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.rol.findUnique({ where: { id } });
  if (actual?.nombre === 'ADMIN') return res.status(403).json({ error: 'No se puede eliminar el rol ADMIN' });
  await prisma.rol.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'Rol', entidadId: id });
  res.status(204).end();
}));

// Vincula una lista de codigos de permiso a un rol
async function asignarPermisos(rolId, codigos) {
  if (!Array.isArray(codigos) || codigos.length === 0) return;
  const permisos = await prisma.permiso.findMany({ where: { codigo: { in: codigos } } });
  if (permisos.length === 0) return;
  await prisma.rolPermiso.createMany({
    data: permisos.map((p) => ({ rolId, permisoId: p.id })),
    skipDuplicates: true,
  });
}

export default router;
