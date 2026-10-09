import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { LoadingState, PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';
import { formatoDe, estiloPagina, abrirVentanaVacia, escribirEImprimir } from '../print.js';
import { tipoDocumentoListo } from '../tipoDocumentoListo.js';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);
const CENTROS_VACIOS = [];

// Selector de cliente con búsqueda (evita listar cientos de clientes en un <select>).
function ClienteBuscador({ clientes, value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sel = clientes.find((c) => String(c.id) === String(value));
  const filtro = q.trim().toLowerCase();
  const lista = filtro
    ? clientes.filter(
        (c) =>
          (c.nombre || '').toLowerCase().includes(filtro) ||
          (c.documento || '').toLowerCase().includes(filtro)
      )
    : clientes;
  const etiqueta = sel ? `${sel.nombre}${sel.documento ? ` · ${sel.documento}` : ''}` : '— Sin cliente —';
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
              placeholder="Buscar por nombre o documento…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              <button
                type="button"
                className={`cliente-picker-item ${!value ? 'activo' : ''}`}
                onClick={() => { onChange(''); setOpen(false); setQ(''); }}
              >
                <span style={{ fontWeight: 600 }}>— Sin cliente —</span>
              </button>
              {lista.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cliente-picker-item ${String(c.id) === String(value) ? 'activo' : ''}`}
                  onClick={() => { onChange(String(c.id)); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                  {c.documento && <span className="mini"> · {c.documento}</span>}
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

// Escapa texto libre antes de insertarlo en el HTML del ticket (evita inyeccion via nombres/motivo).
const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Imprime un comprobante de cortesia en formato ticket (documento interno, no es factura).
function imprimirCortesia(cortesia) {
  imprimirCortesiaAsync(cortesia);
}
async function imprimirCortesiaAsync(cortesia) {
  if (!cortesia) return;
  const ventana = abrirVentanaVacia(); // debe abrirse ya (sincrono) para que el navegador no bloquee el popup
  const fecha = new Date(cortesia.createdAt || Date.now()).toLocaleString('es-CO');
  const filas = (cortesia.detalle || [])
    .map((d) => {
      const nombre = esc((d.producto?.nombre || '').toUpperCase());
      const importe = money((d.precioUnitario || 0) * d.cantidad);
      return `<tr><td class="c">${d.cantidad}×</td><td class="n">${nombre}</td><td class="p">${importe}</td></tr>`;
    })
    .join('');
  const subtotal = (cortesia.detalle || []).reduce((s, d) => s + (d.precioUnitario || 0) * d.cantidad, 0);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cortesia.numero}</title>
  <style>
    ${estiloPagina(await formatoDe('formatoCortesia'))}
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; font-size: 12px; padding: 3mm 4mm; }
    .titulo { text-align: center; font-weight: 800; font-size: 14px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px; line-height: 1.2; }
    .meta { font-size: 11px; margin-bottom: 6px; }
    .meta div { margin: 1px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; font-size: 12px; }
    td.c { width: 22px; font-weight: 700; }
    td.n { text-transform: uppercase; }
    td.p { text-align: right; white-space: nowrap; font-weight: 700; }
    .tot { border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; }
    .nota { text-align: center; font-size: 10px; margin-top: 6px; }
    .pie { text-align: center; margin-top: 8px; font-size: 10px; }
  </style></head><body>
    <div class="titulo">Cortesía<br>${esc(cortesia.numero)}</div>
    <div class="meta">
      <div><b>Cliente:</b> ${esc(cortesia.cliente?.nombre || 'N/A')}</div>
      ${cortesia.motivo ? `<div><b>Motivo:</b> ${esc(cortesia.motivo)}</div>` : ''}
      <div><b>Fecha:</b> ${fecha}</div>
    </div>
    <table><tbody>${filas}</tbody></table>
    <div class="tot"><span>Valor comercial</span><span>${money(subtotal)}</span></div>
    <div class="nota">Entrega sin costo. Documento no válido como factura.</div>
    <div class="pie">¡Gracias!</div>
  </body></html>`;

  escribirEImprimir(ventana, html);
}

// Selector de producto con búsqueda (evita listar cientos de productos en un <select>).
function ProductoBuscador({ productos, value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sel = productos.find((p) => String(p.id) === String(value));
  const filtro = q.trim().toLowerCase();
  const lista = filtro
    ? productos.filter(
        (p) =>
          (p.nombre || '').toLowerCase().includes(filtro) ||
          (p.codigo || '').toLowerCase().includes(filtro)
      )
    : productos;
  const etiqueta = sel ? `${sel.nombre} — ${money(sel.precio)}` : '— Selecciona —';
  return (
    <div className="cliente-picker" style={{ flex: 2, minWidth: 160 }}>
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
              placeholder="Buscar por nombre o código…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              {lista.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`cliente-picker-item ${String(p.id) === String(value) ? 'activo' : ''}`}
                  onClick={() => { onChange(String(p.id)); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                  <span className="mini"> · {money(p.precio)}</span>
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

export default function Cortesias() {
  const { user } = useAuth();
  const centrosAsignados = (user?.centrosOperacion || CENTROS_VACIOS).filter((centro) => centro.estado === 'Activo');
  const [centroOperacionCodigo, setCentroOperacionCodigo] = useState(() => centrosAsignados[0]?.codigo || '');
  const centroFacturacion = centrosAsignados.find((centro) => centro.codigo === centroOperacionCodigo) || null;
  const contextoDocumento = {
    companiaCodigo: centroFacturacion?.companiaCodigo,
    centroOperacionCodigo: centroFacturacion?.codigo,
  };
  const notify = useToast();
  const puedeCrear = puede(user, 'cortesias.crear');

  const [cortesias, setCortesias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [tipoCortesia, setTipoCortesia] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Formulario
  const [carrito, setCarrito] = useState([]); // [{ producto, cantidad }]
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [clienteId, setClienteId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const cargar = async () => {
    try {
      const query = centroFacturacion
        ? `?companiaCodigo=${encodeURIComponent(centroFacturacion.companiaCodigo)}&centroOperacionCodigo=${encodeURIComponent(centroFacturacion.codigo)}`
        : '';
      const [cs, ps, cls, tipos] = await Promise.all([
        api.get('/cortesias'),
        api.get('/productos'),
        api.get('/clientes').catch(() => []),
        centroFacturacion ? api.get(`/tipos-documento${query}`).catch(() => []) : Promise.resolve([]),
      ]);
      setCortesias(cs);
      setProductos(ps.filter((p) => p.activo !== false && p.precio > 0));
      setClientes(cls);
      setTipoCortesia(tipoDocumentoListo(tipos, 'CORTESIA') || null);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [centroOperacionCodigo]);

  const total = useMemo(
    () => carrito.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),
    [carrito]
  );

  const agregar = () => {
    if (!productoId) { notify('Selecciona un producto', 'err'); return; }
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) return;
    const cant = Number(cantidad) || 0;
    if (cant <= 0) { notify('Cantidad inválida', 'err'); return; }
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.producto.id === prod.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + cant };
        return copia;
      }
      return [...prev, { producto: prod, cantidad: cant }];
    });
    setProductoId('');
    setCantidad(1);
  };

  const quitar = (id) => setCarrito((prev) => prev.filter((l) => l.producto.id !== id));

  const limpiar = () => {
    setCarrito([]);
    setClienteId('');
    setMotivo('');
    setObservaciones('');
    setProductoId('');
    setCantidad(1);
  };
  const abrirNuevo = () => {
    if (!centroFacturacion) return notify('No tienes un centro de operaciones asignado. Contacta al administrador.', 'err');
    if (!tipoCortesia) return notify('Configura el tipo de documento CORTESIA antes de registrar.', 'err');
    limpiar(); setModalAbierto(true);
  };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const registrar = async () => {
    if (!centroFacturacion) return notify('No tienes un centro de operaciones asignado. Contacta al administrador.', 'err');
    if (!tipoCortesia) return notify('Configura el tipo de documento CORTESIA.', 'err');
    if (carrito.length === 0) { notify('Agrega al menos un producto', 'err'); return; }
    setProcesando(true);
    try {
      const creada = await api.post('/cortesias', {
        items: carrito.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        clienteId: clienteId || null,
        motivo: motivo || null,
        observaciones: observaciones || null,
        ...contextoDocumento,
      });
      notify(`Cortesía ${creada.numero} registrada`);
      setModalAbierto(false);
      limpiar();
      await cargar();
      imprimirCortesia(creada);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  if (cargando) return <div><LoadingState /></div>;

  return (
    <div>
      <PageHeader
        title="Cortesías"
        subtitle="Entregas sin costo a clientes. Genera un comprobante interno (no es factura)."
        actions={puedeCrear && <Button variant="primary" icon="add" disabled={!tipoCortesia || !centroFacturacion} onClick={abrirNuevo} title={tipoCortesia ? 'Nueva cortesía' : 'Configura el tipo de documento de Cortesía'} />}
      />

      {centrosAsignados.length > 0 && (
        <div className="field" style={{ maxWidth: 560 }}>
          <label>Compañía y centro de operaciones</label>
          <select value={centroOperacionCodigo} onChange={(e) => setCentroOperacionCodigo(e.target.value)}>
            {centrosAsignados.map((centro) => (
              <option key={centro.codigo} value={centro.codigo}>
                {centro.companiaCodigo} · {centro.compania?.razonSocial || ''} · {centro.codigo} · {centro.descripcion}
              </option>
            ))}
          </select>
        </div>
      )}
      {!centrosAsignados.length && <p className="mini" role="alert">No tienes compañías o centros de operaciones asignados. Contacta al administrador.</p>}
      {centroFacturacion && !tipoCortesia && <p className="mini" role="alert">La compañía {centroFacturacion.companiaCodigo} y el centro {centroFacturacion.codigo} no tienen configurado un tipo de documento CORTESIA.</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Historial</h3>
        {cortesias.length === 0 ? (
          <EmptyState
            icon="cortesias"
            title="Sin cortesías"
            description={puedeCrear ? 'Registra tu primera cortesía con el botón “+” de arriba.' : 'Aún no hay cortesías registradas.'}
          />
        ) : (
          <table>
            <thead>
              <tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Motivo</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr>
            </thead>
            <tbody>
              {cortesias.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.numero}</td>
                  <td className="mini">{new Date(c.createdAt).toLocaleString('es-CO')}</td>
                  <td>{c.cliente?.nombre || '—'}</td>
                  <td className="mini">{c.motivo || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(c.subtotal)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-sm" onClick={() => imprimirCortesia(c)}>
                      <Icon name="receipt" size={14} /> Imprimir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAbierto && (
        <Modal
          title="Nueva cortesía"
          subtitle="Selecciona los productos a entregar sin costo."
          onClose={cerrarModal}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" icon="check" loading={procesando} disabled={carrito.length === 0} onClick={registrar}>
                Registrar cortesía
              </Button>
            </>
          )}
        >
          <div className="grid form-2col" style={{ gap: 12 }}>
            <div className="field">
              <label>Cliente (opcional)</label>
              <ClienteBuscador clientes={clientes} value={clienteId} onChange={setClienteId} />
            </div>
            <div className="field">
              <label>Motivo</label>
              <input type="text" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. atención a cliente, degustación…" />
            </div>
          </div>

          <div className="field">
            <label>Agregar producto</label>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <ProductoBuscador productos={productos} value={productoId} onChange={setProductoId} />
              <input type="number" min={1} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: 90 }} aria-label="Cantidad" />
              <Button variant="secondary" icon="add" onClick={agregar}>Agregar</Button>
            </div>
          </div>

          {carrito.length > 0 && (
            <table style={{ marginTop: 4 }}>
              <thead>
                <tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr>
              </thead>
              <tbody>
                {carrito.map((l) => (
                  <tr key={l.producto.id}>
                    <td>{l.producto.nombre}</td>
                    <td style={{ textAlign: 'center' }}>{l.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{money(l.producto.precio * l.cantidad)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-red btn-sm" onClick={() => quitar(l.producto.id)}>
                        <Icon name="delete" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2} style={{ textAlign: 'right' }}>Valor comercial</th>
                  <th style={{ textAlign: 'right' }}>{money(total)}</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Observaciones</label>
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
