import { useEffect, useState } from 'react';
import { money } from '../api.js';
import { fechaHoraColombia } from '../reporteMovimientosCaja.js';

export const columnasDocumentosCaja = [
  'C.O.', 'Nro documento', 'Fecha', 'Estado', 'Nombre cajero', 'Adiciones', 'Recogidas', 'Otros ingresos', 'Otros egresos',
  'Efectivo', 'Cheque', 'Tarjeta crédito', 'Tarjeta débito', 'Otros', 'Tercero', 'Razón social tercero',
];
const IMPORTES = ['adiciones', 'recogidas', 'otrosIngresos', 'otrosEgresos', 'efectivo', 'cheque', 'tarjetaCredito', 'tarjetaDebito', 'otros'];

export const filaDocumentoCaja = (doc) => [
  doc.centro, doc.documento, fechaHoraColombia(doc.fecha), doc.estado, doc.cajero,
  ...IMPORTES.map((campo) => money(doc[campo])), doc.tercero, doc.cajero,
];

const fechaCorta = (fecha) => new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
const importe = (valor) => (valor == null ? 'No registrado' : money(valor));

function DetalleDocumento({ doc, onCerrar }) {
  const [pestana, setPestana] = useState('conceptos');
  useEffect(() => {
    const alPresionar = (evento) => { if (evento.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal documento-caja-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-documento-caja" onClick={(evento) => evento.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 id="titulo-documento-caja" style={{ margin: 0 }}>Movimiento de documentos de caja</h3>
          <button type="button" className="btn btn-sm" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="documento-caja-cabecera">
          <div><span>Documento</span><b>{doc.documento}</b></div>
          <div><span>Fecha</span><b>{fechaHoraColombia(doc.fecha)}</b></div>
          <div><span>Estado</span><b>{doc.estado}</b></div>
          <div><span>Tipo</span><b>{doc.tipo}</b></div>
          <div><span>Tercero</span><b>{doc.tercero || '—'} · {doc.cajero}</b></div>
          <div><span>Caja</span><b>{doc.caja}</b></div>
        </div>
        <div className="documento-caja-pestanas" role="tablist">
          {[['conceptos', 'Conceptos de caja'], ['medios', 'Medios de pago'], ['cuadre', 'Cuadre físico']].map(([id, nombre]) => (
            <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>{nombre}</button>
          ))}
        </div>
        <div className="documento-caja-contenido">
          {pestana === 'conceptos' && (
            <table className="tabla-documento-caja">
              <thead><tr><th>Concepto</th><th className="izq">Desc. concepto</th><th>Fecha</th><th>Estado</th><th>Moneda</th><th>Valor débito</th><th>Valor crédito</th></tr></thead>
              <tbody>
                {doc.conceptos.map((fila, indice) => (
                  <tr key={indice}><td>{fila.concepto}</td><td className="izq">{fila.descripcion}</td><td>{fechaCorta(doc.fecha)}</td><td>{doc.estado}</td><td>COP</td><td>{money(fila.debito)}</td><td>{money(fila.credito)}</td></tr>
                ))}
                {!doc.conceptos.length && <tr><td colSpan={7} className="empty">Sin conceptos.</td></tr>}
              </tbody>
            </table>
          )}
          {pestana === 'medios' && (
            <table className="tabla-documento-caja">
              <thead><tr><th>Medio pago</th><th>Moneda</th><th>Valor ingreso</th><th>Valor egreso</th><th>Referencia</th><th>Documento</th></tr></thead>
              <tbody>
                {doc.medios.map((fila, indice) => (
                  <tr key={indice}><td title={fila.nombre}>{fila.medio}</td><td>COP</td><td>{money(fila.ingreso)}</td><td>{money(fila.egreso)}</td><td>{fila.referencia || '—'}</td><td>{fila.documento || '—'}</td></tr>
                ))}
                {!doc.medios.length && <tr><td colSpan={6} className="empty">Sin medios de pago.</td></tr>}
              </tbody>
            </table>
          )}
          {pestana === 'cuadre' && (
            <table className="tabla-documento-caja">
              <thead><tr><th>Medio de pago</th><th>Moneda</th><th>Saldo</th><th>Físico</th><th>Diferencia</th></tr></thead>
              <tbody>
                {doc.cuadre.map((fila) => (
                  <tr key={fila.medio}>
                    <td title={fila.nombre}>{fila.medio}</td><td>COP</td><td>{importe(fila.saldo)}</td><td>{importe(fila.fisico)}</td>
                    <td className={fila.diferencia < 0 ? 'negativo' : fila.diferencia > 0 ? 'positivo' : ''}>{importe(fila.diferencia)}</td>
                  </tr>
                ))}
                {!doc.cuadre.length && <tr><td colSpan={5} className="empty">{doc.clase === 'E' ? 'La recogida parcial no tiene cuadre físico.' : 'Sin cuadre registrado.'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentosCaja({ documentos }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const [abierto, setAbierto] = useState(null);
  if (!documentos.length) return <p className="empty">Sin recogidas ni cierres de caja en el periodo.</p>;
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla-documentos-caja">
          <thead><tr>{columnasDocumentosCaja.map((columna, indice) => <th key={columna} className={indice === 4 || indice === 15 ? 'izq' : ''}>{columna}</th>)}</tr></thead>
          <tbody>
            {documentos.map((doc) => (
              <tr key={doc.id} className={seleccionado === doc.id ? 'seleccionada' : ''} title="Doble clic para ver el detalle"
                tabIndex={0} onClick={() => setSeleccionado(doc.id)} onDoubleClick={() => setAbierto(doc)}
                onKeyDown={(evento) => { if (evento.key === 'Enter') setAbierto(doc); }}>
                {filaDocumentoCaja(doc).map((valor, indice) => <td key={indice} className={indice === 4 || indice === 15 ? 'izq' : ''}>{valor}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mini">E = recogida parcial · G = cierre de caja con todos los medios de pago agrupados. Doble clic (o Enter) sobre una línea para ver conceptos de caja, medios de pago y cuadre físico.</p>
      {abierto && <DetalleDocumento doc={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
