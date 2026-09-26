import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

export default function Bodegas() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'bodegas.crear');
  const puedeEditar = puede(user, 'bodegas.editar');
  const puedeEliminar = puede(user, 'bodegas.eliminar');

  const [bodegas, setBodegas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [existencias, setExistencias] = useState([]);

  // Form de bodega
  const [nombreBodega, setNombreBodega] = useState('');
  const [editBodegaId, setEditBodegaId] = useState(null);
  const [modalBodega, setModalBodega] = useState(false);
  const [modalExistencia, setModalExistencia] = useState(false);

  // Bodega seleccionada para ver/gestionar existencias
  const [bodegaSel, setBodegaSel] = useState('');

  // Form de existencia
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');

  const cargarBase = async () => {
    try {
      const [bs, ps] = await Promise.all([api.get('/bodegas'), api.get('/productos')]);
      setBodegas(bs);
      setProductos(ps);
      if (!bodegaSel && bs.length) setBodegaSel(bs[0].id);
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const cargarExistencias = async (bodegaId) => {
    if (!bodegaId) { setExistencias([]); return; }
    try {
      setExistencias(await api.get(`/existencias?bodegaId=${bodegaId}`));
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  useEffect(() => { cargarBase(); }, []);
  useEffect(() => { cargarExistencias(bodegaSel); }, [bodegaSel]);

  // Bodega CRUD
  const limpiarBodega = () => { setEditBodegaId(null); setNombreBodega(''); setModalBodega(false); };
  const nuevaBodega = () => { setEditBodegaId(null); setNombreBodega(''); setModalBodega(true); };

  const guardarBodega = async (e) => {
    e.preventDefault();
    const payload = { nombre: nombreBodega.trim() };
    if (!payload.nombre) return notify('El nombre es obligatorio', 'err');
    try {
      if (editBodegaId) {
        await api.put(`/bodegas/${editBodegaId}`, payload);
        notify('Bodega actualizada');
      } else {
        const nueva = await api.post('/bodegas', payload);
        notify('Bodega creada');
        setBodegaSel(nueva.id);
      }
      limpiarBodega();
      cargarBase();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const editarBodega = (b) => { setEditBodegaId(b.id); setNombreBodega(b.nombre); setModalBodega(true); };

  const eliminarBodega = async (b) => {
    if (!confirm(`¿Eliminar la bodega "${b.nombre}"? Se perderán sus existencias.`)) return;
    try {
      await api.del(`/bodegas/${b.id}`);
      notify('Bodega eliminada');
      if (bodegaSel === b.id) setBodegaSel('');
      cargarBase();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  // Existencias
  const productosDisponibles = useMemo(() => {
    const usados = new Set(existencias.map((x) => x.productoId));
    return productos.filter((p) => !usados.has(p.id));
  }, [productos, existencias]);

  const agregarExistencia = async (e) => {
    e.preventDefault();
    if (!bodegaSel) return notify('Selecciona una bodega', 'err');
    if (!productoId) return notify('Selecciona un producto', 'err');
    try {
      await api.post('/existencias', {
        bodegaId: bodegaSel,
        productoId,
        cantidad: Number(cantidad) || 0,
      });
      notify('Existencia agregada');
      setProductoId(''); setCantidad('');
      setModalExistencia(false);
      cargarExistencias(bodegaSel);
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const ajustar = async (ex, delta) => {
    try {
      await api.post(`/existencias/${ex.id}/ajuste`, { cantidad: delta });
      cargarExistencias(bodegaSel);
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminarExistencia = async (ex) => {
    if (!confirm(`¿Quitar "${ex.producto?.nombre}" de esta bodega?`)) return;
    try {
      await api.del(`/existencias/${ex.id}`);
      notify('Existencia eliminada');
      cargarExistencias(bodegaSel);
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Bodegas y existencias"
        subtitle="Gestiona tus bodegas y el stock de productos en cada una."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={nuevaBodega} title="Nueva bodega" />}
      />
      <div className="grid-aside">
        {/* Columna de bodegas */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bodegas</h3>
          <table>
            <thead><tr><th>Nombre</th><th></th></tr></thead>
            <tbody>
              {bodegas.map((b) => (
                <tr key={b.id} className={bodegaSel === b.id ? 'fila-activa' : undefined}>
                  <td style={{ cursor: 'pointer', fontWeight: bodegaSel === b.id ? 600 : 400 }} onClick={() => setBodegaSel(b.id)}>{b.nombre}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editarBodega(b)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminarBodega(b)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
              {!bodegas.length && <tr><td colSpan={2} className="empty">No hay bodegas.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Columna de existencias */}
        <div className="card">
          <div className="row between" style={{ marginBottom: bodegaSel ? 12 : 0, gap: 12 }}>
            <h3 style={{ margin: 0 }}>
              Existencias
              {bodegaSel && <> — {bodegas.find((b) => b.id === bodegaSel)?.nombre}</>}
            </h3>
            {bodegaSel && puedeCrear && (
              <Button variant="secondary" size="sm" icon="add" onClick={() => { setProductoId(''); setCantidad(''); setModalExistencia(true); }}>Agregar producto</Button>
            )}
          </div>
          {!bodegaSel && <EmptyState icon="bodegas" title="Selecciona una bodega" description="Elige una bodega de la izquierda para ver y gestionar sus existencias." />}

          {bodegaSel && (
            <table>
              <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Cantidad</th><th></th></tr></thead>
              <tbody>
                {existencias.map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.producto?.nombre || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{ex.cantidad}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {puedeEditar && (
                        <>
                          <button className="btn btn-sm" title="-1" onClick={() => ajustar(ex, -1)}>−</button>{' '}
                          <button className="btn btn-sm" title="+1" onClick={() => ajustar(ex, 1)}>＋</button>{' '}
                        </>
                      )}
                      {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminarExistencia(ex)}><Icon name="delete" size={16} /></button>}
                    </td>
                  </tr>
                ))}
                {!existencias.length && <tr><td colSpan={3} className="empty">Sin existencias en esta bodega.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(puedeCrear || puedeEditar) && modalBodega && (
        <Modal
          title={editBodegaId ? 'Editar bodega' : 'Nueva bodega'}
          onClose={limpiarBodega}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={limpiarBodega}>Cancelar</Button>
              <Button variant="primary" type="submit" form="bodega-form">{editBodegaId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="bodega-form" onSubmit={guardarBodega}>
            <div className="field">
              <label>Nombre de la bodega</label>
              <input placeholder="Ej. Bodega principal" value={nombreBodega} onChange={(e) => setNombreBodega(e.target.value)} autoFocus />
            </div>
          </form>
        </Modal>
      )}

      {bodegaSel && puedeCrear && modalExistencia && (
        <Modal
          title="Agregar producto a la bodega"
          onClose={() => setModalExistencia(false)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setModalExistencia(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="exist-form">Agregar</Button>
            </>
          )}
        >
          <form id="exist-form" onSubmit={agregarExistencia}>
            <div className="field">
              <label>Producto</label>
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {productosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Cantidad</label>
              <input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
