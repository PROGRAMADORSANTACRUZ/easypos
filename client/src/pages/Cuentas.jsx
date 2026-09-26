import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { useToast } from '../App.jsx';
import { CardsSkeleton } from '../components/ui/index.jsx';

const FORMAS_PAGO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'];

const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-CO') : '—');
const vencida = (f) => f.vence && !f.pagada && new Date(f.vence) < new Date();

export default function Cuentas() {
  const notify = useToast();
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState(null); // clienteId/clave abierto
  const [abono, setAbono] = useState({}); // { [facturaId]: { monto, metodoPago } }
  const [procesando, setProcesando] = useState(null);

  const cargar = async () => {
    try {
      setCuentas(await api.get('/cuentas'));
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const saldoGlobal = useMemo(
    () => cuentas.reduce((s, c) => s + c.saldoTotal, 0),
    [cuentas]
  );

  const setAbonoCampo = (facturaId, campo, valor) =>
    setAbono((a) => ({ ...a, [facturaId]: { ...a[facturaId], [campo]: valor } }));

  const registrarAbono = async (factura) => {
    const datos = abono[factura.id] || {};
    const monto = Number(datos.monto);
    if (!monto || monto <= 0) return notify('Digita el monto del abono', 'err');
    if (monto > factura.saldo) return notify('El abono supera el saldo pendiente', 'err');
    setProcesando(factura.id);
    try {
      await api.post('/cuentas/abonos', {
        facturaId: factura.id,
        monto,
        metodoPago: datos.metodoPago || 'EFECTIVO',
      });
      notify(`Abono de ${money(monto)} registrado`);
      setAbono((a) => ({ ...a, [factura.id]: {} }));
      await cargar();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  if (cargando) return <CardsSkeleton />;

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Cuentas por cobrar</h1>
          <p className="subtitle">Saldos pendientes de clientes a crédito y registro de abonos.</p>
        </div>
        <span className="badge orange" style={{ fontSize: 16 }}>Saldo total: {money(saldoGlobal)}</span>
      </div>

      {cuentas.length === 0 ? (
        <div className="card"><p className="empty">No hay cuentas por cobrar pendientes.</p></div>
      ) : (
        <div className="cards-grid">
          {cuentas.map((c) => {
            const clave = c.clienteId ?? c.nombre;
            const abierto = expandido === clave;
            const sobreCupo = c.creditoCupo != null && c.saldoTotal > c.creditoCupo;
            return (
              <div key={clave} className="card" style={{ background: 'var(--panel-2)' }}>
                <div className="row between" style={{ cursor: 'pointer' }} onClick={() => setExpandido(abierto ? null : clave)}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                    <div className="mini">
                      {c.documento ? `${c.documento} · ` : ''}{c.facturas.length} factura(s)
                      {c.telefono ? ` · ${c.telefono}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="badge orange">{money(c.saldoTotal)}</div>
                    <div className="nav-caret" aria-hidden style={{ marginTop: 4 }}>{abierto ? '▴' : '▾'}</div>
                  </div>
                </div>
                {c.creditoCupo != null && (
                  <div className="mini" style={{ marginTop: 6, color: sobreCupo ? '#ef4444' : undefined }}>
                    Cupo: {money(c.creditoCupo)}{sobreCupo ? ' · cupo superado' : ''}
                  </div>
                )}

                {abierto && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                    {c.facturas.map((f) => {
                      const datos = abono[f.id] || {};
                      return (
                        <div key={f.id} className="card" style={{ background: 'var(--panel)' }}>
                          <div className="row between">
                            <div style={{ fontWeight: 700 }}>Factura #{f.id}</div>
                            <span className={`badge ${vencida(f) ? 'red' : 'blue'}`}>{money(f.saldo)}</span>
                          </div>
                          <div className="mini" style={{ margin: '4px 0 8px' }}>
                            {fecha(f.createdAt)} · Vence {fecha(f.vence)}
                            {vencida(f) && <strong style={{ color: 'var(--red)' }}> · VENCIDA</strong>}
                          </div>
                          <div className="total-line"><span>Total</span><span>{money(f.total)}</span></div>
                          <div className="total-line"><span>Abonado</span><span>{money(f.abonado)}</span></div>
                          <div className="total-line grand"><span>Saldo</span><span>{money(f.saldo)}</span></div>

                          {f.abonos.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div className="mini" style={{ fontWeight: 600 }}>Abonos</div>
                              {f.abonos.map((a) => (
                                <div key={a.id} className="mini row between">
                                  <span>{fecha(a.createdAt)} · {a.metodoPago}</span>
                                  <span>{money(a.monto)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                              <label>Abono</label>
                              <input
                                type="number"
                                min="0"
                                max={f.saldo}
                                placeholder="0"
                                value={datos.monto ?? ''}
                                onChange={(e) => setAbonoCampo(f.id, 'monto', e.target.value)}
                              />
                            </div>
                            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                              <label>Forma</label>
                              <select
                                value={datos.metodoPago || 'EFECTIVO'}
                                onChange={(e) => setAbonoCampo(f.id, 'metodoPago', e.target.value)}
                              >
                                {FORMAS_PAGO.map((fp) => <option key={fp} value={fp}>{fp}</option>)}
                              </select>
                            </div>
                            <button
                              className="btn btn-green"
                              disabled={procesando === f.id}
                              onClick={() => registrarAbono(f)}
                            >
                              Abonar
                            </button>
                          </div>
                          <button
                            className="btn btn-sm"
                            style={{ width: '100%', marginTop: 6 }}
                            disabled={procesando === f.id}
                            onClick={() => { setAbonoCampo(f.id, 'monto', String(f.saldo)); }}
                          >
                            Pagar saldo completo ({money(f.saldo)})
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
