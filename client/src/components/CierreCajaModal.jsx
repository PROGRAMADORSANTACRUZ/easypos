import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';

// Modal de cierre de caja con cuadre: muestra base, ventas, desglose por forma
// de pago y el esperado en efectivo; permite registrar el efectivo contado y
// calcula la diferencia (sobrante/faltante).
export default function CierreCajaModal({ apertura, onClose, onCerrada }) {
  const notify = useToast();
  const [cuadre, setCuadre] = useState(null);
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get(`/aperturas/${apertura.id}/cuadre`)
      .then((c) => { if (vivo) setCuadre(c); })
      .catch((err) => { notify(err.message, 'err'); onClose(); });
    return () => { vivo = false; };
  }, [apertura.id]);

  const diferencia = contado === '' || !cuadre ? null : Number(contado) - cuadre.valorEsperado;

  const confirmar = async () => {
    setGuardando(true);
    try {
      await api.post(`/aperturas/${apertura.id}/cerrar`, {
        valorContado: contado === '' ? null : Number(contado),
        observacion: obs.trim() || null,
      });
      notify('Caja cerrada');
      onCerrada?.();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Cierre de caja — cuadre</h3>
        {!cuadre ? (
          <p className="subtitle">Calculando cuadre…</p>
        ) : (
          <>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {apertura.caja?.nombre || 'Caja'} · {cuadre.numFacturas} factura(s)
            </p>

            <div className="row between"><span>Base inicial</span><b>{money(cuadre.valorInicial)}</b></div>
            <div className="row between"><span>Ventas del turno</span><b>{money(cuadre.totalVentas)}</b></div>
            {cuadre.totalPropinas > 0 && (
              <div className="row between"><span>Propinas</span><b>{money(cuadre.totalPropinas)}</b></div>
            )}

            {cuadre.desglosePagos?.length > 0 && (
              <div style={{ margin: '10px 0', padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                <div className="mini" style={{ marginBottom: 4 }}>Formas de pago</div>
                {cuadre.desglosePagos.map((p) => (
                  <div key={p.metodo} className="row between" style={{ fontSize: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={/^efectivo/i.test(p.metodo) ? 'cash' : /^cr[eé]dito/i.test(p.metodo) ? 'receipt' : 'card'} size={15} />{p.metodo}</span>
                    <b>{money(p.monto)}</b>
                  </div>
                ))}
              </div>
            )}

            <hr style={{ borderTop: '1px dashed var(--border)', margin: '10px 0' }} />
            <div className="row between" style={{ fontSize: 16 }}>
              <span>Esperado en efectivo</span><b>{money(cuadre.valorEsperado)}</b>
            </div>
            <p className="mini" style={{ marginTop: 4 }}>Base + efectivo recibido ({money(cuadre.totalEfectivo)}).</p>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Efectivo contado (opcional)</label>
              <input
                type="number"
                step="any"
                placeholder="Lo que hay físicamente en el cajón"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                autoFocus
              />
            </div>
            {diferencia != null && (
              <div className="row between" style={{ fontSize: 15, color: diferencia === 0 ? 'var(--green)' : 'var(--red)' }}>
                <span>{diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
                <b>{money(diferencia)}</b>
              </div>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <label>Observación (opcional)</label>
              <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmar} disabled={guardando}>
                {guardando ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
