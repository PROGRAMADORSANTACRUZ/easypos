import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [costo, setCosto] = useState('');
  const [impuestoId, setImpuestoId] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [foto, setFoto] = useState('');      // data URL de la imagen
  const [editId, setEditId] = useState(null); // producto en edicion (null = nuevo)
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [ps, cats, imps, unis] = await Promise.all([
        api.get('/productos'),
        api.get('/productos/categorias'),
        api.get('/impuestos').catch(() => []),
        api.get('/unidades-medida').catch(() => []),
      ]);
      setProductos(ps);
      setCategorias(cats);
      setImpuestos(imps.filter((i) => i.activo !== false));
      setUnidades(unis.filter((u) => u.activo !== false));
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  // Convierte un archivo de imagen a data URL para guardarlo con el producto
  const elegirFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) return notify('La imagen es muy grande (máx 1.5MB)', 'err');
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result);
    reader.readAsDataURL(file);
  };

  const limpiarForm = () => {
    setEditId(null); setNombre(''); setPrecio(''); setCodigo(''); setCodigoBarras('');
    setDescripcion(''); setCosto(''); setImpuestoId(''); setUnidadId(''); setStockMinimo(''); setCategoriaId(''); setFoto('');
  };
  const abrirNuevo = () => { limpiarForm(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiarForm(); };

  const editar = (p) => {
    setEditId(p.id);
    setNombre(p.nombre);
    setPrecio(String(p.precio));
    setCodigo(p.codigo || '');
    setCodigoBarras(p.codigoBarras || '');
    setDescripcion(p.descripcion || '');
    setCosto(p.costo != null ? String(p.costo) : '');
    setImpuestoId(p.impuestoId ? String(p.impuestoId) : '');
    setUnidadId(p.unidadId ? String(p.unidadId) : '');
    setStockMinimo(p.stockMinimo != null ? String(p.stockMinimo) : '');
    setCategoriaId(p.categoriaId ? String(p.categoriaId) : '');
    setFoto(p.foto || '');
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    const payload = {
      nombre,
      precio: Number(precio),
      codigo: codigo || null,
      codigoBarras: codigoBarras || null,
      descripcion: descripcion || null,
      costo: Number(costo) || 0,
      impuestoId: impuestoId || null,
      unidadId: unidadId || null,
      stockMinimo: Number(stockMinimo) || 0,
      categoriaId: categoriaId || null,
      foto: foto || null,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/productos/${editId}`, payload);
        notify('Producto actualizado');
      } else {
        await api.post('/productos', payload);
        notify('Producto creado');
      }
      setModalAbierto(false);
      limpiarForm();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await api.del(`/productos/${p.id}`);
      notify('Producto eliminado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = q
    ? productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q))
    : productos;

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Catálogo de productos vendibles. Para armar la receta (insumos) de un kit, ve al módulo Kits."
        actions={<Button variant="primary" icon="add" onClick={abrirNuevo} title="Nuevo producto" />}
      />

      <div style={{ maxWidth: 360, marginBottom: 10 }}>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por referencia o nombre…"
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {productos.length === 0 ? (
          <EmptyState
            icon="productos"
            title="Sin productos"
            description="Crea tu primer producto o kit con el botón “+” de arriba."
          />
        ) : filtrados.length === 0 ? (
          <EmptyState icon="productos" title="Sin resultados" description="Ningún producto coincide con la búsqueda." />
        ) : (
          <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Ref.</th>
                <th>Nombre</th>
                <th style={{ width: 90 }}>Precio</th>
                <th style={{ width: 90 }}>Costo</th>
                <th style={{ width: 70 }}>IVA</th>
                <th style={{ width: 90 }}>Stock mín.</th>
                <th style={{ width: 76 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td className="mini">{p.codigo || '—'}</td>
                  <td>
                    {p.nombre}
                    {p.esKit && <span className="badge blue" style={{ marginLeft: 6 }}>KIT</span>}
                  </td>
                  <td>{money(p.precio)}</td>
                  <td className="mini">{money(p.costo)}</td>
                  <td className="mini">{p.iva}%</td>
                  <td className="mini">{p.stockMinimo}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" title="Editar" onClick={() => editar(p)}><Icon name="edit" size={16} /></button>
                      <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(p)}><Icon name="delete" size={16} /></button>
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
          title={editId ? 'Editar producto' : 'Nuevo producto'}
          onClose={cerrarModal}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="prod-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear producto'}</Button>
            </>
          )}
        >
          <form id="prod-form" onSubmit={guardar}>
            <div className="grid form-4col" style={{ gap: 12 }}>
              <div className="field">
                <label>Referencia</label>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="SKU / referencia" />
              </div>
              <div className="field">
                <label>Nombre *</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} required />
              </div>
              <div className="field">
                <label>Código de barras</label>
                <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="EAN / UPC" />
              </div>
              <div className="field">
                <label>Descripción</label>
                <input value={descripcion} onChange={(e) => setDescripcion(e.target.value.toUpperCase())} placeholder="Descripción del producto" />
              </div>
            </div>
            <div className="grid form-4col" style={{ gap: 12 }}>
              <div className="field">
                <label>Precio de venta *</label>
                <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
              </div>
              <div className="field">
                <label>Costo</label>
                <input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>Impuesto (IVA)</label>
                <select value={impuestoId} onChange={(e) => setImpuestoId(e.target.value)}>
                  <option value="">Sin impuesto (0%)</option>
                  {impuestos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.porcentaje}%)</option>)}
                </select>
              </div>
              <div className="field">
                <label>Unidad de medida</label>
                <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                  <option value="">Sin unidad</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
                </select>
              </div>
            </div>
            <div className="grid form-4col" style={{ gap: 12 }}>
              <div className="field">
                <label>Stock mínimo</label>
                <input type="number" step="0.01" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>Categoría</label>
                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Foto (se muestra en las mesas)</label>
              <input type="file" accept="image/*" onChange={elegirFoto} />
              {foto && (
                <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                  <img src={foto} alt="vista previa" className="prod-thumb" />
                  <button type="button" className="btn btn-red btn-sm" onClick={() => setFoto('')}>Quitar foto</button>
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
