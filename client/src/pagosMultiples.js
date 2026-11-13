export const FORMAS_PAGO = [
  { codigo: 'EFECTIVO', nombre: 'Efectivo', icono: 'cash' },
  { codigo: 'TARJETA', nombre: 'Tarjeta', icono: 'card' },
  { codigo: 'TRANSFERENCIA', nombre: 'Transferencia', icono: 'swap' },
];

export const CODIGO_AJUSTE_PESO = 'AJP';
// El efectivo se cobra redondeado hacia abajo a este multiplo (en centavos); la diferencia es el ajuste al peso.
const MULTIPLO_EFECTIVO_CENTAVOS = 5000;

export function formasPagoActivas(registros) {
  return (registros || []).filter((forma) => forma.activo === true && forma.id !== CODIGO_AJUSTE_PESO).map((forma) => ({
    codigo: forma.id,
    nombre: forma.formaPago,
    esEfectivo: forma.id === 'EFE' || /^10(?:-|$)/.test(forma.formaPagoDian || ''),
    icono: forma.id === 'EFE' || /^10(?:-|$)/.test(forma.formaPagoDian || '') ? 'cash'
      : ['DAT', 'DTF'].includes(forma.id) ? 'card' : 'swap',
  }));
}

export function esPagoEfectivo(codigo, formas = FORMAS_PAGO) {
  const forma = formas.find((opcion) => opcion.codigo === codigo);
  return !!forma && (forma.esEfectivo === true || forma.codigo === 'EFECTIVO');
}

const centavos = (valor) => Math.round(Number(valor) * 100);
export const monedaPago = (valor) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 2, minimumFractionDigits: 0,
}).format(valor || 0);

export function agregarPago(pagos, formaPago, valor, formas = FORMAS_PAGO) {
  const monto = centavos(valor);
  if (!formas.some((forma) => forma.codigo === formaPago) || !Number.isSafeInteger(monto) || monto <= 0) return pagos;
  const existente = pagos.find((pago) => pago.formaPago === formaPago);
  if (!existente && new Set(pagos.map((pago) => pago.formaPago)).size >= 4) return pagos;
  return existente
    ? pagos.map((pago) => pago.formaPago === formaPago ? { ...pago, monto: (centavos(pago.monto) + monto) / 100 } : pago)
    : [...pagos, { formaPago, monto: monto / 100 }];
}

export function resumirPagos(pagos, total, formas = FORMAS_PAGO) {
  const totalFactura = centavos(total);
  const validos = pagos.length > 0 && new Set(pagos.map((pago) => pago.formaPago)).size <= 4 && pagos.every((pago) =>
    formas.some((forma) => forma.codigo === pago.formaPago) &&
    Number.isSafeInteger(centavos(pago.monto)) && centavos(pago.monto) > 0);
  const recibidoCentavos = pagos.reduce((suma, pago) => suma + (centavos(pago.monto) || 0), 0);
  const noEfectivo = pagos.filter((pago) => !esPagoEfectivo(pago.formaPago, formas))
    .reduce((suma, pago) => suma + (centavos(pago.monto) || 0), 0);
  const conEfectivo = pagos.some((pago) => esPagoEfectivo(pago.formaPago, formas));
  const ajusteCentavos = conEfectivo && new Set(pagos.map((pago) => pago.formaPago)).size < 4
    && totalFactura - noEfectivo >= MULTIPLO_EFECTIVO_CENTAVOS
    ? (totalFactura - noEfectivo) % MULTIPLO_EFECTIVO_CENTAVOS : 0;
  const totalCentavos = totalFactura - ajusteCentavos;
  const vueltoCentavos = Math.max(0, recibidoCentavos - totalCentavos);
  let vueltoPendiente = vueltoCentavos;
  const aplicados = pagos.map((pago) => {
    const monto = centavos(pago.monto);
    const descontar = esPagoEfectivo(pago.formaPago, formas) ? Math.min(monto, vueltoPendiente) : 0;
    vueltoPendiente -= descontar;
    return { ...pago, monto: (monto - descontar) / 100, recibido: monto / 100 };
  }).filter((pago) => pago.monto > 0);
  if (ajusteCentavos > 0) aplicados.push({ formaPago: CODIGO_AJUSTE_PESO, monto: ajusteCentavos / 100, recibido: ajusteCentavos / 100 });
  return {
    valido: validos && Number.isSafeInteger(totalFactura) && totalFactura > 0 &&
      recibidoCentavos >= totalCentavos && noEfectivo <= totalCentavos,
    recibido: recibidoCentavos / 100,
    pendiente: Math.max(0, totalCentavos - recibidoCentavos) / 100,
    vuelto: vueltoCentavos / 100,
    ajuste: ajusteCentavos / 100,
    aplicados,
  };
}

export function etiquetaPagos(pagos, total, formato = monedaPago, formas = FORMAS_PAGO) {
  const resumen = resumirPagos(pagos, total, formas);
  if (!resumen.valido) return '';
  if (resumen.aplicados.length === 1) return resumen.aplicados[0].formaPago;
  return resumen.aplicados.map((pago) => `${pago.formaPago} ${formato(pago.monto)}`).join(' + ');
}