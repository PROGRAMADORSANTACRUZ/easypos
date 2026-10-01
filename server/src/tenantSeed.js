// Roles y permisos base para un restaurante recien creado (mismo catalogo que prisma/seed.js).
// Se reutiliza tanto en el seed original como en el aprovisionamiento de nuevos restaurantes.
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
  companias: ['ver', 'crear', 'editar', 'eliminar'],
  centros_operaciones: ['ver', 'editar'],
  empresa: ['ver', 'editar'],
  sucursales: ['ver', 'crear', 'editar', 'eliminar'],
  listas_precios: ['ver', 'crear', 'editar', 'eliminar'],
  promociones: ['ver', 'crear', 'editar', 'eliminar'],
  comisiones: ['ver', 'crear', 'editar', 'eliminar'],
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

// Crea todos los permisos + el rol ADMIN (acceso total) en la base del restaurante dado.
// Devuelve el id del rol ADMIN.
export async function sembrarRolesYPermisos(prismaTenant) {
  const permisosPorCodigo = {};
  for (const [modulo, acciones] of Object.entries(MODULOS)) {
    for (const accion of acciones) {
      const codigo = `${modulo}.${accion}`;
      const permiso = await prismaTenant.permiso.upsert({
        where: { codigo },
        update: { nombre: codigo, modulo },
        create: { codigo, nombre: codigo, modulo },
      });
      permisosPorCodigo[codigo] = permiso.id;
    }
  }
  const todosLosCodigos = Object.keys(permisosPorCodigo);

  const rol = await prismaTenant.rol.upsert({
    where: { nombre: 'ADMIN' },
    update: { descripcion: 'Acceso total' },
    create: { nombre: 'ADMIN', descripcion: 'Acceso total' },
  });
  for (const codigo of todosLosCodigos) {
    await prismaTenant.rolPermiso.upsert({
      where: { rolId_permisoId: { rolId: rol.id, permisoId: permisosPorCodigo[codigo] } },
      update: {},
      create: { rolId: rol.id, permisoId: permisosPorCodigo[codigo] },
    });
  }
  return rol.id;
}
