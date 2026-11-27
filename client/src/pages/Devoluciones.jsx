import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { useAuth, useToast } from '../App.jsx';
import { Button, PageHeader, Badge, EmptyState } from '../components/ui/index.jsx';
import { lineasParaDevolver, medioDistinto, totalADevolver } from '../devoluciones.js';

const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);
const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—');
const ESTADO_SIESA = {
  OK: ['green', 'En Siesa'], ERROR: ['red', 'Rechazada'], REINTENTAR: ['orange', 'Reintentando'], OMITIDO: ['gray', 'Omitida'],
  REINICIADO: ['orange', 'Por reenviar'],
};

export default function Devoluciones() {
  const { user } = useAuth();
  const notify = useToast();
  const puedeCrear = puede(user, 'devoluciones.crear');

  const [numero, setNumero] = useState('');
  const [resultados, setResultados] = useState(null);
  const [factura, setFactura] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [formaPago, setFormaPago] = useState('');
  const [motivo, setMotivo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);

  const cargarHistorial = () => api.get('/devoluciones').then(setHistorial).catch((e) => notify(e.message, 'err'));
  useEffect(() => { cargarHistorial(); }, []);

  const lineas = useMemo(() => lineasParaDevolver(factura?.lineas || [], cantidades), [factura, cantidades]);
  const total = totalADevolver(lineas);
  const forma = factura?.formasPago?.find((f) => f.id === formaPago);
  const distinto = factura && formaPago ? medioDistinto(formaPago, factura.mediosFactura) : false;

  const abrirFactura = async ({ origen, id }) => {
    try {
      const detalle = await api.get(`/devoluciones/facturas/${origen}/${id}`);
      setFactura(detalle);
      setCantidades({});
      setMotivo('');
      // Por defecto se devuelve con el primer medio con que se pago la factura
      setFormaPago(detalle.mediosFactura.find((m) => detalle.formasPago.some((f) => f.id === m)) || '');
      setResultados(null);
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const buscar = async (e) => {
    e.preventDefault();
    setBuscando(true);
    try {
      const encontradas = await api.get(`/devoluciones/facturas?numero=${encodeURIComponent(numero)}`);
      if (encontradas.length === 1) await abrirFactura(encontradas[0]);
      else {
        setFactura(null);
        setResultados(encontradas);
      }
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBuscando(false);
    }
  };

  const devolverTodo = () => setCantidades(Object.fromEntries((factura?.lineas || []).map((l) => [l.id, l.disponible > 0 ? String(l.disponible) : ''])));

  const registrar = async () => {
    if (!lineas.length) return notify('Escribe la cantidad a devolver de al menos un producto', 'err');
    if (!formaPago) return notify('Elige el medio de pago de la devolución', 'err');
    if (motivo.trim().length < 3) return notify('Escribe el motivo de la devolución', 'err');
    if (distinto && !window.confirm(
      `La factura se pagó con ${factura.mediosFactura.join(', ') || 'otro medio'} y vas a devolver por ${formaPago}.\n\n¿Continuar con un medio de pago distinto?`,
    )) return;
    setGuardando(true);
    try {
      const creada = await api.post('/devoluciones', {
        origen: factura.origen,
        facturaId: factura.id,
        items: lineas.map((l) => ({ detalleId: l.id, cantidad: l.cantidad })),
        formaPago,
        motivo: motivo.trim(),
      });
      notify(`Devolución ${creada.prefijo}${creada.numero} registrada por ${money(creada.total)}`);
      setFactura(null);
      setNumero('');
      cargarHistorial();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <PageHeader title="Devoluciones" subtitle="Devolución total o parcial de una factura. Reintegra el inventario y se envía a Siesa como 1NE." />

      {puedeCrear && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={buscar}>
            <div className="field" style={{ margin: 0, minWidth: 220 }}>
              <label>Número de la factura</label>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: FEV1234 o 1234" inputMode="numeric" required />
            </div>
            <Button variant="primary" type="submit" loading={buscando}>Buscar</Button>
          </form>

          {resultados && (resultados.length === 0 ? (
            <p className="empty">No se encontró esa factura en tus centros de operación.</p>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>C.O.</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={`${r.origen}-${r.id}`}>
                    <td>{r.documento}</td><td>{fecha(r.fecha)}</td><td>{r.nombreCliente}</td><td>{r.centroOperacionCodigo}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.total)}</td>
                    <td><Button size="sm" onClick={() => abrirFactura(r)}>Elegir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {factura && (
            <div style={{ marginTop: 16 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>Factura {factura.documento}</strong>
                  <div className="mini">{fecha(factura.fecha)} · {factura.nombreCliente || 'Consumidor final'} · C.O. {factura.centroOperacionCodigo} · Total {money(factura.total)}</div>
                  <div className="mini">Pagada con: {factura.mediosFactura.join(', ') || '—'}</div>
                  {factura.devoluciones.length > 0 && (
                    <div className="mini">Devoluciones anteriores: {factura.devoluciones.map((d) => `${d.prefijo}${d.numero} (${money(d.total)})`).join(', ')}</div>
                  )}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" onClick={devolverTodo}>Devolver todo</Button>
                  <Button size="sm" variant="secondary" onClick={() => setCantidades({})}>Limpiar</Button>
                </div>
              </div>

              {factura.credito ? (
                <p className="mini" role="alert" style={{ color: 'var(--red)' }}>Es una factura a crédito: no tiene pago que reembolsar.</p>
              ) : (
                <>
                  <table style={{ marginTop: 10 }}>
                    <thead>
                      <tr><th>Producto</th><th style={{ textAlign: 'right' }}>Vendido</th><th style={{ textAlign: 'right' }}>Ya devuelto</th><th style={{ width: 130 }}>A devolver</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
                    </thead>
                    <tbody>
                      {factura.lineas.map((l) => {
                        const linea = lineas.find((x) => x.id === l.id);
                        return (
                          <tr key={l.id}>
                            <td>{l.productoNombre}<div className="mini">{l.productoCodigo}</div></td>
                            <td style={{ textAlign: 'right' }}>{l.cantidad} {l.unidad || ''}</td>
                            <td style={{ textAlign: 'right' }}>{l.devuelto || 0}</td>
                            <td>
                              <input
                                type="number" min="0" max={l.disponible} step="any" disabled={l.disponible <= 0}
                                aria-label={`Cantidad a devolver de ${l.productoNombre}`}
                                value={cantidades[l.id] ?? ''}
                                placeholder={l.disponible > 0 ? `máx. ${l.disponible}` : 'Devuelto'}
                                onChange={(e) => setCantidades((c) => ({ ...c, [l.id]: e.target.value }))}
                              />
                              {linea?.error && <div className="mini" style={{ color: 'var(--red)' }}>{linea.error}</div>}
                            </td>
                            <td style={{ textAlign: 'right' }}>{linea && !linea.error ? money(linea.total) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="grid form-2col" style={{ gap: 12, marginTop: 12 }}>
                    <div className="field">
                      <label>Medio de pago de la devolución *</label>
                      <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                        <option value="">Selecciona…</option>
                        {factura.formasPago.map((f) => (
                          <option key={f.id} value={f.id}>{f.id} · {f.formaPago}{factura.mediosFactura.includes(f.id) ? ' (usado en la factura)' : ''}</option>
                        ))}
                      </select>
                      {distinto && (
                        <div className="mini" role="alert" style={{ color: 'var(--orange, #d97706)', marginTop: 4 }}>
                          ⚠ Este medio no se usó en la factura (se pagó con {factura.mediosFactura.join(', ') || 'otro medio'}).
                        </div>
                      )}
                      {forma?.efectivo && <div className="mini" style={{ marginTop: 4 }}>El efectivo sale de la caja abierta (queda como egreso).</div>}
                    </div>
                    <div className="field">
                      <label>Motivo *</label>
                      <textarea rows={2} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: producto en mal estado" />
                    </div>
                  </div>

                  <div className="row between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                    <strong>Total a devolver: {money(total)}</strong>
                    <Button variant="primary" icon="check" loading={guardando} disabled={!lineas.length || lineas.some((l) => l.error)} onClick={registrar}>
                      Registrar devolución
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card crud-table-scroll">
        <h3 style={{ marginTop: 0 }}>Últimas devoluciones</h3>
        {historial.length === 0 ? (
          <EmptyState icon="notas_credito" title="Sin devoluciones" description="Aquí aparecen las devoluciones registradas en tus centros de operación." />
        ) : (
          <table>
            <thead>
              <tr><th>Documento</th><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Medio</th><th style={{ textAlign: 'right' }}>Total</th><th>Siesa</th></tr>
            </thead>
            <tbody>
              {historial.map((d) => {
                const [color, texto] = ESTADO_SIESA[d.siesa?.estado] || ['gray', 'Pendiente'];
                return (
                  <tr key={d.id}>
                    <td>{d.tipoDocumentoCodigo} {d.prefijo}{d.numero}</td>
                    <td>{d.facturaPrefijo}{d.facturaNumero}</td>
                    <td>{fecha(d.createdAt)}</td>
                    <td>{d.nombreCliente || 'Consumidor final'}</td>
                    <td className="mini">{d.detalle.map((l) => `${l.cantidad} ${l.productoNombre}`).join(', ')}</td>
                    <td>{d.formaPago}</td>
                    <td style={{ textAlign: 'right' }}>{money(d.total)}</td>
                    <td title={d.siesa?.mensaje || ''}><Badge status={color}>{texto}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
