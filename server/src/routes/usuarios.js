import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { firmarToken, establecerCookieSesion, limpiarCookieSesion, requireAuth, permisosEfectivos } from '../middleware/auth.js';
import { centrosUnicos } from '../centrosUsuario.js';

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
const sinHash = ({ passwordHash, modulosFacturacion, ...rest }) => rest;
const normalizarMayusculas = (valor) => typeof valor === 'string' ? valor.toUpperCase() : valor;
const normalizarUsuario = normalizarMayusculas;

// Calcula roles y permisos efectivos de un usuario (RBAC)
async function conRolesYPermisos(u) {
  const [asignaciones, centros] = await Promise.all([
    prisma.usuarioRol.findMany({
      where: { usuarioId: u.id },
      include: { rol: { include: { permisos: { include: { permiso: true } } } } },
    }),
    prisma.usuarioCentroOperacion.findMany({
      where: { usuarioId: u.id },
      include: { centroOperacion: { include: { compania: true } } },
    }),
  ]);
  const roles = asignaciones.map((a) => a.rol.nombre);
  const permisos = permisosEfectivos(asignaciones.flatMap((a) => a.rol.permisos.map((rp) => rp.permiso.codigo)));
  return { ...sinHash(u), roles, permisos, centrosOperacion: centros.map(({ centroOperacion }) => centroOperacion) };
}

