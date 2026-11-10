import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

function cantidadFaltante(objetivo, actual) {
  const diferencia = Math.max(0, objetivo - actual);
  return diferencia < 1e-9 ? 0 : diferencia;
}

export function planificarPruebas({ productos, insumos, existencias, existenciasInsumos, componentes, bodegaId }) {
  const ordenados = [...productos].sort((primero, segundo) =>
    `${primero.codigo || ''}:${primero.id}`.localeCompare(`${segundo.codigo || ''}:${segundo.id}`, 'en'));
  const precios = ordenados.map((producto, indice) => ({
    id: producto.id,
    precio: 10000 + Math.round(indice * 140 / Math.max(1, ordenados.length - 1)) * 1000,
  }));
  const entradasProductos = ordenados.map((producto) => {
    const filas = existencias.filter((fila) => fila.productoId === producto.id && fila.bodegaId === bodegaId);
    const actual = filas.reduce((suma, fila) => suma + fila.cantidad, 0);
    return { productoId: producto.id, existenciaId: filas[0]?.id, cantidad: cantidadFaltante(100, actual) };
  }).filter((entrada) => entrada.cantidad > 0);
  const requeridos = new Map(insumos.map((insumo) => [insumo.id, 100]));
  for (const componente of componentes) {
    if (!Number.isFinite(componente.cantidad) || componente.cantidad < 0) throw new Error('Receta con cantidad no valida');
    requeridos.set(componente.itemId, (requeridos.get(componente.itemId) || 100) + componente.cantidad * 100);
  }
  const entradasInsumos = insumos.map((insumo) => {
    const actual = existenciasInsumos.find((fila) => fila.itemId === insumo.id && fila.bodegaId === bodegaId)?.stock || 0;
    return { itemId: insumo.id, cantidad: cantidadFaltante(requeridos.get(insumo.id), actual) };
  }).filter((entrada) => entrada.cantidad > 0);
  return { precios, entradasProductos, entradasInsumos };
}

export async function prepararPruebas(prisma, { aplicar = false, respaldo } = {}) {
  if (aplicar && !respaldo) throw new Error('Indica --respaldo=RUTA antes de aplicar');
  return prisma.$transaction(async (tx) => {
    if (aplicar) {
      await tx.$executeRawUnsafe('LOCK TABLE "Producto", "ProductoListaPrecio", "Inventario", "InventarioItem", "InventarioItemsBodegas", "KitComponente", "MovimientoInventario", "Bodega" IN SHARE ROW EXCLUSIVE MODE');
    }
    const bodega = await tx.bodega.findFirst({
      where: { nombre: { equals: 'Compras', mode: 'insensitive' } },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    if (!bodega) throw new Error('No existe la bodega Compras; no se modifico ningun dato');
    const [productos, preciosLista, existencias, insumos, existenciasInsumos, componentes] = await Promise.all([
      tx.producto.findMany({ select: { id: true, codigo: true, nombre: true, precio: true } }),
      tx.productoListaPrecio.findMany(),
      tx.inventario.findMany(),
      tx.inventarioItem.findMany({ select: { id: true, nombre: true, stock: true } }),
      tx.inventarioItemBodega.findMany(),
      tx.kitComponente.findMany(),
    ]);
    const estado = { fecha: new Date().toISOString(), bodega, productos, preciosLista, existencias, insumos, existenciasInsumos, componentes };
    const plan = planificarPruebas({ ...estado, bodegaId: bodega.id });
    const resumen = {
      aplicado: aplicar, productos: productos.length, preciosLista: preciosLista.length,
      precioMinimo: plan.precios.length ? Math.min(...plan.precios.map((fila) => fila.precio)) : null,
      precioMaximo: plan.precios.length ? Math.max(...plan.precios.map((fila) => fila.precio)) : null,
      entradasProductos: plan.entradasProductos.length, entradasInsumos: plan.entradasInsumos.length,
    };
    if (!aplicar) return resumen;
    const contenido = JSON.stringify({ version: 1, estado, plan }, null, 2);
    await mkdir(dirname(resolve(respaldo)), { recursive: true });
    await writeFile(respaldo, contenido, { flag: 'wx', mode: 0o600 });
    const referencia = `PRUEBAS-${Date.now()}`;
    for (const producto of plan.precios) {
      await tx.producto.update({ where: { id: producto.id }, data: { precio: producto.precio } });
      await tx.productoListaPrecio.updateMany({ where: { productoId: producto.id }, data: { precio: producto.precio } });
    }
    for (const entrada of plan.entradasProductos) {
      if (entrada.existenciaId) {
        await tx.inventario.update({ where: { id: entrada.existenciaId }, data: { cantidad: { increment: entrada.cantidad } } });
      } else {
        await tx.inventario.create({ data: { productoId: entrada.productoId, bodegaId: bodega.id, cantidad: entrada.cantidad } });
      }
      await tx.movimientoInventario.create({ data: {
        productoId: entrada.productoId, bodegaId: bodega.id, cantidad: entrada.cantidad,
        tipoMovimiento: 'ENTRADA', documentoReferencia: referencia,
      } });
    }
    for (const entrada of plan.entradasInsumos) {
      await tx.inventarioItemBodega.upsert({
        where: { itemId_bodegaId: { itemId: entrada.itemId, bodegaId: bodega.id } },
        create: { itemId: entrada.itemId, bodegaId: bodega.id, stock: entrada.cantidad },
        update: { stock: { increment: entrada.cantidad } },
      });
      await tx.inventarioItem.update({ where: { id: entrada.itemId }, data: { stock: { increment: entrada.cantidad } } });
      await tx.movimientoInventario.create({ data: {
        itemId: entrada.itemId, bodegaId: bodega.id, cantidad: entrada.cantidad,
        tipoMovimiento: 'ENTRADA', documentoReferencia: referencia,
      } });
    }
    const despues = {
      productos: await tx.producto.findMany({ select: { id: true, codigo: true, precio: true } }),
      insumos: await tx.inventarioItem.findMany({ select: { id: true, stock: true } }),
      existencias: await tx.inventario.findMany(),
      existenciasInsumos: await tx.inventarioItemBodega.findMany(), componentes, bodegaId: bodega.id,
    };
    const pendiente = planificarPruebas(despues);
    if (pendiente.entradasProductos.length || pendiente.entradasInsumos.length || despues.productos.some((producto) =>
      producto.precio !== plan.precios.find((fila) => fila.id === producto.id)?.precio)) {
      throw new Error('La verificacion no coincide; se revierte la transaccion');
    }
    if (await tx.productoListaPrecio.count({ where: { OR: [{ precio: { lt: 10000 } }, { precio: { gt: 150000 } }] } })) {
      throw new Error('Precios de lista fuera de rango; se revierte la transaccion');
    }
    return { ...resumen, referencia, respaldo, sha256: createHash('sha256').update(contenido).digest('hex') };
  }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 15000 });
}

async function main() {
  await import('dotenv/config');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerida');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await prepararPruebas(prisma, {
      aplicar: process.argv.includes('--aplicar'),
      respaldo: process.argv.find((argumento) => argumento.startsWith('--respaldo='))?.slice('--respaldo='.length),
    }), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[conexion omitida]'));
    process.exitCode = 1;
  });
}