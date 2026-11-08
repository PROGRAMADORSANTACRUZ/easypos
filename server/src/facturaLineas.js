export const CODIGO_PRODUCTO_PROPINA = String(process.env.CODIGO_PRODUCTO_PROPINA || '0000').trim() || '0000';

export function crearLineaPropina(valor) {
  const importe = Math.round((Number(valor) || 0) * 100) / 100;
  if (importe <= 0) return null;
  return {
    productoId: null,
    productoCodigo: CODIGO_PRODUCTO_PROPINA,
    productoNombre: 'Propina',
    cantidad: 1,
    unidad: 'UND',
    precioUnitario: importe,
    iva: 0,
    total: importe,
  };
}