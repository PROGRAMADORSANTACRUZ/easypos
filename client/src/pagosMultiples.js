export const FORMAS_PAGO = [
  { codigo: 'EFECTIVO', nombre: 'Efectivo', icono: 'cash' },
  { codigo: 'TARJETA', nombre: 'Tarjeta', icono: 'card' },
  { codigo: 'TRANSFERENCIA', nombre: 'Transferencia', icono: 'swap' },
];

const centavos = (valor) => Math.round(Number(valor) * 100);
export const monedaPago = (valor) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 2, minimumFractionDigits: 0,
}).format(valor || 0);

export function agregarPago(pagos, formaPago, valor) {
  const monto = centavos(valor);
  if (!FORMAS_PAGO.some((forma) => forma.codigo === formaPago) || !Number.isSafeInteger(monto) || monto <= 0) return pagos;
  const existente = pagos.find((pago) => pago.formaPago === formaPago);
  return existente
    ? pagos.map((pago) => pago.formaPago === formaPago ? { ...pago, monto: (centavos(pago.monto) + monto) / 100 } : pago)
    : [...pagos, { formaPago, monto: monto / 100 }];
}

export function resumirPagos(pagos, total) {
  const totalCentavos = centavos(total);
  const validos = pagos.length > 0 && pagos.every((pago) =>
    FORMAS_PAGO.some((forma) => forma.codigo === pago.formaPago) &&
    Number.isSafeInteger(centavos(pago.monto)) && centavos(pago.monto) > 0);
  const recibidoCentavos = pagos.reduce((suma, pago) => suma + (centavos(pago.monto) || 0), 0);
  const noEfectivo = pagos.filter((pago) => pago.formaPago !== 'EFECTIVO')
    .reduce((suma, pago) => suma + (centavos(pago.monto) || 0), 0);
  const vueltoCentavos = Math.max(0, recibidoCentavos - totalCentavos);
  return {
    valido: validos && Number.isSafeInteger(totalCentavos) && totalCentavos > 0 &&
      recibidoCentavos >= totalCentavos && noEfectivo <= totalCentavos,
    recibido: recibidoCentavos / 100,
    pendiente: Math.max(0, totalCentavos - recibidoCentavos) / 100,
    vuelto: vueltoCentavos / 100,
    aplicados: pagos.map((pago) => ({
      ...pago,
      monto: pago.formaPago === 'EFECTIVO'
        ? Math.max(0, centavos(pago.monto) - vueltoCentavos) / 100
        : Number(pago.monto),
    })).filter((pago) => pago.monto > 0),
  };
}

export function etiquetaPagos(pagos, total, formato = monedaPago) {
  const resumen = resumirPagos(pagos, total);
  if (!resumen.valido) return '';
  if (resumen.aplicados.length === 1) return resumen.aplicados[0].formaPago;
  return resumen.aplicados.map((pago) => `${pago.formaPago} ${formato(pago.monto)}`).join(' + ');
}