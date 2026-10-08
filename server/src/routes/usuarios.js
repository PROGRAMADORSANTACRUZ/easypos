import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { firmarToken, establecerCookieSesion, limpiarCookieSesion, requireAuth, MODULOS_FACTURACION, permisosEfectivos } from '../middleware/auth.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Freno basico anti fuerza-bruta en memoria: bloquea 15 min tras 5 intentos fallidos
// por combinacion IP+usuario. Se reinicia si el proceso se reinicia (aceptable para un POS local).
const INTENTOS_MAX = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentosLogin = new Map(); // clave -> { fallos, bloqueadoHasta }
function claveIntento(req, usuario) {
  return `${req.ip}:${usuario}`;
}
function registrarFallo(clave) {
  const actual = intentosLogin.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  actual.fallos += 1;
  if (actual.fallos >= INTENTOS_MAX) actual.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentosLogin.set(clave, actual);
}
function limpiarIntentos(clave) {
  intentosLogin.delete(clave);
}

// Politica minima de contrasena. Devuelve mensaje de error o null si es valida.
const PASSWORD_MIN = 6;
function validarPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir letras y números';
  }
  return null;
}

// No exponemos el hash de la contraseña en las respuestas
const sinHash = ({ passwordHash, ...rest }) => rest;

// Calcula roles y permisos efectivos de un usuario (RBAC)
async function conRolesYPermisos(u) {
  const asignaciones = await prisma.usuarioRol.findMany({
    where: { usuarioId: u.id },
    include: { rol: { include: { permisos: { include: { permiso: true } } } } },
  });
  const roles = asignaciones.map((a) => a.rol.nombre);
  const permisos = permisosEfectivos(roles, u.modulosFacturacion, asignaciones.flatMap((a) => a.rol.permisos.map((rp) => rp.permiso.codigo)));
  return { ...sinHash(u), roles, permisos };
}

// Inicio de sesión: valida usuario/contraseña, devuelve roles/permisos y un token de sesion (JWT)
router.post('/login', wrap(async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });

  const clave = claveIntento(req, usuario);
  const intento = intentosLogin.get(clave);
  if (intento?.bloqueadoHasta > Date.now()) {
    const minutos = Math.ceil((intento.bloqueadoHasta - Date.now()) / 60000);
    return res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} min.` });
  }

  const u = await prisma.usuario.findUnique({ where: { usuario } });
  if (!u || !bcrypt.compareSync(password, u.passwordHash)) {
    registrarFallo(clave);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  if (!u.activo) return res.status(403).json({ error: 'Usuario inactivo' });
  limpiarIntentos(clave);
  await auditar({ req, usuarioId: u.id, accion: 'LOGIN', entidad: 'Usuario', entidadId: u.id, detalle: u.usuario });
  const datos = await conRolesYPermisos(u);
  // Si el request trajo un restaurante resuelto (header x-tenant-id), lo devolvemos
  // para que el frontend confirme con cual restaurante quedo la sesion.
  if (req.tenant) datos.restaurante = { id: req.tenant.id, slug: req.tenant.slug, nombre: req.tenant.nombre };
  const token = firmarToken(datos, { restauranteId: req.tenant?.id });
  establecerCookieSesion(req, res, token);
  if (req.get('x-easypos-session') !== 'cookie') datos.token = token;
  res.json(datos);
}));

// A partir de aqui todas las rutas de usuarios requieren sesion valida.
router.use(requireAuth);

router.get('/sesion', (req, res) => {
  res.json({
    ...req.usuario,
    ...(req.tenant && { restaurante: { id: req.tenant.id, slug: req.tenant.slug, nombre: req.tenant.nombre } }),
  });
});

router.post('/logout', (req, res) => {
  limpiarCookieSesion(req, res);
  res.status(204).end();
});

const soloAdmin = wrap(async (req, res, next) => {
  const asignacion = await prisma.usuarioRol.findFirst({
    where: { usuarioId: req.usuario.id, rol: { nombre: 'ADMIN' } },
  });
  if (!asignacion) return res.status(403).json({ error: 'Solo el administrador puede gestionar usuarios' });
  next();
});
const validarModulos = (modulos) => Array.isArray(modulos) && modulos.every((modulo) => MODULOS_FACTURACION.includes(modulo));

router.get('/', wrap(async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { nombre: 'asc' },
    include: { roles: { include: { rol: true } } },
  });
  res.json(
    usuarios.map((u) => ({
      ...sinHash(u),
      roles: u.roles.map((ur) => ur.rol.nombre),
    }))
  );
}));

router.post('/', soloAdmin, wrap(async (req, res) => {
  const { nombre, usuario, correo, password, roles, modulosFacturacion = [] } = req.body;
  if (!nombre || !usuario || !password) {
    return res.status(400).json({ error: 'nombre, usuario y contraseña son requeridos' });
  }
  const errorPass = validarPassword(password);
  if (errorPass) return res.status(400).json({ error: errorPass });
  if (!validarModulos(modulosFacturacion)) return res.status(400).json({ error: 'Módulos de facturación inválidos' });
  const existe = await prisma.usuario.findUnique({ where: { usuario } });
  if (existe) return res.status(409).json({ error: 'Ese usuario ya existe' });
  const creado = await prisma.usuario.create({
    data: { nombre, usuario, correo: correo || null, passwordHash: bcrypt.hashSync(password, 10), modulosFacturacion },
  });
  await asignarRoles(creado.id, roles);
  await auditar({ req, accion: 'CREAR', entidad: 'Usuario', entidadId: creado.id, detalle: usuario });
  res.status(201).json(sinHash(creado));
}));

router.put('/:id', soloAdmin, wrap(async (req, res) => {
  const id = req.params.id;
  const { nombre, usuario, correo, password, activo, roles, modulosFacturacion } = req.body;
  if (modulosFacturacion !== undefined && !validarModulos(modulosFacturacion)) return res.status(400).json({ error: 'Módulos de facturación inválidos' });
  if (password !== undefined && password !== '') {
    const errorPass = validarPassword(password);
    if (errorPass) return res.status(400).json({ error: errorPass });
  }
  const actualizado = await prisma.usuario.update({
    where: { id },
    data: {
      ...(nombre !== undefined && { nombre }),
      ...(usuario !== undefined && { usuario }),
      ...(correo !== undefined && { correo }),
      ...(password !== undefined && password !== '' && { passwordHash: bcrypt.hashSync(password, 10) }),
      ...(activo !== undefined && { activo }),
      ...(modulosFacturacion !== undefined && { modulosFacturacion }),
    },
  });
  if (Array.isArray(roles)) {
    await prisma.usuarioRol.deleteMany({ where: { usuarioId: id } });
    await asignarRoles(id, roles);
  }
  await auditar({ req, accion: 'EDITAR', entidad: 'Usuario', entidadId: id, detalle: actualizado.usuario });
  res.json(sinHash(actualizado));
}));

router.delete('/:id', soloAdmin, wrap(async (req, res) => {
  const id = req.params.id;
  await prisma.usuario.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'Usuario', entidadId: id });
  res.status(204).end();
}));

// Vincula una lista de nombres de rol a un usuario
async function asignarRoles(usuarioId, nombresRol) {
  if (!Array.isArray(nombresRol) || nombresRol.length === 0) return;
  const roles = await prisma.rol.findMany({ where: { nombre: { in: nombresRol } } });
  if (roles.length === 0) return;
  await prisma.usuarioRol.createMany({
    data: roles.map((r) => ({ usuarioId, rolId: r.id })),
    skipDuplicates: true,
  });
}

export default router;
