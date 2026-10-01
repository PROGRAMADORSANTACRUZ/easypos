// Borra TODOS los productos, kits, insumos de inventario y todo lo que los referencia
// (pedidos, facturas, notas, compras, cortesias, facturas de venta, listas de precio),
// dejando el catalogo en cero para cargarlo de nuevo desde la interfaz.
// Uso: node scripts/limpiar-productos-inventario.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Borrando historial y catalogo de productos/inventario...');

  await prisma.$transaction([
    // Documentos que cuelgan de una factura
    prisma.pago.deleteMany(),
    prisma.comisionVendedor.deleteMany(),
    prisma.eventoDIAN.deleteMany(),
    prisma.abono.deleteMany(),
    prisma.notaCredito.deleteMany(),
    prisma.notaDebito.deleteMany(),
    prisma.retencionFactura.deleteMany(),
    prisma.facturaVentaDetalle.deleteMany(),
    prisma.facturaVenta.deleteMany(),
    prisma.facturaDetalle.deleteMany(),
    prisma.factura.deleteMany(),

    // Pedidos (mesa y domicilio)
    prisma.pedidoItem.deleteMany(),
    prisma.pedido.deleteMany(),

    // Cortesias
    prisma.cortesiaDetalle.deleteMany(),
    prisma.cortesia.deleteMany(),

    // Compras a proveedores
    prisma.compraDetalle.deleteMany(),
    prisma.compra.deleteMany(),

    // Catalogo: listas de precio, recetas, existencias y movimientos
    prisma.productoListaPrecio.deleteMany(),
    prisma.kitComponente.deleteMany(),
    prisma.movimientoInventario.deleteMany(),
    prisma.inventario.deleteMany(),

    // Productos e insumos
    prisma.producto.deleteMany(),
    prisma.inventarioItem.deleteMany(),

    // Categorias (sin productos que las usen)
    prisma.categoria.deleteMany(),
  ]);

  console.log('Listo: productos, insumos y su historial quedaron en cero.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
