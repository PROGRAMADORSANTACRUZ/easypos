const zona = { timeZone: 'America/Bogota' };
const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const importe = (valor) => (valor == null ? 'No disponible' : dinero.format(valor));

export const notaRecogidas = 'Saldos con base incluida. Parcial: base + ventas en efectivo + ingresos - egresos - recogidas anteriores, calculado al momento de la recogida. Final: cierre de caja; se recoge el efectivo contado (o el esperado si no se contó) y la caja queda en $0.';

export const columnasRecogidas = [
  'Consecutivo', 'Fecha', 'Hora', 'Tipo', 'N.º en el turno', 'Cajero', 'Caja', 'Apertura del turno', 'Base',
  'Efectivo antes', 'Valor recogido', 'Saldo después', 'Esperado al cierre', 'Contado al cierre', 'Diferencia', 'Observación',
];

export const filaRecogida = (fila) => {
  const final = fila.tipo === 'FINAL';
  return [
    fila.consecutivo,
    new Date(fila.fecha).toLocaleDateString('es-CO', zona),
    new Date(fila.fecha).toLocaleTimeString('es-CO', zona),
    final ? 'Final (cierre de caja)' : 'Parcial',
    final ? 'Cierre' : String(fila.numeroEnTurno || ''),
    fila.cajero,
    fila.caja,
    fila.fechaApertura ? new Date(fila.fechaApertura).toLocaleString('es-CO', zona) : '',
    importe(fila.base),
    importe(fila.efectivoAntes),
    final && fila.sinConteo && fila.monto != null ? `${importe(fila.monto)} (sin conteo)` : importe(fila.monto),
    importe(fila.saldoDespues),
    final ? importe(fila.esperado) : '',
    final ? importe(fila.contado) : '',
    final ? importe(fila.diferencia) : '',
    fila.observacion || '',
  ];
};

export function totalesRecogidas(filas) {
  const suma = (tipo) => filas.filter((fila) => fila.tipo === tipo && fila.monto != null)
    .reduce((total, fila) => total + Math.round(fila.monto * 100), 0) / 100;
  return { parciales: suma('PARCIAL'), finales: suma('FINAL') };
}
