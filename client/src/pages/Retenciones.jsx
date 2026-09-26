import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = { facturaId: '', tipo: 'RETEFUENTE', base: '', porcentaje: '', valor: '' };

const TIPOS = ['RETEFUENTE', 'RETEIVA', 'RETEICA'];

// Numero visible de una factura: prefijo + consecutivo DIAN o ID corto.
const numeroFactura = (f) => (f?.numeroFactura ? `${f.prefijo || ''}${f.numeroFactura}` : `#${String(f?.id || '').slice(0, 8)}`);
const dia = (f) => (f ? new Date(f).toLocaleString('es-CO') : '—');
// Valor sugerido = base × porcentaje / 100 (redondeado a 2 decimales)
const calcValor = (base, pct) => {
  const b = Number(base), p = Number(pct);
  if (!b || !p) return null;
  return Math.round((b * p / 100) * 100) / 100;
};

export default function Retenciones() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'retenciones.crear');
  const puedeEditar = puede(user, 'retenciones.editar');
  const puedeEliminar = puede(user, 'retenciones.eliminar');

  const [retenciones, setRetenciones] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [filtro, setFiltro] = useState({ desde: '', hasta: '', tipo: '' });
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async (f = filtro) => {
    try {
      const qs = new URLSearchParams();
      if (f.desde) qs.set('desde', f.desde);
      if (f.hasta) qs.set('hasta', f.hasta);
      if (f.tipo) qs.set('tipo', f.tipo);
      const ruta = qs.toString() ? `/retenciones?${qs}` : '/retenciones';
      const [r, fac] = await Promise.all([api.get(ruta), api.get('/facturas')]);
      setRetenciones(r);
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

  const empezarEdicion = (r) => {
    setEditId(r.id);
    setForm({
      facturaId: r.facturaId || '',
      tipo: r.tipo || 'RETEFUENTE',
      base: r.base != null ? String(r.base) : '',
      porcentaje: r.porcentaje != null ? String(r.porcentaje) : '',
      valor: r.valor != null ? String(r.valor) : '',
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.facturaId) return notify('Selecciona la factura', 'err');
    const payload = {
      facturaId: form.facturaId,
      tipo: form.tipo || null,
      base: form.base === '' ? null : Number(form.base),
      porcentaje: form.porcentaje === '' ? null : Number(form.porcentaje),
      valor: form.valor === '' ? null : Number(form.valor),
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/retenciones/${editId}`, payload);
        notify('Retención actualizada');
      } else {
        await api.post('/retenciones', payload);
        notify('Retención creada');
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

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar la retención de ${money(r.valor || 0)}?`)) return;
    try {
      await api.del(`/retenciones/${r.id}`);
      notify('Retención eliminada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const sugerido = calcValor(form.base, form.porcentaje);

  return (
    <div>
      <PageHeader
        title="Retenciones (DIAN)"
        subtitle="Retenciones aplicadas sobre facturas (ReteFuente, ReteIVA, ReteICA)."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nueva retención" />}
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
          <div className="field" style={{ margin: 0 }}>
            <label>Tipo</label>
            <select value={filtro.tipo} onChange={(e) => setFiltro((f) => ({ ...f, tipo: e.target.value }))} style={{ width: 'auto', minWidth: 140 }}>
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="button" onClick={cargar}>Filtrar</button>
          {(filtro.desde || filtro.hasta || filtro.tipo) && (
            <button className="btn" type="button" onClick={() => { const v = { desde: '', hasta: '', tipo: '' }; setFiltro(v); cargar(v); }}>Limpiar</button>
          )}
        </div>
        {retenciones.length === 0 ? (
          <EmptyState
            icon="retenciones"
            title="Sin retenciones"
            description={puedeCrear ? 'Registra tu primera retención con el botón de arriba.' : 'Aún no hay retenciones.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tipo</th><th>Factura</th>
                <th style={{ textAlign: 'right' }}>Base</th><th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Valor</th><th>Fecha</th><th></th>
              </tr>
            </thead>
            <tbody>
              {retenciones.map((r) => (
                <tr key={r.id}>
                  <td><span className="badge gray">{r.tipo || '—'}</span></td>
                  <td className="mini">{r.factura ? numeroFactura(r.factura) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.base != null ? money(r.base) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.porcentaje != null ? `${r.porcentaje}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.valor || 0)}</td>
                  <td className="mini">{dia(r.fecha)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(r)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar retención' : 'Nueva retención'}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="ret-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="ret-form" onSubmit={guardar}>
            <div className="field">
              <label>Factura *</label>
              <select value={form.facturaId} onChange={(e) => set('facturaId', e.target.value)}>
                <option value="">— Selecciona —</option>
                {facturas.map((f) => (
                  <option key={f.id} value={f.id}>{numeroFactura(f)} · {money(f.total)}</option>
                ))}
              </select>
            </div>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Tipo</label>
                <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Base</label>
                <input type="number" step="0.01" value={form.base} onChange={(e) => set('base', e.target.value)} />
              </div>
              <div className="field">
                <label>Porcentaje (%)</label>
                <input type="number" step="0.01" value={form.porcentaje} onChange={(e) => set('porcentaje', e.target.value)} />
              </div>
              <div className="field">
                <label>Valor</label>
                <input type="number" step="0.01" value={form.valor} onChange={(e) => set('valor', e.target.value)} placeholder={sugerido != null ? String(sugerido) : ''} />
                {sugerido != null && form.valor === '' && <span className="mini">Se calculará: {money(sugerido)}</span>}
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
