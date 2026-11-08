const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

export const calcularPropinaSugerida = (totalCuenta) => Math.round((Number(totalCuenta) || 0) * 0.1);

export function calcularTotalesPedido(items = [], electronica = true) {
  const precioProductos = redondear(items.reduce((suma, item) =>
    suma + (Number(item.precioUnit) || 0) * (Number(item.cantidad) || 0), 0));
  const impuesto = redondear(items.reduce((suma, item) => {
    const bruto = (Number(item.precioUnit) || 0) * (Number(item.cantidad) || 0);
    const porcentaje = Number(item.producto?.iva) || 0;
    return suma + redondear(bruto * porcentaje / 100);
  }, 0));
  const subtotal = redondear(precioProductos - impuesto);
  const total = precioProductos;
  return { subtotal, impuesto, total };
}