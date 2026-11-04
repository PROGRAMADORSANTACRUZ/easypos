// Cliente Prisma "consciente del restaurante": cada request queda asociado a la base
// de datos de su restaurante (tenant) mediante AsyncLocalStorage. El resto del codigo
// (todas las rutas que hacen `import { prisma } from '../prisma.js'`) sigue igual: al
// usar `prisma.algo(...)` se reenvia automaticamente al cliente del restaurante activo.
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { crearAdaptadorFacturas } from './facturasPersistencia.js';

// Cliente por defecto (compatibilidad con scripts/seed y requests sin restaurante resuelto)
const prismaPorDefecto = new PrismaClient();
const adaptarFacturas = crearAdaptadorFacturas(Prisma.dmmf.datamodel.models);
const clientesAdaptados = new WeakMap();

export const tenantStorage = new AsyncLocalStorage();

function clienteActivo() {
  const cliente = tenantStorage.getStore() || prismaPorDefecto;
  if (!clientesAdaptados.has(cliente)) clientesAdaptados.set(cliente, adaptarFacturas(cliente));
  return clientesAdaptados.get(cliente);
}

export const prisma = new Proxy(prismaPorDefecto, {
  get(_target, prop) {
    const cliente = clienteActivo();
    const valor = cliente[prop];
    return typeof valor === 'function' ? valor.bind(cliente) : valor;
  },
});

