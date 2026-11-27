// Reglas de las devoluciones, sin base de datos para poder probarlas.
const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 400 });
const redondear = (valor, decimales = 2) => Math.round(valor * 10 ** decimales) / 10 ** decimales;
const TOLERANCIA = 1e-6;

// Lineas de la factura con lo que ya se devolvio y lo que aun se puede devolver.
// devuelto: Map facturaDetalleId -> cantidad devuelta en devoluciones anteriores.
export function disponiblesPorLinea(detalles = [], devuelto = new Map()) {
  return detalles.map((linea) => {
    const yaDevuelto = devuelto.get(linea.id) || 0;
    return { ...linea, devuelto: yaDevuelto, disponible: redondear(Math.max(0, linea.cantidad - yaDevuelto), 4) };
  });
}

// Valida lo pedido ({ detalleId, cantidad }) contra la factura y arma las lineas de la devolucion. El valor de
// cada linea sale del total de la factura en proporcion a lo devuelto, asi incluye los impuestos que se cobraron.
export function armarLineasDevolucion(detalles, devuelto, pedidas) {
  if (!Array.isArray(pedidas)) throw fallo('Indica los productos a devolver');
  const disponibles = new Map(disponiblesPorLinea(detalles, devuelto).map((linea) => [linea.id, linea]));
  const vistas = new Set();
  const lineas = [];
  for (const pedida of pedidas) {
    const cantidad = Number(pedida?.cantidad);
    if (pedida?.cantidad === undefined || pedida?.cantidad === '' || cantidad === 0) continue;
    const linea = disponibles.get(String(pedida?.detalleId));
    if (!linea) throw fallo('Uno de los productos no pertenece a la factura');
    const nombre = linea.productoNombre || linea.productoCodigo || 'el producto';
    if (vistas.has(linea.id)) throw fallo(`${nombre} está repetido en la devolución`);
    vistas.add(linea.id);
    if (!Number.isFinite(cantidad) || cantidad < 0) throw fallo(`Cantidad inválida para ${nombre}`);
    if (cantidad > linea.disponible + TOLERANCIA) {
      throw fallo(linea.disponible > 0
        ? `${nombre}: solo quedan ${linea.disponible} por devolver`
        : `${nombre} ya se devolvió completo`);
    }
    const unitario = linea.cantidad ? linea.total / linea.cantidad : 0;
    lineas.push({
      facturaDetalleId: linea.id,
      productoId: linea.productoId || null,
      productoCodigo: linea.productoCodigo || null,
      productoNombre: linea.productoNombre || null,
      unidad: linea.unidad || null,
      cantidad: redondear(cantidad, 4),
      precioUnitario: redondear(unitario),
      total: redondear(unitario * cantidad),
    });
  }
  if (!lineas.length) throw fallo('Marca al menos un producto y la cantidad a devolver');
  return lineas;
}

export const totalDevolucion = (lineas) => redondear(lineas.reduce((suma, linea) => suma + linea.total, 0));

// Medios de pago con valor en la factura original (codigos como EFE, DAT, TRA...).
export function mediosDeFactura(factura) {
  const medios = new Set();
  for (const indice of [1, 2, 3, 4]) {
    const codigo = String(factura?.[`metodoPago${indice}`] ?? '').trim().toUpperCase();
    if (codigo && codigo !== '0' && Number(factura?.[`valor${indice}`]) > 0) medios.add(codigo);
  }
  return [...medios];
}
