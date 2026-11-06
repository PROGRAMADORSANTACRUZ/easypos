const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

export function calcularTotalesPedido(items = [], electronica = true) {
  const precioProductos = redondear(items.reduce((suma, item) =>
    suma + (Number(item.precioUnit) || 0) * (Number(item.cantidad) || 0), 0));
  const impuesto = redondear(items.reduce((suma, item) => {
    const bruto = (Number(item.precioUnit) || 0) * (Number(item.cantidad) || 0);
    const porcentaje = Number(item.producto?.iva) || 0;
    return suma + redondear(bruto * porcentaje / (electronica ? 100 : 100 + porcentaje));
  }, 0));
  const subtotal = electronica ? precioProductos : redondear(precioProductos - impuesto);
  const total = electronica ? redondear(subtotal + impuesto) : precioProductos;
  return { subtotal, impuesto, total };
}