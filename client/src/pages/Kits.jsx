import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

// Gestiona la receta (insumos de inventario) de los productos marcados como kit.
// El alta/edición de datos generales del producto (nombre, precio, foto...) vive en Productos.

// Selector con búsqueda (evita desplazarse por cientos de opciones en un <select>); sirve
// tanto para elegir el producto del kit como los insumos de la receta.
// Usa position:fixed calculada a mano (en vez de absolute) para que la lista no quede recortada
// por el scroll interno del modal y siempre se pueda ver completa con su propio scroll.
function BuscadorConFiltro({ opciones, value, onChange, placeholder = 'Selecciona...', disabled = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const sel = opciones.find((it) => String(it.id) === String(value));
  const filtro = q.trim().toLowerCase();
  const lista = filtro ? opciones.filter((it) => (it.nombre || '').toLowerCase().includes(filtro)) : opciones;

  const abrir = () => {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const reposicionar = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    window.addEventListener('scroll', reposicionar, true);
    window.addEventListener('resize', reposicionar);
    return () => {
      window.removeEventListener('scroll', reposicionar, true);
      window.removeEventListener('resize', reposicionar);
    };
  }, [open]);

  return (
    <div className="cliente-picker" style={{ flex: 2, minWidth: 140 }}>
      <button
        type="button"
        ref={btnRef}
        className="cliente-picker-btn"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : abrir())}
      >
        <span className="cliente-picker-txt">{sel?.nombre || placeholder}</span>
        <span className="nav-caret" aria-hidden>▾</span>
      </button>
      {open && pos && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="cliente-picker-pop" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, right: 'auto' }}>
            <input
              autoFocus
              className="cliente-picker-search"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              {lista.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`cliente-picker-item ${String(it.id) === String(value) ? 'activo' : ''}`}
                  onClick={() => { onChange(String(it.id)); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{it.nombre}</span>
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

export default function Kits() {
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [receta, setReceta] = useState([]); // [{ itemId, cantidad }]
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [ps, its] = await Promise.all([api.get('/productos'), api.get('/inventario')]);
      setProductos(ps);
      setInsumos(its);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const kits = useMemo(() => productos.filter((p) => p.componentes?.length > 0), [productos]);
  const disponiblesParaKit = useMemo(() => productos.filter((p) => !p.componentes?.length), [productos]);

  const agregarLinea = () => setReceta([...receta, { itemId: '', cantidad: 1 }]);
  const actualizarLinea = (i, campo, valor) =>
    setReceta(receta.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  const quitarLinea = (i) => setReceta(receta.filter((_, idx) => idx !== i));

  const abrirNuevo = () => {
    setProductoId('');
    setReceta([{ itemId: '', cantidad: 1 }]);
    setModalAbierto(true);
  };

  const editar = (p) => {
    setProductoId(p.id);
    setReceta((p.componentes || []).map((c) => ({ itemId: String(c.itemId), cantidad: c.cantidad })));
    setModalAbierto(true);
  };

  const cerrarModal = () => { setModalAbierto(false); setProductoId(''); setReceta([]); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!productoId) return notify('Selecciona un producto', 'err');
    const componentes = receta.filter((l) => l.itemId).map((l) => ({ itemId: Number(l.itemId), cantidad: Number(l.cantidad) || 1 }));
    if (componentes.length === 0) return notify('Agrega al menos un insumo', 'err');
    try {
      setGuardando(true);
      await api.put(`/productos/${productoId}`, { componentes });
      notify('Kit guardado');
      cerrarModal();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const quitarReceta = async (p) => {
    if (!confirm(`¿Quitar la receta de "${p.nombre}"? Volverá a ser un producto simple.`)) return;
    try {
      await api.put(`/productos/${p.id}`, { componentes: [] });
      notify('Receta eliminada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Kits"
        subtitle="Un kit es un producto armado con insumos de inventario. Ej: Hamburguesa = bollo + carne."
        actions={<Button variant="primary" icon="add" onClick={abrirNuevo} title="Nuevo kit" />}
      />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {kits.length === 0 ? (
          <EmptyState
            icon="kits"
            title="Sin kits"
            description="Arma tu primer kit con el botón “+” de arriba."
          />
        ) : (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Insumos</th>
                <th style={{ width: 90 }}>Disp.</th>
                <th style={{ width: 76 }}></th>
              </tr>
            </thead>
            <tbody>
              {kits.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.nombre}</td>
                  <td>
                    <div className="mini" style={{ maxHeight: 44, overflowY: 'auto', lineHeight: 1.6 }}>
                      {p.componentes.map((c, i) => (
                        <span key={c.id}>
                          {c.cantidad}× {c.item?.nombre}
                          {i < p.componentes.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{p.disponibles != null && <span className="badge green">{p.disponibles}</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" title="Editar receta" onClick={() => editar(p)}><Icon name="edit" size={16} /></button>
                      <button className="btn btn-red btn-sm" title="Quitar receta" onClick={() => quitarReceta(p)}><Icon name="delete" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {modalAbierto && (
        <Modal
          title={productoId && kits.some((k) => k.id === productoId) ? 'Editar receta' : 'Nuevo kit'}
          onClose={cerrarModal}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="kit-form" loading={guardando}>Guardar kit</Button>
            </>
          )}
        >
          <form id="kit-form" onSubmit={guardar}>
            <div className="field">
              <label>Producto *</label>
              <BuscadorConFiltro
                opciones={kits.some((k) => k.id === productoId) ? productos : disponiblesParaKit}
                value={productoId}
                onChange={setProductoId}
                placeholder="Selecciona un producto..."
                disabled={kits.some((k) => k.id === productoId)}
              />
              <p className="mini" style={{ marginTop: 4 }}>Solo se listan productos que aún no tienen receta. Crea el producto primero en el módulo Productos.</p>
            </div>

            <label>Receta (insumos del kit)</label>
            {receta.map((l, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <BuscadorConFiltro opciones={insumos} value={l.itemId} onChange={(v) => actualizarLinea(i, 'itemId', v)} placeholder="Insumo..." />
                <input
                  style={{ flex: 1, minWidth: 90 }}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, 'cantidad', e.target.value)}
                />
                <button type="button" className="btn btn-red btn-sm" title="Quitar" onClick={() => quitarLinea(i)}><Icon name="close" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ marginTop: 4 }} onClick={agregarLinea}>+ Agregar insumo</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
