// Resuelve el restaurante (tenant) de cada request a partir del header `x-tenant-id`
// (id o slug) y ejecuta el resto del request con el cliente Prisma de esa base de datos.
// Si no viene el header, el request sigue con el cliente por defecto (compatibilidad).
import { platformPrisma } from '../platformPrisma.js';
import { getTenantPrisma } from '../tenantManager.js';
import { tenantStorage } from '../prisma.js';

export async function resolverTenant(req, res, next) {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) return next();

  try {
    const restaurante = await platformPrisma.restaurante.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    });
    if (!restaurante) return res.status(400).json({ error: 'Restaurante no reconocido' });
    if (restaurante.estado !== 'ACTIVO') {
      return res.status(403).json({ error: 'Este restaurante está suspendido' });
    }

    req.tenant = restaurante;
    const tenantPrisma = getTenantPrisma(restaurante.dbUrl);
    tenantStorage.run(tenantPrisma, () => next());
  } catch (e) {
    next(e);
  }
}
