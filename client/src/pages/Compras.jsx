import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = { proveedorId: '', iva: '', total: '' };
const IVA_PCT = 19;
const LINEA = { itemId: '', cantidad: '', costoUnitario: '' };

const dia = (f) => (f ? new Date(f).toLocaleString('es-CO') : '—');
const round2 = (n) => Math.round(n * 100) / 100;

export default function Compras() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'compras.crear');
  const puedeEditar = puede(user, 'compras.editar');
  const puedeEliminar = puede(user, 'compras.eliminar');

  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [lineas, setLineas] = useState([{ ...LINEA }]);
  const [editId, setEditId] = useState(null);
  const [filtro, setFiltro] = useState({ desde: '', hasta: '', proveedorId: '' });
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async (f = filtro) => {
    try {
      const qs = new URLSearchParams();
      if (f.desde) qs.set('desde', f.desde);
      if (f.hasta) qs.set('hasta', f.hasta);
      if (f.proveedorId) qs.set('proveedorId', f.proveedorId);
      const ruta = qs.toString() ? `/compras?${qs}` : '/compras';
      const [c, prov, ins] = await Promise.all([api.get(ruta), api.get('/proveedores'), api.get('/inventario')]);
      setCompras(c);
      setProveedores(prov);
      setInsumos(ins);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const limpiar = () => { setEditId(null); setForm(VACIO); setLineas([{ ...LINEA }]); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  // Subtotal = suma de (cantidad × costo) de todas las líneas
  const subtotal = round2(lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0), 0));
  const ivaCalc = form.iva === '' ? round2(subtotal * IVA_PCT / 100) : Number(form.iva);
  const totalCalc = form.total === '' ? round2(subtotal + ivaCalc) : Number(form.total);

  const setLinea = (i, campo, valor) => setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  // Al elegir insumo, precarga su costo si la línea no tiene costo aún
  const setInsumo = (i, itemId) => setLineas((ls) => ls.map((l, idx) => {
    if (idx !== i) return l;
    const ins = insumos.find((x) => String(x.id) === String(itemId));
    return { ...l, itemId, costoUnitario: l.costoUnitario === '' && ins ? String(ins.costo ?? '') : l.costoUnitario };
  }));
  const agregarLinea = () => setLineas((ls) => [...ls, { ...LINEA }]);
  const quitarLinea = (i) => setLineas((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const empezarEdicion = (c) => {
    setEditId(c.id);
    setForm({
      proveedorId: c.proveedorId || '',
      iva: c.iva != null ? String(c.iva) : '',
      total: c.total != null ? String(c.total) : '',
    });
    setLineas(c.detalle?.length
      ? c.detalle.map((d) => ({ itemId: d.itemId != null ? String(d.itemId) : '', cantidad: String(d.cantidad), costoUnitario: String(d.costoUnitario) }))
      : [{ ...LINEA }]);
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    const detalle = lineas
      .filter((l) => l.itemId && Number(l.cantidad) > 0)
      .map((l) => ({ itemId: Number(l.itemId), cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario) || 0 }));
    if (!detalle.length) return notify('Agrega al menos una línea con insumo y cantidad', 'err');
    const payload = {
      proveedorId: form.proveedorId || null,
      subtotal,
      iva: ivaCalc,
      total: totalCalc,
      detalle,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/compras/${editId}`, payload);
        notify('Compra actualizada');
      } else {
        await api.post('/compras', payload);
        notify('Compra registrada · stock actualizado');
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

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la compra de ${money(c.total || 0)}? Se revertirá el stock.`)) return;
    try {
      await api.del(`/compras/${c.id}`);
      notify('Compra eliminada · stock revertido');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const totalCompras = compras.reduce((s, c) => s + (c.total || 0), 0);

  return (
    <div>
      <PageHeader
        title="Compras a proveedores"
        subtitle="Registra compras de insumos; el stock se actualiza automáticamente."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nueva compra" />}
      />

      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Desde</label>
            <input type="date" value={filtro.desde} onChange={(e) => setFiltro((f) => ({ ...f, desde: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input type="date" value={filtro.hasta} onChange={(e) => setFiltro((f) => ({ ...f, hasta: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Proveedor</label>
            <select value={filtro.proveedorId} onChange={(e) => setFiltro((f) => ({ ...f, proveedorId: e.target.value }))}>
              <option value="">Todos</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="button" onClick={cargar}>Filtrar</button>
          {(filtro.desde || filtro.hasta || filtro.proveedorId) && (
            <button className="btn" type="button" onClick={() => { const v = { desde: '', hasta: '', proveedorId: '' }; setFiltro(v); cargar(v); }}>Limpiar</button>
          )}
          <span style={{ marginLeft: 'auto', fontWeight: 700 }}>Total: {money(totalCompras)}</span>
        </div>
        {compras.length === 0 ? (
          <EmptyState
            icon="compras"
            title="Sin compras"
            description={puedeCrear ? 'Registra tu primera compra con el botón “+” de arriba.' : 'Aún no hay compras.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Proveedor</th><th>Insumos</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th><th style={{ textAlign: 'right' }}>IVA</th>
                <th style={{ textAlign: 'right' }}>Total</th><th>Fecha</th><th></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.proveedor?.nombre || '—'}</td>
                  <td className="mini">{c.detalle?.length ? c.detalle.map((d) => `${d.item?.nombre || '?'} ×${d.cantidad}`).join(', ') : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(c.subtotal || 0)}</td>
                  <td style={{ textAlign: 'right' }}>{money(c.iva || 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.total || 0)}</td>
                  <td className="mini">{dia(c.fecha)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(c)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(c)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar compra' : 'Nueva compra'}
          onClose={cerrarModal}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="compra-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Registrar'}</Button>
            </>
          )}
        >
          <form id="compra-form" onSubmit={guardar}>
            <div className="field">
              <label>Proveedor</label>
              <select value={form.proveedorId} onChange={(e) => set('proveedorId', e.target.value)}>
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.nit ? ` · ${p.nit}` : ''}</option>)}
              </select>
            </div>

            <label>Insumos</label>
            <table style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Cant.</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Costo unit.</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Importe</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select value={l.itemId} onChange={(e) => setInsumo(i, e.target.value)} style={{ minWidth: 150 }}>
                        <option value="">— Selecciona —</option>
                        {insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad}) · stock {x.stock}</option>)}
                      </select>
                    </td>
                    <td><input type="number" step="0.01" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.01" value={l.costoUnitario} onChange={(e) => setLinea(i, 'costoUnitario', e.target.value)} style={{ width: 110, textAlign: 'right' }} /></td>
                    <td style={{ textAlign: 'right' }}>{money((Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0))}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-red btn-sm" type="button" title="Quitar" onClick={() => quitarLinea(i)}><Icon name="close" size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-sm" type="button" onClick={agregarLinea}>+ Agregar línea</button>

            <div style={{ display: 'flex', marginTop: 16 }}>
              <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 220 }}>
                <div className="total-line"><span>Subtotal&nbsp;&nbsp;</span><span>{money(subtotal)}</span></div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>IVA ({IVA_PCT}%)</label>
                  <input type="number" step="0.01" value={form.iva} placeholder={String(round2(subtotal * IVA_PCT / 100))} onChange={(e) => set('iva', e.target.value)} style={{ textAlign: 'right' }} />
                </div>
                <div className="field">
                  <label>Total</label>
                  <input type="number" step="0.01" value={form.total} placeholder={String(totalCalc)} onChange={(e) => set('total', e.target.value)} style={{ textAlign: 'right' }} />
                </div>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