// Inicio de sesión: valida usuario/contraseña, devuelve roles/permisos y un token de sesion (JWT)
router.post('/login', wrap(async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });

  const usuarioNormalizado = normalizarUsuario(usuario);
  const clave = claveIntento(req, usuarioNormalizado);
  const intento = intentosLogin.get(clave);
  if (intento?.bloqueadoHasta > Date.now()) {
    const minutos = Math.ceil((intento.bloqueadoHasta - Date.now()) / 60000);
    return res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} min.` });
  }

  const u = await prisma.usuario.findFirst({ where: { usuario: { equals: usuarioNormalizado, mode: 'insensitive' } } });
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
  if (req.tenant) datos.restaurante = { id: req.tenant.id, slug: req.tenant.slug, nombre: req.tenant.nombre, modulos: req.tenant.modulos };
  const token = firmarToken(datos, { restauranteId: req.tenant?.id });
  establecerCookieSesion(req, res, token);
  if (req.get('x-pos-session') !== 'cookie') datos.token = token;
  res.json(datos);
}));

// A partir de aqui todas las rutas de usuarios requieren sesion valida.
router.use(requireAuth);

router.get('/sesion', (req, res) => {
  res.json({
    ...req.usuario,
    ...(req.tenant && { restaurante: { id: req.tenant.id, slug: req.tenant.slug, nombre: req.tenant.nombre, modulos: req.tenant.modulos } }),
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
const exigirPermiso = (codigo) => (req, res, next) => {
  if ((req.usuario?.permisos || []).includes(codigo)) return next();
  return res.status(403).json({ error: `No tienes permiso para ${codigo}` });
};

router.get('/', exigirPermiso('usuarios.ver'), wrap(async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      roles: { include: { rol: true } },
      centrosOperacion: { include: { centroOperacion: { include: { compania: true } } } },
      mesasAsignadas: { where: { esFantasma: false }, orderBy: { numero: 'asc' }, select: { id: true, numero: true } },
    },
  });
  res.json(
    usuarios.map((u) => ({
      ...sinHash(u),
      roles: u.roles.map((ur) => ur.rol.nombre),
      centrosOperacion: u.centrosOperacion.map(({ centroOperacion }) => centroOperacion),
      mesasAsignadas: u.mesasAsignadas,
    }))
  );
}));

async function validarCentrosOperacion(codigos, { obligatorio = false } = {}) {
  const centros = centrosUnicos(codigos);
  if (obligatorio && centros.length === 0) return { error: 'Asigna al menos un centro de operaciones al usuario' };
  if (!Array.isArray(codigos)) return { centros, error: null };
  const encontrados = await prisma.centroOperacion.findMany({
    where: {
      codigo: { in: centros },
      estado: 'Activo',
      companiaCodigo: { in: ['004', '006'] },
    },
    select: { codigo: true },
  });
  if (encontrados.length !== centros.length) {
    return { error: 'Selecciona centros activos pertenecientes a las compañías 004 o 006' };
  }
  return { centros, error: null };
}

async function validarMesasAsignadas(mesaIds, roles) {
  if (mesaIds === undefined) {
    return { ids: undefined, error: null };
  }
  if (!Array.isArray(mesaIds)) return { ids: [], error: 'La asignación de mesas no es válida' };
  const ids = [...new Set(mesaIds.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { ids: [], error: 'Selecciona mesas válidas' };
  if (ids.length && !roles?.includes('MESERO')) return { ids: [], error: 'Las mesas solo se pueden asignar a usuarios con rol MESERO' };
  if (!ids.length) return { ids, error: null };
  const mesas = await prisma.mesa.findMany({
    where: { id: { in: ids }, esFantasma: false },
    select: { id: true },
  });
  if (mesas.length !== ids.length) return { ids: [], error: 'Selecciona mesas existentes; Mesa 00 no se puede asignar' };
  return { ids, error: null };
}

async function reemplazarMesasAsignadas(tx, usuarioId, mesaIds) {
  if (mesaIds === undefined) return;
  await tx.mesa.updateMany({
    where: { usuarioAsignadoId: usuarioId, ...(mesaIds.length ? { id: { notIn: mesaIds } } : {}) },
    data: { usuarioAsignadoId: null },
  });
  if (mesaIds.length) {
    await tx.mesa.updateMany({ where: { id: { in: mesaIds }, esFantasma: false }, data: { usuarioAsignadoId: usuarioId } });
  }
}

router.post('/', soloAdmin, wrap(async (req, res) => {
  const { nombre, usuario, correo, password, roles, centrosOperacionCodigos, mesaIds } = req.body;
  const nombreNormalizado = normalizarMayusculas(nombre);
  const usuarioNormalizado = normalizarUsuario(usuario);
  const correoNormalizado = correo ? normalizarMayusculas(correo) : correo;
  if (!nombreNormalizado || !usuarioNormalizado || !password) {
    return res.status(400).json({ error: 'nombre, usuario y contraseña son requeridos' });
  }
  const errorPass = validarPassword(password);
  if (errorPass) return res.status(400).json({ error: errorPass });
  const validacionCentros = await validarCentrosOperacion(centrosOperacionCodigos, { obligatorio: true });
  if (validacionCentros.error) return res.status(400).json({ error: validacionCentros.error });
  const validacionMesas = await validarMesasAsignadas(mesaIds, roles);
  if (validacionMesas.error) return res.status(400).json({ error: validacionMesas.error });
  const existe = await prisma.usuario.findFirst({ where: { usuario: { equals: usuarioNormalizado, mode: 'insensitive' } } });
  if (existe) return res.status(409).json({ error: 'Ese usuario ya existe' });
  const creado = await prisma.$transaction(async (tx) => {
    const nuevoUsuario = await tx.usuario.create({
      data: { nombre: nombreNormalizado, usuario: usuarioNormalizado, correo: correoNormalizado || null, passwordHash: bcrypt.hashSync(password, 10) },
    });
    await asignarRoles(nuevoUsuario.id, roles, tx);
    await tx.usuarioCentroOperacion.createMany({
      data: validacionCentros.centros.map((centroOperacionCodigo) => ({ usuarioId: nuevoUsuario.id, centroOperacionCodigo })),
    });
    await reemplazarMesasAsignadas(tx, nuevoUsuario.id, validacionMesas.ids);
    return nuevoUsuario;
  });
  await auditar({ req, accion: 'CREAR', entidad: 'Usuario', entidadId: creado.id, detalle: usuarioNormalizado });
  res.status(201).json(sinHash(creado));
}));

router.put('/:id', soloAdmin, wrap(async (req, res) => {
  const id = req.params.id;
  const { nombre, usuario, correo, password, activo, roles, centrosOperacionCodigos, mesaIds } = req.body;
  const nombreNormalizado = nombre === undefined ? undefined : normalizarMayusculas(nombre);
  const usuarioNormalizado = usuario === undefined ? undefined : normalizarUsuario(usuario);
  const correoNormalizado = correo === undefined ? undefined : normalizarMayusculas(correo);
  if (usuarioNormalizado !== undefined) {
    const existe = await prisma.usuario.findFirst({
      where: { usuario: { equals: usuarioNormalizado, mode: 'insensitive' }, id: { not: id } },
    });
    if (existe) return res.status(409).json({ error: 'Ese usuario ya existe' });
  }
  const validacionCentros = centrosOperacionCodigos === undefined
    ? { centros: undefined, error: null }
    : await validarCentrosOperacion(centrosOperacionCodigos, { obligatorio: true });
  if (validacionCentros.error) return res.status(400).json({ error: validacionCentros.error });
  let rolesParaValidar = roles;
  if (mesaIds !== undefined && !Array.isArray(rolesParaValidar)) {
    const asignaciones = await prisma.usuarioRol.findMany({ where: { usuarioId: id }, include: { rol: { select: { nombre: true } } } });
    rolesParaValidar = asignaciones.map((asignacion) => asignacion.rol.nombre);
  }
  const validacionMesas = await validarMesasAsignadas(mesaIds, rolesParaValidar);
  if (validacionMesas.error) return res.status(400).json({ error: validacionMesas.error });
  if (password !== undefined && password !== '') {
    const errorPass = validarPassword(password);
    if (errorPass) return res.status(400).json({ error: errorPass });
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const usuarioActualizado = await tx.usuario.update({
      where: { id },
      data: {
        ...(nombreNormalizado !== undefined && { nombre: nombreNormalizado }),
        ...(usuarioNormalizado !== undefined && { usuario: usuarioNormalizado }),
        ...(correoNormalizado !== undefined && { correo: correoNormalizado }),
        ...(password !== undefined && password !== '' && { passwordHash: bcrypt.hashSync(password, 10) }),
        ...(activo !== undefined && { activo }),
      },
    });
    if (Array.isArray(roles)) {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await asignarRoles(id, roles, tx);
    }
    if (validacionCentros.centros) {
      await tx.usuarioCentroOperacion.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioCentroOperacion.createMany({
        data: validacionCentros.centros.map((centroOperacionCodigo) => ({ usuarioId: id, centroOperacionCodigo })),
      });
    }
    if (activo === false || (Array.isArray(roles) && !roles.includes('MESERO') && mesaIds === undefined)) {
      await reemplazarMesasAsignadas(tx, id, []);
    } else {
      await reemplazarMesasAsignadas(tx, id, validacionMesas.ids);
    }
    return usuarioActualizado;
  });
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
async function asignarRoles(usuarioId, nombresRol, db = prisma) {
  if (!Array.isArray(nombresRol) || nombresRol.length === 0) return;
  const roles = await db.rol.findMany({ where: { nombre: { in: nombresRol } } });
  if (roles.length === 0) return;
  await db.usuarioRol.createMany({
    data: roles.map((r) => ({ usuarioId, rolId: r.id })),
    skipDuplicates: true,
  });
}

export default router;
