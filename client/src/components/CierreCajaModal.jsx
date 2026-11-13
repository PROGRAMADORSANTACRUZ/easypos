import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';

export default function CierreCajaModal({ apertura, onClose, onCerrada }) {
  const notify = useToast();
  const [cuadre, setCuadre] = useState(null);
  const [baseContada, setBaseContada] = useState('');
  const [contados, setContados] = useState({});
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get(`/aperturas/${apertura.id}/cuadre`)
      .then((c) => { if (vivo) setCuadre(c); })
      .catch((err) => { notify(err.message, 'err'); onClose(); });
    return () => { vivo = false; };
  }, [apertura.id]);

  const diferencia = (contado, esperado) => contado === '' ? null : Math.round((Number(contado) - esperado) * 100) / 100;
  const valorValido = (valor) => valor === '' || (Number.isFinite(Number(valor)) && Number(valor) >= 0
    && Math.abs(Number(valor) * 100 - Math.round(Number(valor) * 100)) < 0.000001);

  const confirmar = async () => {
    if (![baseContada, ...cuadre.medios.map((medio) => contados[medio.id] ?? '')].every(valorValido)) {
      notify('Los valores contados deben ser no negativos y tener máximo dos decimales', 'err');
      return;
    }
    setGuardando(true);
    try {
      await api.post(`/aperturas/${apertura.id}/cerrar`, {
        conteoMedios: {
          base: baseContada === '' ? null : Number(baseContada),
          medios: cuadre.medios.map((medio) => ({
            id: medio.id, contado: contados[medio.id] == null || contados[medio.id] === '' ? null : Number(contados[medio.id]),
          })),
        },
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
    // Solo se sale con "Cancelar": el fondo no cierra el recuadro.
    <div
      role="dialog" aria-modal="true" aria-labelledby="cierre-caja-titulo"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
    >
      <div className="card" style={{ width: 980, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 id="cierre-caja-titulo" style={{ marginTop: 0 }}>Cierre de caja — cuadre</h3>
        {!cuadre ? (
          <>
            <p className="subtitle">Calculando cuadre…</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button></div>
          </>
        ) : (
          <>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {apertura.caja?.nombre || 'Caja'} · {cuadre.numFacturas} factura(s)
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
            <section aria-label="Resumen del turno">
            <div className="row between"><span>Base inicial</span><b>{money(cuadre.valorInicial)}</b></div>
            <div className="row between"><span>Ventas del turno</span><b>{money(cuadre.totalVentas)}</b></div>
            {cuadre.totalPropinas > 0 && (
              <div className="row between"><span>Propinas</span><b>{money(cuadre.totalPropinas)}</b></div>
            )}

            <div style={{ margin: '10px 0', padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
              <div className="mini" style={{ marginBottom: 4 }}>Formas de pago utilizadas en el turno</div>
              {cuadre.desglosePagos.length > 0 ? (
                cuadre.desglosePagos.map((p) => {
                  const medio = cuadre.medios.find((item) => item.id === p.metodo);
                  return (
                    <div key={p.metodo} className="row between" style={{ fontSize: 14 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={medio?.esEfectivo || /^efectivo/i.test(p.metodo) ? 'cash' : /^cr[eé]dito/i.test(p.metodo) ? 'receipt' : 'card'} size={15} />{medio ? `${medio.nombre} (${medio.id})` : p.metodo}</span>
                      <b>{money(p.monto)}</b>
                    </div>
                  );
                })
              ) : <div className="mini">No hay pagos registrados en esta apertura.</div>}
            </div>

            <hr style={{ borderTop: '1px dashed var(--border)', margin: '10px 0' }} />
            <div className="row between" style={{ fontSize: 16 }}>
              <span>Esperado en efectivo</span><b>{money(cuadre.valorEsperado)}</b>
            </div>
            <p className="mini" style={{ marginTop: 4 }}>Base + efectivo recibido ({money(cuadre.totalEfectivo)}) + ingresos - egresos{cuadre.totalRecogidas > 0 ? ` - recogidas (${money(cuadre.totalRecogidas)})` : ''}.</p>
            {cuadre.totalRecogidas > 0 && <p className="mini" style={{ marginTop: 8 }}>El esperado del efectivo ya descuenta las recogidas parciales ({money(cuadre.totalRecogidas)}).</p>}
            {cuadre.sinAsignar.length > 0 && (
              <p className="mini">Pagos sin asignar a un medio: {cuadre.sinAsignar.map((p) => `${p.metodo}: ${money(p.monto)}`).join(' · ')}. No se incluyen en el esperado por medio.</p>
            )}
            </section>

            <section aria-label="Conteo del cierre">
            <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>Conteo (opcional)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', columnGap: 16 }}>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="cierre-base">Base y movimientos contados</label>
              <span className="mini">Esperado: {money(cuadre.valorInicial + cuadre.totalIngresos - cuadre.totalEgresos)}</span>
              <input
                id="cierre-base" type="number" min="0" step="0.01"
                placeholder="Base más ingresos, menos egresos"
                value={baseContada}
                onChange={(e) => setBaseContada(e.target.value)}
                autoFocus
              />
              {baseContada !== '' && <Diferencia valor={diferencia(baseContada, cuadre.valorInicial + cuadre.totalIngresos - cuadre.totalEgresos)} />}
            </div>
            {cuadre.medios.map((medio) => {
              const contado = contados[medio.id] ?? '';
              return (
                <div key={medio.id} className="field" style={{ marginTop: 8 }}>
                  <label htmlFor={`cierre-medio-${medio.id}`}>{medio.nombre} ({medio.id}) contado{!medio.activo && ' · inactivo'}</label>
                  <span className="mini">Esperado por ventas: {medio.esperado == null ? 'No disponible: hay pagos sin asignar' : money(medio.esperado)}</span>
                  <input id={`cierre-medio-${medio.id}`} type="number" min="0" step="0.01" value={contado}
                    onChange={(e) => setContados((actuales) => ({ ...actuales, [medio.id]: e.target.value }))} />
                  {contado !== '' && medio.esperado != null && <Diferencia valor={diferencia(contado, medio.esperado)} />}
                </div>
              );
            })}
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="cierre-observacion">Observación (opcional)</label>
              <textarea id="cierre-observacion" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            </section>
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

function Diferencia({ valor }) {
  return (
    <div className="row between" style={{ fontSize: 15, color: valor === 0 ? 'var(--green)' : 'var(--red)' }}>
      <span>{valor === 0 ? 'Cuadra' : valor > 0 ? 'Sobrante' : 'Faltante'}</span>
      <b>{money(valor)}</b>
    </div>
  );
}
