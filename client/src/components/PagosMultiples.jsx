import { useId } from 'react';
import { Icon } from '../icons.jsx';
import { FORMAS_PAGO, agregarPago, resumirPagos, monedaPago } from '../pagosMultiples.js';

export default function PagosMultiples({ value = { recibe: '', pagos: [] }, onChange, total, sugerido }) {
  const recibeId = useId();
  const resumen = resumirPagos(value.pagos, total);
  const puedeAgregar = Number.isFinite(Number(value.recibe)) && Number(value.recibe) >= 0.01;
  const cargar = (formaPago) => {
    const pagos = agregarPago(value.pagos, formaPago, value.recibe);
    if (pagos !== value.pagos) onChange({ recibe: '', pagos });
  };

  return (
    <div className="pagos-multiples">
      <div className="field">
        <label htmlFor={recibeId}>Recibe</label>
        <input id={recibeId} type="number" min="0.01" step="0.01" placeholder="0" value={value.recibe}
          onChange={(event) => onChange({ ...value, recibe: event.target.value })} />
      </div>
      <div className="pagos-formas" role="group" aria-label="Formas de pago">
        {FORMAS_PAGO.map((forma) => (
          <button key={forma.codigo} type="button" className="btn"
            aria-pressed={value.pagos.some((pago) => pago.formaPago === forma.codigo)}
            title={`Agregar importe a ${forma.nombre.toLowerCase()}`}
            disabled={!puedeAgregar} onClick={() => cargar(forma.codigo)}>
            <Icon name={forma.icono} size={18} />
            <span>{forma.nombre}</span>
            {sugerido === forma.codigo && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
      <div className="pagos-desglose" aria-label="Pagos cargados">
        {value.pagos.map((pago) => {
          const forma = FORMAS_PAGO.find((opcion) => opcion.codigo === pago.formaPago);
          return (
            <div className="pago-cargado" key={pago.formaPago}>
              <label htmlFor={`${recibeId}-${pago.formaPago}`}>{forma.nombre}</label>
              <input id={`${recibeId}-${pago.formaPago}`} type="number" min="0.01" step="0.01" value={pago.monto}
                aria-label={`Importe en ${forma.nombre.toLowerCase()}`}
                onChange={(event) => onChange({ ...value, pagos: value.pagos.map((actual) => actual.formaPago === pago.formaPago ? { ...actual, monto: event.target.value } : actual) })} />
              <button type="button" className="btn btn-sm" title={`Quitar ${forma.nombre.toLowerCase()}`}
                aria-label={`Quitar ${forma.nombre.toLowerCase()}`}
                onClick={() => onChange({ ...value, pagos: value.pagos.filter((actual) => actual.formaPago !== pago.formaPago) })}>
                <Icon name="delete" size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <div aria-live="polite">
        <div className="total-line"><span>Total recibido</span><span>{monedaPago(resumen.recibido)}</span></div>
        <div className="total-line grand"><span>Pendiente</span><span>{monedaPago(resumen.pendiente)}</span></div>
        {resumen.vuelto > 0 && (
          <div className="total-line grand"><span>Vuelto</span><span>{monedaPago(resumen.vuelto)}</span></div>
        )}
        {resumen.pendiente === 0 && value.pagos.length > 0 && !resumen.valido && (
          <div className="mini" role="alert" style={{ color: 'var(--red)' }}>Revisa los importes: solo el efectivo permite vuelto.</div>
        )}
      </div>
    </div>
  );
}