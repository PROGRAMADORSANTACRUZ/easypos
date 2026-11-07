import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../App.jsx';
import { Button, EmptyState, LoadingState, Modal, PageHeader } from '../components/ui/index.jsx';

const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 1_000_000;
const fechaHora = (valor) => new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
const formatoCantidad = (valor) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(Number(valor) || 0);

const leerFoto = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ nombre: file.name, data: reader.result });
  reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
  reader.readAsDataURL(file);
});

export default function Bajas() {
  const { user } = useAuth();
  const notify = useToast();
  const puedeCrear = (user?.permisos || []).includes('inventario.crear');
  const puedeAprobar = (user?.permisos || []).includes('inventario.editar');
  const [bajas, setBajas] = useState([]);
  const [opciones, setOpciones] = useState({ bodegas: [], productos: [], insumos: [] });
  const [estado, setEstado] = useState('PENDIENTE');
  const [tipoItem, setTipoItem] = useState('PRODUCTO');
  const [bodegaId, setBodegaId] = useState('');
  const [articuloId, setArticuloId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const [rechazo, setRechazo] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [fotosAbiertas, setFotosAbiertas] = useState(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const [lista, catalogos] = await Promise.all([
        api.get(`/bajas?estado=${estado}`),
        api.get('/bajas/opciones'),
      ]);
      setBajas(lista);
      setOpciones(catalogos);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [estado]);

  const existenciasArticulo = (tipoItem === 'PRODUCTO' ? opciones.productos : opciones.insumos)
    .filter((existencia) => existencia.bodegaId === bodegaId);
  const articuloSeleccionado = existenciasArticulo.find((existencia) => String(tipoItem === 'PRODUCTO' ? existencia.productoId : existencia.itemId) === articuloId);
  const datosArticulo = articuloSeleccionado?.producto || articuloSeleccionado?.item;
  const stockDisponible = articuloSeleccionado?.cantidad ?? articuloSeleccionado?.stock ?? 0;
  const unidad = tipoItem === 'INSUMO' ? datosArticulo?.unidad : null;

  const limpiarFormulario = () => {
    setBodegaId('');
    setArticuloId('');
    setCantidad('');
    setNotas('');
    setFotos([]);
  };

  const cambiarTipo = (tipo) => {
    setTipoItem(tipo);
    setBodegaId('');
    setArticuloId('');
    setCantidad('');
  };

  const seleccionarFotos = async (event) => {
    const input = event.currentTarget;
    const archivos = Array.from(input.files || []);
    input.value = '';
    if (fotos.length + archivos.length > MAX_FOTOS) return notify(`Puedes adjuntar hasta ${MAX_FOTOS} fotos`, 'err');
    if (archivos.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      return notify('Usa fotos JPG, PNG o WEBP', 'err');
    }
    if (archivos.some((file) => file.size > MAX_BYTES_FOTO)) return notify('Cada foto debe pesar máximo 1 MB', 'err');
    try {
      const nuevas = await Promise.all(archivos.map(leerFoto));
      setFotos((actuales) => [...actuales, ...nuevas]);
    } catch (error) {
      notify(error.message, 'err');
    }
  };

  const registrar = async (event) => {
    event.preventDefault();
    if (!bodegaId) return notify('Selecciona una bodega', 'err');
    if (!articuloSeleccionado) return notify('Selecciona un producto o insumo con existencia', 'err');
    if (!(Number(cantidad) > 0) || Number(cantidad) > stockDisponible) return notify('La cantidad debe ser mayor a cero y no superar el stock disponible', 'err');
    if (!fotos.length) return notify('Adjunta al menos una foto como evidencia', 'err');
    try {
      setGuardando(true);
      await api.post('/bajas', {
        tipoItem,
        ...(tipoItem === 'PRODUCTO' ? { productoId: articuloId } : { itemId: Number(articuloId) }),
        bodegaId,
        cantidad: Number(cantidad),
        notas,
        fotos: fotos.map((foto) => foto.data),
      });
      notify('Solicitud de baja enviada para aprobación');
      limpiarFormulario();
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const aprobar = async (baja) => {
    const nombre = baja.producto?.nombre || baja.item?.nombre || 'artículo';
    if (!window.confirm(`¿Aprobar la baja de ${formatoCantidad(baja.cantidad)} × ${nombre}? Se descontará del inventario.`)) return;
    setProcesando(baja.id);
    try {
      await api.post(`/bajas/${baja.id}/aprobar`, {});
      notify('Baja aprobada e inventario actualizado');
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  const rechazar = async (event) => {
    event.preventDefault();
    if (!rechazo || !respuesta.trim()) return notify('Indica el motivo del rechazo', 'err');
    setProcesando(rechazo.id);
    try {
      await api.post(`/bajas/${rechazo.id}/rechazar`, { respuesta: respuesta.trim() });
      notify('Solicitud rechazada; el inventario no cambió');
      setRechazo(null);
      setRespuesta('');
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  const verFotos = async (baja) => {
    try {
      const resultado = await api.get(`/bajas/${baja.id}/fotos`);
      setFotosAbiertas({ nombre: baja.producto?.nombre || baja.item?.nombre || 'Evidencia de baja', fotos: resultado.fotos });
    } catch (error) {
      notify(error.message, 'err');
    }
  };

  if (cargando && !bajas.length) return <LoadingState label="Cargando bajas de inventario…" />;

  return (
    <div>
      <PageHeader
        title="Bajas de inventario"
        subtitle="Reporta mercancía dañada y controla su descuento con aprobación."
        actions={<Button icon="reload" title="Actualizar" aria-label="Actualizar" onClick={cargar} />}
      />

      {puedeCrear && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Reportar mercancía dañada</h2>
          <form onSubmit={registrar}>
            <div className="field">
              <label>Tipo de artículo</label>
              <div className="row" role="group" aria-label="Tipo de artículo" style={{ gap: 6 }}>
                <Button type="button" variant={tipoItem === 'PRODUCTO' ? 'primary' : 'ghost'} onClick={() => cambiarTipo('PRODUCTO')}>Producto</Button>
                <Button type="button" variant={tipoItem === 'INSUMO' ? 'primary' : 'ghost'} onClick={() => cambiarTipo('INSUMO')}>Insumo</Button>
              </div>
            </div>
            <div className="grid grid-3">
              <div className="field">
                <label htmlFor="baja-bodega">Bodega *</label>
                <select id="baja-bodega" required value={bodegaId} onChange={(event) => { setBodegaId(event.target.value); setArticuloId(''); setCantidad(''); }}>
                  <option value="">Seleccionar bodega</option>
                  {opciones.bodegas.map((bodega) => <option key={bodega.id} value={bodega.id}>{bodega.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="baja-articulo">{tipoItem === 'PRODUCTO' ? 'Producto' : 'Insumo'} *</label>
                <select id="baja-articulo" required value={articuloId} disabled={!bodegaId} onChange={(event) => { setArticuloId(event.target.value); setCantidad(''); }}>
                  <option value="">Seleccionar {tipoItem === 'PRODUCTO' ? 'producto' : 'insumo'}</option>
                  {existenciasArticulo.map((existencia) => {
                    const articulo = existencia.producto || existencia.item;
                    const id = tipoItem === 'PRODUCTO' ? existencia.productoId : existencia.itemId;
                    const stock = existencia.cantidad ?? existencia.stock;
                    return <option key={`${existencia.bodegaId}-${id}`} value={id}>{articulo.nombre} · disponible {formatoCantidad(stock)} {tipoItem === 'INSUMO' ? articulo.unidad : ''}</option>;
                  })}
                </select>
              </div>
              <div className="field">
                <label htmlFor="baja-cantidad">Cantidad a dar de baja *</label>
                <input id="baja-cantidad" type="number" min="0.001" step="any" max={stockDisponible || undefined} required value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
                {articuloSeleccionado && <span className="mini">Disponible: {formatoCantidad(stockDisponible)} {unidad}</span>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="baja-fotos">Fotos de evidencia * (1 a {MAX_FOTOS}, máximo 1 MB cada una)</label>
              <input id="baja-fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-required="true" onChange={seleccionarFotos} />
              {fotos.length > 0 && (
                <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  {fotos.map((foto, indice) => (
                    <div key={`${foto.nombre}-${indice}`} style={{ position: 'relative' }}>
                      <img src={foto.data} alt={foto.nombre} style={{ width: 82, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                      <button type="button" className="btn btn-sm btn-red" aria-label={`Quitar ${foto.nombre}`} title="Quitar foto" onClick={() => setFotos((actuales) => actuales.filter((_, actual) => actual !== indice))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="baja-notas">Notas</label>
              <textarea id="baja-notas" rows={3} maxLength={2000} value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Describe el daño o la causa de la baja" />
            </div>
            <Button type="submit" variant="primary" icon="add" loading={guardando} disabled={guardando}>Enviar para aprobación</Button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Solicitudes</h2>
          <select aria-label="Estado de solicitudes de baja" value={estado} onChange={(event) => setEstado(event.target.value)}>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
            <option value="TODAS">Todas</option>
          </select>
        </div>
        {bajas.length === 0 ? <EmptyState title="Sin solicitudes" description="No hay bajas para este filtro." /> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ minWidth: 900 }}>
              <thead><tr><th>Fecha</th><th>Artículo / notas</th><th>Bodega</th><th>Cantidad</th><th>Reportó</th><th>Estado / decisión</th><th>Evidencia</th><th></th></tr></thead>
              <tbody>{bajas.map((baja) => {
                const propia = baja.solicitadoPorId === user?.id;
                const nombre = baja.producto?.nombre || baja.item?.nombre || 'Artículo';
                const unidadItem = baja.tipoItem === 'INSUMO' ? baja.item?.unidad : null;
                return (
                  <tr key={baja.id}>
                    <td className="mini" style={{ minWidth: 105 }}>{fechaHora(baja.createdAt)}</td>
                    <td style={{ minWidth: 150, maxWidth: 220 }}>
                      <strong>{nombre}</strong>
                      <div className="mini">{baja.tipoItem === 'INSUMO' ? 'Insumo' : 'Producto'}{baja.notas ? ` · ${baja.notas}` : ''}</div>
                    </td>
                    <td>{baja.bodega?.nombre || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoCantidad(baja.cantidad)} {unidadItem}</td>
                    <td style={{ minWidth: 115 }}>{baja.solicitanteNombre}<div className="mini">({baja.solicitanteCuenta})</div></td>
                    <td style={{ minWidth: 120 }}>
                      <span className={`badge ${baja.estado === 'APROBADA' ? 'green' : baja.estado === 'RECHAZADA' ? 'red' : 'orange'}`}>{baja.estado}</span>
                      {baja.decisionNombre && <div className="mini">{baja.decisionNombre} · {fechaHora(baja.decididoAt)}</div>}
                      {baja.respuesta && <div className="mini">{baja.respuesta}</div>}
                    </td>
                    <td><Button size="sm" variant="ghost" icon="eye" title="Ver fotos" aria-label={`Ver fotos de ${nombre}`} onClick={() => verFotos(baja)}>Fotos</Button></td>
                    <td style={{ minWidth: 155, whiteSpace: 'nowrap' }}>
                      {baja.estado === 'PENDIENTE' && puedeAprobar && !propia && <div className="row" style={{ gap: 6 }}>
                        <Button size="sm" variant="success" icon="check" loading={procesando === baja.id} disabled={procesando !== null} onClick={() => aprobar(baja)}>Aprobar</Button>
                        <Button size="sm" variant="danger" icon="close" disabled={procesando !== null} onClick={() => { setRechazo(baja); setRespuesta(''); }}>Rechazar</Button>
                      </div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {rechazo && <Modal title="Rechazar baja" subtitle={rechazo.producto?.nombre || rechazo.item?.nombre || 'Artículo'} onClose={() => { if (!procesando) setRechazo(null); }}
        footer={<><Button variant="ghost" disabled={procesando !== null} onClick={() => setRechazo(null)}>Cancelar</Button>
          <Button variant="danger" icon="close" loading={procesando === rechazo.id} disabled={procesando !== null || !respuesta.trim()} onClick={rechazar}>Confirmar rechazo</Button></>}>
        <form onSubmit={rechazar}>
          <div className="field"><label htmlFor="baja-respuesta">Motivo del rechazo *</label>
            <textarea id="baja-respuesta" rows={3} maxLength={1000} required value={respuesta} onChange={(event) => setRespuesta(event.target.value)} /></div>
        </form>
      </Modal>}

      {fotosAbiertas && <Modal title="Evidencia de baja" subtitle={fotosAbiertas.nombre} onClose={() => setFotosAbiertas(null)}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {fotosAbiertas.fotos.map((foto, indice) => <img key={indice} src={foto} alt={`Evidencia ${indice + 1}`} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 6 }} />)}
        </div>
      </Modal>}
    </div>
  );
}