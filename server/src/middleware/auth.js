// Autenticacion basada en JWT + autorizacion basica por modulo/permiso.
//
// Flujo:
// 1) POST /api/usuarios/login valida usuario/contrasena y firma un token con
//    firmarToken(usuario) que incluye el id, usuario, roles y permisos efectivos.
// 2) El servidor lo guarda en una cookie HttpOnly; el cliente no puede leerlo.
// 3) requireAuth valida el token, lo decodifica y expone req.usuario con
//    { id, usuario, roles, permisos }. Si no hay token valido, responde 401.
// 4) permisoPorMetodo(modulo) es una autorizacion basica: exige el permiso
//    "<modulo>.ver" para GET y, para escrituras (POST/PUT/PATCH/DELETE),
//    exige que el usuario tenga al menos un permiso de escritura en ese modulo
//    (cualquier codigo "<modulo>.<accion>" distinto de "ver"). No distingue
//    la accion exacta (crear/editar/eliminar/etc.), pero evita que un usuario
//    de solo lectura pueda modificar datos y bloquea el acceso anonimo.
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';

export const MODULOS_FACTURACION = ['facturas', 'factura_venta', 'cortesias'];

export function permisosEfectivos(roles, asignados, permisosRol) {
  const individuales = roles.includes('ADMIN') ? MODULOS_FACTURACION : asignados;
  return [...new Set([
    ...permisosRol,
    ...individuales.flatMap((modulo) => [`${modulo}.ver`, `${modulo}.crear`]),
  ])];
}

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const COOKIE_NAME = 'easypos_session';

if (!SECRET) {
  // Sin secreto no hay forma segura de firmar/verificar tokens: mejor fallar rapido al arrancar.
  throw new Error('Falta configurar JWT_SECRET en server/.env');
}

// Firma un token de sesion a partir del usuario ya autenticado (con roles/permisos resueltos).
export function firmarToken(usuario, { restauranteId } = {}) {
  const payload = {
    sub: usuario.id,
    ...(restauranteId && { restauranteId }),
  };
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function tokenDeCookie(req) {
  const cookie = req.headers.cookie?.split(';').map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  try { return decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)); } catch { return null; }
}

function opcionesCookie(req) {
  const protoProxy = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || req.secure || protoProxy === 'https',
    sameSite: 'lax',
    path: '/api',
  };
}

export function establecerCookieSesion(req, res, token) {
  const expira = jwt.decode(token)?.exp;
  const maxAge = expira ? Math.max(0, expira * 1000 - Date.now()) : 12 * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, token, { ...opcionesCookie(req), maxAge });
}

export function limpiarCookieSesion(req, res) {
  res.clearCookie(COOKIE_NAME, opcionesCookie(req));
}

export function leerPayloadSesion(req) {
  const header = req.headers.authorization || '';
  const token = tokenDeCookie(req) || (header.startsWith('Bearer ') ? header.slice(7).trim() : null);
  if (!token) return null;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

// Exige un token valido y carga los permisos vigentes desde la base de datos.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = tokenDeCookie(req) || (header.startsWith('Bearer ') ? header.slice(7).trim() : null);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    res.clearCookie(COOKIE_NAME, opcionesCookie(req));
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  return prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      usuario: true,
      nombre: true,
      activo: true,
      modulosFacturacion: true,
      roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      centrosOperacion: {
        include: {
          centroOperacion: {
            select: {
              codigo: true,
              descripcion: true,
              estado: true,
              companiaCodigo: true,
              compania: { select: { razonSocial: true } },
            },
          },
        },
      },
    },
  }).then((usuario) => {
    if (!usuario?.activo) {
      res.clearCookie(COOKIE_NAME, opcionesCookie(req));
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }
    const roles = usuario.roles.map((asignacion) => asignacion.rol.nombre);
    const permisos = permisosEfectivos(
      roles,
      usuario.modulosFacturacion,
      usuario.roles.flatMap((asignacion) => asignacion.rol.permisos.map((rolPermiso) => rolPermiso.permiso.codigo)),
    );
    req.usuario = {
      id: usuario.id,
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      roles,
      permisos,
      centrosOperacion: usuario.centrosOperacion.map(({ centroOperacion }) => centroOperacion),
    };
    if (!req.headers['x-usuario-id']) req.headers['x-usuario-id'] = usuario.id;
    next();
  }).catch(next);
}

// Autorizacion basica por modulo: GET exige "<modulo>.ver"; escrituras exigen
// cualquier permiso de escritura del modulo. Debe usarse siempre despues de requireAuth.
export function permisoPorMetodo(modulo) {
  return (req, res, next) => {
    const permisos = req.usuario?.permisos || [];
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (permisos.includes(`${modulo}.ver`)) return next();
    } else {
      const tieneEscritura = permisos.some((p) => p.startsWith(`${modulo}.`) && p !== `${modulo}.ver`);
      if (tieneEscritura) return next();
    }
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  };
}

export function permisoModuloFacturacion(modulo) {
  return async (req, res, next) => {
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { id: req.usuario.id },
        select: { activo: true, modulosFacturacion: true, roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } } },
      });
      if (!usuario?.activo) {
        return res.status(403).json({ error: 'No tienes acceso a este módulo' });
      }
      req.usuario.permisos = permisosEfectivos(
        usuario.roles.map((ur) => ur.rol.nombre),
        usuario.modulosFacturacion,
        usuario.roles.flatMap((ur) => ur.rol.permisos.map((rp) => rp.permiso.codigo)),
      );
      return permisoPorMetodo(modulo)(req, res, next);
    } catch (error) { return next(error); }
  };
}

export async function permisoSegunFactura(req, res, next) {
  try {
    let modulo = 'facturas';
    if (req.query.electronica === 'false' || ((req.path === '/directa' || req.path === '/dividir' || req.path === '/') && req.body?.electronica === false)) {
      modulo = 'factura_venta';
    } else if (req.method === 'GET' && /^\/[0-9a-f-]{36}$/.test(req.path)) {
      const id = req.path.slice(1);
      const factura = await prisma.factura.findUnique({ where: { id }, select: { estadoDIAN: true } });
      const venta = factura ? null : await prisma.facturaVenta.findUnique({ where: { id }, select: { estadoDIAN: true } });
      if (factura?.estadoDIAN === 'NO_APLICA' || venta?.estadoDIAN === 'NO_APLICA') modulo = 'factura_venta';
    }
    return permisoModuloFacturacion(modulo)(req, res, next);
  } catch (error) { return next(error); }
}
