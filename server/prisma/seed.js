import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Sembrando datos de Asados Santacruz...');

  // Limpiar (orden por dependencias)
  await prisma.factura.deleteMany();
  await prisma.pedidoItem.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.kitComponente.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.inventarioItem.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.mesa.deleteMany();
  await prisma.mesera.deleteMany();

  // Reiniciar numeracion de pedidos para que empiecen en #1 (las facturas usan UUID)
  for (const seq of ['Pedido_id_seq', 'PedidoItem_id_seq']) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${seq}" RESTART WITH 1`);
  }

  // Meseras
  await prisma.mesera.createMany({
    data: [
      { nombre: 'Ana Gomez', codigo: '1' },
      { nombre: 'Luisa Perez', codigo: '2' },
      { nombre: 'Carla Diaz', codigo: '3' },
    ],
  });

  // Usuario administrador por defecto (para iniciar sesión)
  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      nombre: 'Administrador',
      usuario: 'admin',
      correo: 'admin@easypos.local',
      passwordHash: bcrypt.hashSync('admin123', 10),
    },
  });

  // Mesas
  await prisma.mesa.createMany({
    data: Array.from({ length: 45 }, (_, i) => ({ numero: i + 1, capacidad: i % 2 === 0 ? 4 : 2 })),
  });

  // Categorias
  const cat = {};
  for (const nombre of ['Bebidas', "Pa' picar", 'Especialidades', 'Al barril', 'Combos', 'Picadas']) {
    cat[nombre] = (await prisma.categoria.create({ data: { nombre } })).id;
  }

  // Insumos de inventario. Carnes y queso en gramos; el resto por unidad/porcion.
  const ins = {};
  const nuevoInsumo = async (nombre, unidad, costo, stock, stockMinimo) => {
    ins[nombre] = (await prisma.inventarioItem.create({ data: { nombre, unidad, costo, stock, stockMinimo } })).id;
  };

  await nuevoInsumo('Bollo', 'unidad', 1100, 300, 40);
  await nuevoInsumo('Chorizo', 'unidad', 1950, 120, 20);
  await nuevoInsumo('Morcilla', 'unidad', 1400, 60, 10);
  await nuevoInsumo('Chicharrón', 'gramo', 26, 30000, 3000);
  await nuevoInsumo('Costilla', 'gramo', 26, 30000, 3000);
  await nuevoInsumo('Bondiola', 'gramo', 26, 30000, 3000);
  await nuevoInsumo('Queso', 'gramo', 22, 5000, 500);
  await nuevoInsumo('Papachango', 'porción', 500, 100, 20);
  await nuevoInsumo('Maíz', 'porción', 500, 100, 20);
  await nuevoInsumo('Verduras', 'porción', 0, 100, 20);
  await nuevoInsumo('Platanito', 'porción', 0, 100, 20);
  await nuevoInsumo('Jugo de maracuyá (insumo)', 'porción', 2000, 100, 20);
  await nuevoInsumo('Jugo (compra)', 'porción', 2000, 100, 20);
  await nuevoInsumo('Agua embotellada', 'unidad', 650, 100, 20);
  await nuevoInsumo('Coca-Cola personal', 'unidad', 2500, 100, 20);
  await nuevoInsumo('Gaseosa 1.5 L', 'unidad', 5417, 50, 10);

  // Helper para crear producto (kit) con su receta
  const crear = (nombre, precio, categoria, receta = []) =>
    prisma.producto.create({
      data: {
        nombre,
        precio,
        categoriaId: cat[categoria],
        esKit: receta.length > 0,
        componentes: { create: receta.map(([nombreInsumo, cantidad]) => ({ itemId: ins[nombreInsumo], cantidad })) },
      },
    });

  // --- Bebidas ---
  await crear('Jugo de maracuyá', 4000, 'Bebidas', [['Jugo de maracuyá (insumo)', 1]]);
  await crear('Jugo de corozo', 4000, 'Bebidas', [['Jugo (compra)', 1]]);
  await crear('Jugo litro', 8000, 'Bebidas', [['Jugo (compra)', 2]]);
  await crear('Agua', 3000, 'Bebidas', [['Agua embotellada', 1]]);
  await crear('Coca personal', 5000, 'Bebidas', [['Coca-Cola personal', 1]]);
  await crear('Gaseosa 1,5 L', 10000, 'Bebidas', [['Gaseosa 1.5 L', 1]]);

  // --- Pa' picar ---
  await crear('Chorizo', 6000, "Pa' picar", [['Chorizo', 1], ['Bollo', 1]]);
  await crear('Morcilla', 4000, "Pa' picar", [['Morcilla', 1], ['Bollo', 1]]);
  await crear('Porción de bollo', 2000, "Pa' picar", [['Bollo', 1]]);

  // --- Especialidades ---
  await crear('Ceviche de chicharrón', 20000, 'Especialidades', [
    ['Chicharrón', 190], ['Verduras', 1], ['Platanito', 1],
  ]);
  await crear('Desgranado Santacruz', 20000, 'Especialidades', [
    ['Chorizo', 1], ['Bollo', 1], ['Queso', 60], ['Papachango', 1], ['Maíz', 1], ['Bondiola', 100],
  ]);

  // --- Al barril ---
  await crear('Chicharrón', 17000, 'Al barril', [['Chicharrón', 200], ['Bollo', 1]]);
  await crear('Costilla', 17000, 'Al barril', [['Costilla', 200], ['Bollo', 1]]);
  await crear('Bondiola', 17000, 'Al barril', [['Bondiola', 200], ['Bollo', 1]]);

  // --- Combos ---
  await crear('Chicharrón + Chorizo', 23000, 'Combos', [['Chicharrón', 200], ['Chorizo', 1], ['Bollo', 1]]);
  await crear('Costilla + Chorizo', 23000, 'Combos', [['Costilla', 200], ['Chorizo', 1], ['Bollo', 1]]);
  await crear('Bondiola + Chorizo', 23000, 'Combos', [['Bondiola', 200], ['Chorizo', 1], ['Bollo', 1]]);

  // --- Picadas --- (las opciones "bondiola o costilla" se asignan por defecto; ajustables en la app)
  await crear('Picada para 2 personas', 40000, 'Picadas', [
    ['Chicharrón', 180], ['Bondiola', 180], ['Bollo', 2], ['Chorizo', 1],
  ]);
  await crear('Picada para 4 personas', 60000, 'Picadas', [
    ['Chicharrón', 200], ['Bondiola', 200], ['Costilla', 200], ['Bollo', 2], ['Chorizo', 1],
  ]);
  await crear('Picada familiar', 75000, 'Picadas', [
    ['Chicharrón', 200], ['Bondiola', 200], ['Costilla', 200], ['Bollo', 3], ['Chorizo', 2], ['Morcilla', 1],
  ]);

  console.log('Menú de Asados Santacruz cargado con éxito.');

  await sembrarRolesYPermisos();
}

