import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const TIPOS = ['ENTRADA', 'SALIDA', 'AJUSTE'];

export default function Movimientos() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'movimientos.crear');
  const puedeEliminar = puede(user, 'movimientos.eliminar');

  const [movimientos, setMovimientos] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [productos, setProductos] = useState([]);

  // Filtros
  const [fBodega, setFBodega] = useState('');
  const [fTipo, setFTipo] = useState('');

  // Form
  const [bodegaId, setBodegaId] = useState('');
  const [productoId, setProductoId] = useState('');
  const [tipoMovimiento, setTipoMovimiento] = useState('ENTRADA');
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [documentoReferencia, setDocumentoReferencia] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargarBase = async () => {
    try {
      const [bs, ps] = await Promise.all([api.get('/bodegas'), api.get('/productos')]);
      setBodegas(bs);
      setProductos(ps);
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const cargarMovimientos = async () => {
    try {
      const qs = new URLSearchParams();
      if (fBodega) qs.set('bodegaId', fBodega);
      if (fTipo) qs.set('tipoMovimiento', fTipo);
      const q = qs.toString();
      setMovimientos(await api.get(`/movimientos${q ? `?${q}` : ''}`));
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  useEffect(() => { cargarBase(); }, []);
  useEffect(() => { cargarMovimientos(); }, [fBodega, fTipo]);

  const limpiar = () => {
    setProductoId(''); setCantidad(''); setCostoUnitario(''); setDocumentoReferencia('');
  };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); };

  const registrar = async (e) => {
    e.preventDefault();
    if (!bodegaId) return notify('Selecciona una bodega', 'err');
    if (!productoId) return notify('Selecciona un producto', 'err');
    if (!(Number(cantidad) > 0)) return notify('La cantidad debe ser mayor a 0', 'err');
    try {
      setGuardando(true);
      await api.post('/movimientos', {
        bodegaId,
        productoId,
        tipoMovimiento,
        cantidad: Number(cantidad),
        costoUnitario: Number(costoUnitario) || 0,
        documentoReferencia: documentoReferencia || null,
      });
      notify('Movimiento registrado');
      setModalAbierto(false);
      limpiar();
      cargarMovimientos();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (m) => {
    if (!confirm('¿Eliminar este movimiento? Se revertirá su efecto en el stock.')) return;
    try {
      await api.del(`/movimientos/${m.id}`);
      notify('Movimiento eliminado');
      cargarMovimientos();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const fmtFecha = (f) => new Date(f).toLocaleString();

  return (
    <div>
      <PageHeader
        title="Movimientos de inventario"
        subtitle="Entradas, salidas y ajustes de stock por bodega."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Registrar movimiento" />}
      />

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mini" style={{ fontWeight: 600 }}>Filtros:</span>
          <select value={fBodega} onChange={(e) => setFBodega(e.target.value)} style={{ width: 'auto', minWidth: 170 }}>
            <option value="">Todas las bodegas</option>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {movimientos.length === 0 ? (
          <EmptyState
            icon="movimientos"
            title="Sin movimientos"
            description={puedeCrear ? 'Registra un movimiento de inventario con el botón de arriba.' : 'Aún no hay movimientos.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Tipo</th><th>Producto / Insumo</th><th>Bodega</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Costo unit.</th><th>Documento</th><th></th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="mini">{fmtFecha(m.fecha)}</td>
                  <td><span className={`badge ${m.tipoMovimiento === 'ENTRADA' ? 'green' : m.tipoMovimiento === 'SALIDA' ? 'red' : 'gray'}`}>{m.tipoMovimiento}</span></td>
                  <td>
                    {m.producto?.nombre
                      ? m.producto.nombre
                      : m.item?.nombre
                        ? <span>{m.item.nombre} <span className="mini">(insumo)</span></span>
                        : '—'}
                  </td>
                  <td>{m.bodega?.nombre || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{m.cantidad}</td>
                  <td style={{ textAlign: 'right' }}>{money(m.costoUnitario)}</td>
                  <td className="mini">{m.documentoReferencia || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(m)}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {puedeCrear && modalAbierto && (
        <Modal
          title="Registrar movimiento"
          subtitle="ENTRADA suma al stock, SALIDA resta, AJUSTE suma (usa cantidad negativa para restar)."
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="mov-form" loading={guardando}>Registrar</Button>
            </>
          )}
        >
          <form id="mov-form" onSubmit={registrar}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Bodega *</label>
                <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Producto *</label>
                <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tipo</label>
                <select value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Cantidad *</label>
                <input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>
              <div className="field">
                <label>Costo unitario</label>
                <input type="number" step="any" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />
              </div>
              <div className="field">
                <label>Documento de referencia</label>
                <input value={documentoReferencia} onChange={(e) => setDocumentoReferencia(e.target.value)} />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
