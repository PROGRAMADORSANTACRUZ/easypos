// Autenticacion basada en JWT + autorizacion basica por modulo/permiso.
//
// Flujo:
// 1) POST /api/usuarios/login valida usuario/contrasena y firma un token con
//    firmarToken(usuario) que incluye el id, usuario, roles y permisos efectivos.
// 2) El cliente guarda el token y lo envia en cada request como
//    "Authorization: Bearer <token>".
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
  const habilitados = roles.includes('ADMIN') ? MODULOS_FACTURACION : asignados;
  return [...new Set([
    ...permisosRol.filter((codigo) => !MODULOS_FACTURACION.some((modulo) => codigo.startsWith(`${modulo}.`)) || habilitados.some((modulo) => codigo.startsWith(`${modulo}.`))),
    ...habilitados.flatMap((modulo) => [`${modulo}.ver`, `${modulo}.crear`]),
  ])];
}

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

if (!SECRET) {
  // Sin secreto no hay forma segura de firmar/verificar tokens: mejor fallar rapido al arrancar.
  throw new Error('Falta configurar JWT_SECRET en server/.env');
}

// Firma un token de sesion a partir del usuario ya autenticado (con roles/permisos resueltos).
export function firmarToken(usuario) {
  const payload = {
    sub: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    roles: usuario.roles || [],
    permisos: usuario.permisos || [],
  };
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

// Exige un token valido en el header Authorization. Adjunta req.usuario si es correcto.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.usuario = {
      id: payload.sub,
      usuario: payload.usuario,
      nombre: payload.nombre,
      roles: payload.roles || [],
      permisos: payload.permisos || [],
    };
    // Compat: auditoria.js sigue leyendo x-usuario-id; si el cliente no lo envia,
    // se completa con el id del token verificado (mas confiable que un header libre).
    if (!req.headers['x-usuario-id']) req.headers['x-usuario-id'] = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
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
        select: { activo: true, modulosFacturacion: true, roles: { include: { rol: true } } },
      });
      if (!usuario?.activo || (!usuario.roles.some((ur) => ur.rol.nombre === 'ADMIN') && !usuario.modulosFacturacion.includes(modulo))) {
        return res.status(403).json({ error: 'No tienes acceso a este módulo' });
      }
      return permisoPorMetodo(modulo)(req, res, next);
    } catch (error) { return next(error); }
  };
}

export async function permisoSegunFactura(req, res, next) {
  try {
    let modulo = 'facturas';
    if (req.query.electronica === 'false' || ((req.path === '/directa' || req.path === '/') && req.body?.electronica === false)) {
      modulo = 'factura_venta';
    } else if (req.method === 'GET' && /^\/[0-9a-f-]{36}$/.test(req.path)) {
      const factura = await prisma.factura.findUnique({ where: { id: req.path.slice(1) }, select: { estadoDIAN: true } });
      if (factura?.estadoDIAN === 'NO_APLICA') modulo = 'factura_venta';
    }
    return permisoModuloFacturacion(modulo)(req, res, next);
  } catch (error) { return next(error); }
}