// Roles, permisos y sus asignaciones (RBAC). Idempotente.
async function sembrarRolesYPermisos() {
  console.log('Configurando roles y permisos...');

  // Modulos del sistema y las acciones que soportan
  const MODULOS = {
    pedidos: ['ver', 'crear', 'editar', 'eliminar'],
    mesas: ['ver', 'crear', 'editar', 'eliminar'],
    cocina: ['ver'],
    facturas: ['ver', 'crear', 'anular'],
    factura_venta: ['ver', 'crear'],
    cortesias: ['ver', 'crear'],
    notas_credito: ['ver', 'crear', 'editar', 'eliminar'],
    notas_debito: ['ver', 'crear', 'editar', 'eliminar'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    compras: ['ver', 'crear', 'editar', 'eliminar'],
    proveedores: ['ver', 'crear', 'editar', 'eliminar'],
    cuentas: ['ver', 'abonar'],
    productos: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver', 'crear', 'editar', 'eliminar'],
    bodegas: ['ver', 'crear', 'editar', 'eliminar'],
    movimientos: ['ver', 'crear', 'editar', 'eliminar'],
    caja: ['ver', 'crear', 'editar', 'eliminar', 'abrir', 'cerrar'],
    resoluciones: ['ver', 'crear', 'editar', 'eliminar'],
    clientes: ['ver', 'crear', 'editar', 'eliminar'],
    empresa: ['ver', 'editar'],
    sucursales: ['ver', 'crear', 'editar', 'eliminar'],
    listas_precios: ['ver', 'crear', 'editar', 'eliminar'],
    promociones: ['ver', 'crear', 'editar', 'eliminar'],
    comisiones: ['ver', 'crear', 'editar', 'eliminar'],
    factura_venta: ['ver', 'crear'],
    remisiones: ['ver', 'crear', 'editar', 'eliminar'],
    metodos_pago: ['ver', 'crear', 'editar', 'eliminar'],
    pagos: ['ver', 'crear', 'editar', 'eliminar'],
    terceros: ['ver', 'crear', 'editar', 'eliminar'],
    centros_costo: ['ver', 'crear', 'editar', 'eliminar'],
    cuentas_contables: ['ver', 'crear', 'editar', 'eliminar'],
    impuestos: ['ver', 'crear', 'editar', 'eliminar'],
    unidades_medida: ['ver', 'crear', 'editar', 'eliminar'],
    eventos_dian: ['ver', 'crear', 'editar', 'eliminar'],
    logs_integraciones: ['ver', 'eliminar'],
    reportes: ['ver'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar'],
    roles: ['ver', 'crear', 'editar', 'eliminar'],
    auditoria: ['ver'],
  };

  // Crear todos los permisos
  const permisosPorCodigo = {};
  for (const [modulo, acciones] of Object.entries(MODULOS)) {
    for (const accion of acciones) {
      const codigo = `${modulo}.${accion}`;
      const permiso = await prisma.permiso.upsert({
        where: { codigo },
        update: { nombre: codigo, modulo },
        create: { codigo, nombre: codigo, modulo },
      });
      permisosPorCodigo[codigo] = permiso.id;
    }
  }

  const todosLosCodigos = Object.keys(permisosPorCodigo);

  // Roles base y los codigos de permiso que reciben
  const ROLES = {
    ADMIN: { descripcion: 'Acceso total', permisos: todosLosCodigos },
    CAJERO: {
      descripcion: 'Ventas, caja y consultas',
      permisos: todosLosCodigos.filter((c) =>
        /^(pedidos|mesas|cocina|factura_venta|cuentas|clientes)\./.test(c) ||
        ['productos.ver', 'inventario.ver', 'bodegas.ver', 'movimientos.ver', 'movimientos.crear', 'caja.ver', 'caja.abrir', 'caja.cerrar', 'reportes.ver', 'notas_credito.ver', 'notas_credito.crear', 'notas_debito.ver', 'notas_debito.crear', 'retenciones.ver', 'retenciones.crear', 'compras.ver', 'compras.crear', 'proveedores.ver'].includes(c)
      ),
    },
    MESERO: {
      descripcion: 'Toma de pedidos por mesa',
      permisos: ['pedidos.ver', 'pedidos.crear', 'pedidos.editar', 'mesas.ver', 'mesas.editar', 'cocina.ver'],
    },
  };

  for (const [nombre, def] of Object.entries(ROLES)) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      update: { descripcion: def.descripcion },
      create: { nombre, descripcion: def.descripcion },
    });
    for (const codigo of def.permisos) {
      const permisoId = permisosPorCodigo[codigo];
      if (!permisoId) continue;
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rol.id, permisoId } },
        update: {},
        create: { rolId: rol.id, permisoId },
      });
    }
  }

  // Asignar el rol ADMIN al usuario admin
  const admin = await prisma.usuario.findUnique({ where: { usuario: 'admin' } });
  const rolAdmin = await prisma.rol.findUnique({ where: { nombre: 'ADMIN' } });
  if (admin && rolAdmin) {
    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: admin.id, rolId: rolAdmin.id } },
      update: {},
      create: { usuarioId: admin.id, rolId: rolAdmin.id },
    });
  }

  console.log('Roles y permisos configurados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
