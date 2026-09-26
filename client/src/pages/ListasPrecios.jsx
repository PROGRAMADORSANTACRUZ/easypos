import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useAuth, useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

export default function ListasPrecios() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'listas_precios.crear');
  const puedeEditar = puede(user, 'listas_precios.editar');
  const puedeEliminar = puede(user, 'listas_precios.eliminar');

  const [listas, setListas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ nombre: '', descripcion: '', activo: true });
  const [editId, setEditId] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [seleccion, setSeleccion] = useState(null); // lista con su detalle (precios)
  const [busqueda, setBusqueda] = useState('');
  const [borradores, setBorradores] = useState({}); // productoId -> valor de input

  const cargar = async () => {
    try {
      const [ls, ps] = await Promise.all([api.get('/listas-precios'), api.get('/productos')]);
      setListas(ls);
      setProductos(ps);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const limpiar = () => { setEditId(null); setForm({ nombre: '', descripcion: '', activo: true }); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return notify('El nombre es obligatorio', 'err');
    const payload = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, activo: form.activo };
    try {
      setGuardando(true);
      if (editId) { await api.put(`/listas-precios/${editId}`, payload); notify('Lista actualizada'); }
      else { await api.post('/listas-precios', payload); notify('Lista creada'); }
      setModalAbierto(false);
      limpiar();
      await cargar();
    } catch (err) { notify(err.message, 'err'); } finally { setGuardando(false); }
  };

  const editar = (l) => { setEditId(l.id); setForm({ nombre: l.nombre || '', descripcion: l.descripcion || '', activo: l.activo !== false }); setModalAbierto(true); };

  const eliminar = async (l) => {
    if (!confirm('¿Eliminar lista de precios?')) return;
    try {
      await api.del(`/listas-precios/${l.id}`);
      notify('Lista eliminada');
      if (seleccion?.id === l.id) setSeleccion(null);
      await cargar();
    } catch (err) { notify(err.message, 'err'); }
  };

  const abrirDetalle = async (l) => {
    try {
      const detalle = await api.get(`/listas-precios/${l.id}`);
      setSeleccion(detalle);
      const b = {};
      (detalle.precios || []).forEach((p) => { b[p.productoId] = String(p.precio ?? ''); });
      setBorradores(b);
      setBusqueda('');
    } catch (err) { notify(err.message, 'err'); }
  };

  const lineaDe = (productoId) => (seleccion?.precios || []).find((p) => p.productoId === productoId);

  const guardarPrecio = async (producto) => {
    const raw = borradores[producto.id];
    if (raw === undefined || raw === '') return notify('Escribe un precio', 'err');
    try {
      await api.post(`/listas-precios/${seleccion.id}/precios`, { productoId: producto.id, precio: Number(raw) });
      notify(`Precio de ${producto.nombre} guardado`);
      await abrirDetalle(seleccion);
      await cargar();
    } catch (err) { notify(err.message, 'err'); }
  };

  const quitarPrecio = async (producto) => {
    const linea = lineaDe(producto.id);
    if (!linea) return;
    try {
      await api.del(`/listas-precios/${seleccion.id}/precios/${linea.id}`);
      notify(`Precio de ${producto.nombre} quitado`);
      await abrirDetalle(seleccion);
      await cargar();
    } catch (err) { notify(err.message, 'err'); }
  };

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => (p.nombre || '').toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q));
  }, [productos, busqueda]);

  return (
    <div>
      <PageHeader
        title="Listas de precios"
        subtitle="Listas de precios (mayorista, minorista, etc.) y su precio por producto."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nueva lista" />}
      />

      <div className="card">
        {listas.length === 0 ? (
          <EmptyState
            icon="listas_precios"
            title="Sin listas"
            description={puedeCrear ? 'Crea tu primera lista de precios con el botón “+” de arriba.' : 'Aún no hay listas.'}
          />
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Descripción</th><th>Productos</th><th>Activa</th><th></th></tr>
            </thead>
            <tbody>
              {listas.map((l) => (
                <tr key={l.id} className={seleccion?.id === l.id ? 'fila-activa' : undefined}>
                  <td style={{ fontWeight: 600 }}>{l.nombre}</td>
                  <td className="mini">{l.descripcion || '—'}</td>
                  <td>{l._count?.precios ?? 0}</td>
                  <td>{l.activo ? <span className="badge green">Sí</span> : <span className="badge gray">No</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" title="Precios" onClick={() => abrirDetalle(l)}><Icon name="price" size={16} /></button>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editar(l)} style={{ marginLeft: 6 }}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(l)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar lista' : 'Nueva lista'}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="lista-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="lista-form" onSubmit={guardar}>
            <div className="field">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={150} />
            </div>
            <div className="field">
              <label>Descripción</label>
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
            <div className="field">
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={!!form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                <span className="mini">Activa</span>
              </label>
            </div>
          </form>
        </Modal>
      )}

      {seleccion && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Precios · {seleccion.nombre}</h3>
            <button className="btn btn-sm" onClick={() => setSeleccion(null)}>Cerrar</button>
          </div>
          <div className="field" style={{ maxWidth: 320, marginTop: 12 }}>
            <input placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          {productosFiltrados.length === 0 ? (
            <p className="empty">Sin productos.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Precio base</th>
                  <th style={{ textAlign: 'right' }}>Precio en lista</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p) => {
                  const linea = lineaDe(p.id);
                  return (
                    <tr key={p.id} className={linea ? 'fila-activa' : undefined}>
                      <td>{p.nombre}{p.codigo ? <span className="mini"> · {p.codigo}</span> : null}</td>
                      <td style={{ textAlign: 'right' }}>{money(Number(p.precio || 0))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 120, textAlign: 'right' }}
                          value={borradores[p.id] ?? ''}
                          onChange={(e) => setBorradores({ ...borradores, [p.id]: e.target.value })}
                          disabled={!puedeEditar}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {puedeEditar && <button className="btn btn-sm" title="Guardar precio" onClick={() => guardarPrecio(p)}><Icon name="save" size={16} /></button>}
                        {puedeEditar && linea && <button className="btn btn-red btn-sm" title="Quitar de la lista" onClick={() => quitarPrecio(p)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
