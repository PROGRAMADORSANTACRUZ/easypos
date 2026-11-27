// Calculos de la pantalla de Devoluciones (sin React, para poder probarlos).
const redondear = (valor) => Math.round(valor * 100) / 100;

// Lineas con cantidad escrita: valor proporcional al total facturado de la linea y error si se pasa.
export function lineasParaDevolver(lineasFactura = [], cantidades = {}) {
  const resultado = [];
  for (const linea of lineasFactura) {
    const escrito = cantidades[linea.id];
    if (escrito === undefined || escrito === '' || Number(escrito) === 0) continue;
    const cantidad = Number(escrito);
    let error = null;
    if (!Number.isFinite(cantidad) || cantidad < 0) error = 'Cantidad inválida';
    else if (cantidad > linea.disponible + 1e-6) error = `Máximo ${linea.disponible}`;
    const unitario = linea.cantidad ? linea.total / linea.cantidad : 0;
    resultado.push({ id: linea.id, cantidad, total: error ? 0 : redondear(unitario * cantidad), error });
  }
  return resultado;
}

export const totalADevolver = (lineas) => redondear(lineas.filter((l) => !l.error).reduce((suma, l) => suma + l.total, 0));

// true si se devuelve por un medio que no se uso para pagar la factura (se muestra alerta y se confirma)
export const medioDistinto = (formaPago, mediosFactura = []) => Boolean(formaPago)
  && !mediosFactura.map((m) => String(m).toUpperCase()).includes(String(formaPago).toUpperCase());
