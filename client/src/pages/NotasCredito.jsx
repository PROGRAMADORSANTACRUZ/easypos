import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = { facturaId: '', numeroNota: '', motivo: '', total: '', estadoDIAN: 'PENDIENTE' };

const ESTADOS = ['PENDIENTE', 'ACEPTADA', 'RECHAZADA'];

// Numero visible de una factura: prefijo + consecutivo DIAN o ID corto.
const numeroFactura = (f) => (f?.numeroFactura ? `${f.prefijo || ''}${f.numeroFactura}` : `#${String(f?.id || '').slice(0, 8)}`);
const dia = (f) => (f ? new Date(f).toLocaleString('es-CO') : '—');

// Buscador de factura por código: se escribe el prefijo + consecutivo (ej. FER1) para traerla.
function FacturaBuscador({ facturas, value, onSelect }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sel = facturas.find((f) => String(f.id) === String(value));
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const filtro = norm(q);
  const lista = filtro
    ? facturas.filter((f) => norm(numeroFactura(f)).includes(filtro))
    : facturas;
  const etiqueta = sel ? `${numeroFactura(sel)} · ${money(sel.total)}` : '— Selecciona —';
  return (
    <div className="cliente-picker">
      <button type="button" className="cliente-picker-btn" onClick={() => setOpen((o) => !o)}>
        <span className="cliente-picker-txt">{etiqueta}</span>
        <span className="nav-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="cliente-picker-pop">
            <input
              autoFocus
              className="cliente-picker-search"
              placeholder="Escribe el prefijo + consecutivo (ej. FER1)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              {lista.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className={`cliente-picker-item ${String(f.id) === String(value) ? 'activo' : ''}`}
                  onClick={() => { onSelect(f); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{numeroFactura(f)}</span>
                  <span className="mini"> · {money(f.total)} · {f.cliente?.nombre || 'Consumidor Final'}</span>
                </button>
              ))}
              {lista.length === 0 && <div className="empty" style={{ padding: 10 }}>Sin resultados</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function NotasCredito() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'notas_credito.crear');
  const puedeEditar = puede(user, 'notas_credito.editar');
  const puedeEliminar = puede(user, 'notas_credito.eliminar');

  const [notas, setNotas] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [filtro, setFiltro] = useState({ desde: '', hasta: '' });
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async (f = filtro) => {
    try {
      const qs = new URLSearchParams();
      if (f.desde) qs.set('desde', f.desde);
      if (f.hasta) qs.set('hasta', f.hasta);
      const ruta = qs.toString() ? `/notas-credito?${qs}` : '/notas-credito';
      const [n, fac] = await Promise.all([api.get(ruta), api.get('/facturas')]);
      setNotas(n);
      setFacturas(fac);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const limpiar = () => { setEditId(null); setForm(VACIO); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  // Factura seleccionada en el formulario (para mostrar sus productos y precios originales).
  const facturaSel = facturas.find((f) => String(f.id) === String(form.facturaId)) || null;

  // Al elegir una factura, trae su total y sus productos facturados (precio de venta de ese momento).
  const seleccionarFactura = (f) => {
    setForm((prev) => ({ ...prev, facturaId: f.id, total: f.total != null ? String(f.total) : '' }));
  };

  const empezarEdicion = (n) => {
    setEditId(n.id);
    setForm({
      facturaId: n.facturaId || '',
      numeroNota: n.numeroNota || '',
      motivo: n.motivo || '',
      total: n.total != null ? String(n.total) : '',
      estadoDIAN: n.estadoDIAN || 'PENDIENTE',
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.facturaId) return notify('Selecciona la factura', 'err');
    const payload = {
      facturaId: form.facturaId,
      numeroNota: form.numeroNota.trim() || null,
      motivo: form.motivo.trim() || null,
      total: form.total === '' ? null : Number(form.total),
      estadoDIAN: form.estadoDIAN || null,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/notas-credito/${editId}`, payload);
        notify('Nota crédito actualizada');
      } else {
        await api.post('/notas-credito', payload);
        notify('Nota crédito creada');
      }
      setModalAbierto(false);
      limpiar();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (n) => {
    if (!confirm(`¿Eliminar la nota crédito "${n.numeroNota || ''}"?`)) return;
    try {
      await api.del(`/notas-credito/${n.id}`);
      notify('Nota crédito eliminada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const [reenviando, setReenviando] = useState(null);
  const reenviarDian = async (n) => {
    setReenviando(n.id);
    try {
      const actualizada = await api.post(`/notas-credito/${n.id}/reenviar-dian`, {});
      setNotas((ns) => ns.map((x) => (x.id === actualizada.id ? { ...x, ...actualizada } : x)));
      notify(actualizada.estadoDIAN === 'ACEPTADA' ? 'Nota crédito reportada a la DIAN' : 'La DIAN/Factus rechazó el envío', actualizada.estadoDIAN === 'ACEPTADA' ? 'ok' : 'err');
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setReenviando(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notas crédito (DIAN)"
        subtitle="Notas crédito asociadas a facturas electrónicas."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nueva nota crédito" />}
      />

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Desde</label>
            <input type="date" value={filtro.desde} onChange={(e) => setFiltro((f) => ({ ...f, desde: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input type="date" value={filtro.hasta} onChange={(e) => setFiltro((f) => ({ ...f, hasta: e.target.value }))} />
          </div>
          <button className="btn btn-primary" type="button" onClick={cargar}>Filtrar</button>
          {(filtro.desde || filtro.hasta) && (
            <button className="btn" type="button" onClick={() => { const v = { desde: '', hasta: '' }; setFiltro(v); cargar(v); }}>Limpiar</button>
          )}
        </div>
        {notas.length === 0 ? (
          <EmptyState
            icon="notas_credito"
            title="Sin notas crédito"
            description={puedeCrear ? 'Crea tu primera nota crédito con el botón “+” de arriba.' : 'Aún no hay notas crédito.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° nota</th><th>Factura</th><th>Motivo</th>
                <th style={{ textAlign: 'right' }}>Total</th><th>Estado</th><th>Fecha</th><th></th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id}>
                  <td style={{ fontWeight: 600 }}>{n.numeroNota || '—'}</td>
                  <td className="mini">{n.factura ? numeroFactura(n.factura) : '—'}</td>
                  <td className="mini">{n.motivo || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(n.total || 0)}</td>
                  <td>
                    <span className={`badge ${n.estadoDIAN === 'ACEPTADA' ? 'green' : n.estadoDIAN === 'RECHAZADA' ? 'red' : 'orange'}`}>{n.estadoDIAN || '—'}</span>
                    {n.estadoDIAN === 'ERROR' && (
                      <button type="button" className="btn btn-sm btn-red" style={{ marginLeft: 6 }} disabled={reenviando === n.id} onClick={() => reenviarDian(n)}>
                        {reenviando === n.id ? 'Enviando…' : 'Reintentar'}
                      </button>
                    )}
                    {n.estadoDIAN === 'ACEPTADA' && n.pdfPath && (
                      <a href={n.pdfPath} target="_blank" rel="noreferrer" className="mini" style={{ marginLeft: 6 }}>PDF</a>
                    )}
                  </td>
                  <td className="mini">{dia(n.fecha)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(n)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(n)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar nota crédito' : 'Nueva nota crédito'}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="nc-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="nc-form" onSubmit={guardar}>
            <div className="field">
              <label>Factura *</label>
              <FacturaBuscador facturas={facturas} value={form.facturaId} onSelect={seleccionarFactura} />
            </div>
            {facturaSel && (
              <div className="field">
                <label>Productos facturados</label>
                {(facturaSel.detalle || []).length === 0 ? (
                  <div className="mini" style={{ opacity: .7 }}>Esta factura no tiene detalle de productos.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'center' }}>Cant.</th>
                        <th style={{ textAlign: 'right' }}>Precio venta</th>
                        <th style={{ textAlign: 'right' }}>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturaSel.detalle.map((d) => (
                        <tr key={d.id}>
                          <td>{d.producto?.nombre || '—'}</td>
                          <td style={{ textAlign: 'center' }}>{d.cantidad}</td>
                          <td style={{ textAlign: 'right' }}>{money(d.precioUnitario)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(d.total || d.precioUnitario * d.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={3} style={{ textAlign: 'right' }}>Total factura</th>
                        <th style={{ textAlign: 'right' }}>{money(facturaSel.total)}</th>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>N° nota</label>
                <input value={form.numeroNota} onChange={(e) => set('numeroNota', e.target.value)} />
              </div>
              <div className="field">
                <label>Total</label>
                <input type="number" step="0.01" value={form.total} onChange={(e) => set('total', e.target.value)} />
              </div>
              <div className="field">
                <label>Estado DIAN</label>
                <select value={form.estadoDIAN} onChange={(e) => set('estadoDIAN', e.target.value)}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Motivo</label>
              <input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
