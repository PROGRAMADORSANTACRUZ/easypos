import { prisma } from './prisma.js';

// Registra una accion en la bitacora de auditoria. No lanza errores para no
// interrumpir la operacion principal si el log falla.
export async function auditar({ req, usuarioId, accion, entidad, entidadId, detalle }) {
  try {
    const ip =
      req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req?.socket?.remoteAddress ||
      null;
    const uid =
      usuarioId ??
      (req?.headers?.['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null);
    await prisma.auditoria.create({
      data: {
        usuarioId: uid || null,
        accion,
        entidad: entidad ?? null,
        entidadId: entidadId != null ? String(entidadId) : null,
        detalle: detalle ?? null,
        ip,
      },
    });
  } catch (e) {
    console.error('No se pudo registrar auditoria:', e.message);
  }
}
