import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { LoadingState, PageHeader, Modal, Button, EmptyState, overlayCierre } from '../components/ui/index.jsx';
import { imprimirRecibo, configurarRecibo, pagoOk, labelPago } from './Facturas.jsx';
import { abrirVentanaVacia } from '../print.js';
import { tipoDocumentoListo } from '../tipoDocumentoListo.js';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

// Numero visible de la factura de venta: prefijo + consecutivo (registros reales de Factura) o legacy.
const numeroCot = (c) => (c?.numeroFactura ? `${c.prefijo || ''}${c.numeroFactura}` : (c?.numero || `${c?.prefijo || 'FDV'}${c?.consecutivo ?? ''}`));

// Selector de cliente con búsqueda (evita listar cientos de clientes).
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

export default function Cotizaciones() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const puedeCrear = puede(user, 'factura_venta.crear');

  const [cotizaciones, setCotizaciones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [apertura, setApertura] = useState(null);
  const [tipoVenta, setTipoVenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Formulario
  const [carrito, setCarrito] = useState([]); // [{ producto, cantidad }]
  const [clienteId, setClienteId] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [mixto, setMixto] = useState(false);
  const [pago2, setPago2] = useState('TARJETA');
  const [pago2Monto, setPago2Monto] = useState('');
  const [recibido, setRecibido] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [busquedaProd, setBusquedaProd] = useState('');

  const cargar = async () => {
    try {
      const [cs, ps, cls, emp, ap] = await Promise.all([
        api.get('/facturas?electronica=false'), // solo ventas de "Factura de venta", separadas del modulo Facturacion
        api.get('/productos'),
        api.get('/clientes').catch(() => []),
        api.get('/empresa').catch(() => null),
        api.get('/aperturas/activa').catch(() => null),
      ]);
      setCotizaciones(cs);
      setProductos(ps.filter((p) => p.activo !== false && p.precio > 0));
      setClientes(cls);
      setEmpresa(emp);
      setApertura(ap);
      try {
        const tipos = await api.get('/tipos-documento');
        setTipoVenta(tipoDocumentoListo(tipos || [], 'FACTURA DE VENTA (NO ELECTRONICA)') || null);
        configurarRecibo(emp, (tipos || []).find((t) => t.clase === 'FACTURA ELECTRONICA DE VENTA' && t.activo) || null);
      } catch { setTipoVenta(null); configurarRecibo(emp, null); }
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Cliente por defecto: "Consumidor Final" (si existe en el directorio).
  const idDefault = useMemo(() => {
    const def = clientes.find((c) => c.nombre.trim().toLowerCase() === 'consumidor final');
    return def ? String(def.id) : '';
  }, [clientes]);

  const subtotal = useMemo(
    () => carrito.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),
    [carrito]
  );

  const categoriasMenu = useMemo(
    () => [...new Set(productos.map((p) => p.categoria?.nombre || 'Sin categoría'))].sort(),
    [productos]
  );
  const productosMenu = productos.filter((p) => {
    const cat = p.categoria?.nombre || 'Sin categoría';
    const okCat = !filtroCat || cat === filtroCat;
    const okQ = !busquedaProd.trim() || p.nombre.toLowerCase().includes(busquedaProd.trim().toLowerCase());
    return okCat && okQ;
  });

  const agregar = (producto) => {
    setCarrito((prev) => {
      const existe = prev.find((c) => c.producto.id === producto.id);
      if (existe) return prev.map((c) => (c.producto.id === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c));
      return [...prev, { producto, cantidad: 1 }];
    });
  };
  const cambiar = (id, delta) => {
    setCarrito((prev) => prev
      .map((c) => (c.producto.id === id ? { ...c, cantidad: c.cantidad + delta } : c))
      .filter((c) => c.cantidad > 0));
  };

  const limpiar = () => {
    setCarrito([]);
    setClienteId(idDefault);
    setMetodoPago('EFECTIVO');
    setMixto(false);
    setPago2('TARJETA');
    setPago2Monto('');
    setRecibido('');
    setFiltroCat('');
    setBusquedaProd('');
  };
  const abrirNuevo = () => {
    if (!tipoVenta) return notify('Configura el tipo de documento FACTURA DE VENTA (NO ELECTRONICA) antes de vender.', 'err');
    limpiar(); setModalAbierto(true);
  };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const registrar = async () => {
    if (!tipoVenta) return notify('Configura el tipo de documento FACTURA DE VENTA (NO ELECTRONICA).', 'err');
    if (!apertura) return notify('Abre la caja antes de facturar', 'err');
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    if (mixto) {
      if (pago2Monto === '' || Number(pago2Monto) <= 0) return notify(`Digita el valor de ${pago2.toLowerCase()}`, 'err');
      if (Number(pago2Monto) >= subtotal) return notify(`El valor de ${pago2.toLowerCase()} debe ser menor al total`, 'err');
    } else if (!pagoOk(false, recibido, pago2Monto, subtotal)) {
      return notify(metodoPago === 'EFECTIVO' ? 'Digita cuánto recibe en efectivo' : 'Digita el valor recibido', 'err');
    }
    const ventana = abrirVentanaVacia();
    setProcesando(true);
    try {
      const factura = await api.post('/facturas/directa', {
        items: carrito.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        metodoPago: labelPago(mixto, metodoPago, pago2, pago2Monto, subtotal),
        clienteId: (clienteId || idDefault) || null,
        electronica: false, // "Factura de venta": documento interno, no se reporta a Factus/DIAN
      });
      notify(`Factura ${factura.prefijo || ''}${factura.numeroFactura || factura.id} generada: ${money(factura.total)}`);
      setModalAbierto(false);
      const rec = !mixto && metodoPago === 'EFECTIVO' ? recibido : null;
      limpiar();
      await cargar();
      try {
        await imprimirRecibo(factura, rec !== null ? { recibido: rec } : null, 'formatoFacturaVenta', ventana);
        if (!ventana) notify('Factura creada. Permite ventanas emergentes o imprímela desde el historial.', 'err');
      } catch (error) {
        ventana?.close();
        notify(`Factura creada, pero no se pudo imprimir: ${error.message}`, 'err');
      }
    } catch (e) {
      ventana?.close();
      notify(e.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  if (cargando) return <div><LoadingState /></div>;

  return (
    <div>
      <PageHeader
        title="Factura de venta"
        subtitle="Cobra una venta directa: descuenta inventario, pero NO es un documento electrónico (no se reporta a la DIAN/Factus)."
        actions={puedeCrear && <Button variant="primary" icon="add" disabled={!tipoVenta} onClick={abrirNuevo} title={tipoVenta ? 'Nueva venta' : 'Configura el tipo de documento de Factura de venta'} />}
      />

      {!tipoVenta && <p className="mini" role="alert">Configura el tipo de documento FACTURA DE VENTA (NO ELECTRONICA) y su rango para registrar ventas.</p>}

      {!apertura && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
          <b>Caja cerrada.</b> Abre la caja en el módulo Caja para poder cobrar.
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Historial</h3>
        {cotizaciones.length === 0 ? (
          <EmptyState
            icon="facturas"
            title="Sin ventas registradas"
            description={puedeCrear ? 'Crea tu primera venta con el botón “+” de arriba.' : 'Aún no hay ventas.'}
          />
        ) : (
          <table>
            <thead>
              <tr><th>N°</th><th>Fecha</th><th>Cliente</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{numeroCot(c)}</td>
                  <td className="mini">{new Date(c.createdAt || c.fecha).toLocaleString('es-CO')}</td>
                  <td>{c.cliente?.nombre || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(c.total || 0)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => imprimirRecibo(c, null, 'formatoFacturaVenta')}
                    >
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
        <div className="modal-overlay" {...overlayCierre(cerrarModal)}>
          <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="facturas" size={18} /> Nueva venta</h3>
              <button className="btn btn-sm" title="Cerrar" onClick={cerrarModal}><Icon name="close" size={16} /></button>
            </div>

            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              {/* Menú */}
              <div className="directa-menu">
                <input
                  className="cliente-picker-search"
                  placeholder="Buscar producto…"
                  value={busquedaProd}
                  onChange={(e) => setBusquedaProd(e.target.value)}
                />
                <div className="menu-cats">
                  <button type="button" className={`cat-chip ${filtroCat === '' ? 'active' : ''}`} onClick={() => setFiltroCat('')}>Todas</button>
                  {categoriasMenu.map((cat) => (
                    <button key={cat} type="button" className={`cat-chip ${filtroCat === cat ? 'active' : ''}`} onClick={() => setFiltroCat(cat)}>{cat}</button>
                  ))}
                </div>
                {productosMenu.length === 0 ? (
                  <p className="empty">Sin productos.</p>
                ) : (
                  <div className="menu-grid">
                    {productosMenu.map((p) => (
                      <button key={p.id} className="producto-card" onClick={() => agregar(p)}>
                        {p.foto && <img src={p.foto} alt={p.nombre} className="pc-foto" />}
                        <div className="pc-cat">{p.categoria?.nombre || 'Sin categoría'}</div>
                        <div className="pc-nombre">{p.nombre}</div>
                        <div className="pc-precio">{money(p.precio)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Factura de venta */}
              <div>
                <div className="field">
                  <label>Cliente</label>
                  <ClienteBuscador clientes={clientes} value={clienteId || idDefault} onChange={setClienteId} />
                </div>
                {carrito.length === 0 ? (
                  <p className="empty">Agrega productos del menú.</p>
                ) : (
                  <div style={{ maxHeight: 168, overflowY: 'auto' }}>
                  <table>
                    <tbody>
                      {carrito.map((c) => (
                        <tr key={c.producto.id}>
                          <td>
                            <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{c.producto.nombre}</div>
                            <div className="mini">{money(c.producto.precio)} c/u</div>
                          </td>
                          <td>
                            <div className="qty">
                              <button className="btn btn-sm" onClick={() => cambiar(c.producto.id, -1)}>−</button>
                              <span className="qty-num">{c.cantidad}</span>
                              <button className="btn btn-sm" onClick={() => cambiar(c.producto.id, 1)}>+</button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.producto.precio * c.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}

                <div className="total-line grand" style={{ marginTop: 12 }}>
                  <span>Subtotal</span><span>{money(subtotal)}</span>
                </div>

                <label className="pago-mixto-check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={mixto} onChange={(e) => setMixto(e.target.checked)} />
                  Pago en 2 formas
                </label>

                {!mixto ? (
                  <>
                    <div className="field">
                      <label>Método de pago</label>
                      <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>{metodoPago === 'EFECTIVO' ? 'Recibe' : 'Valor'}</label>
                      <input type="number" min="0" placeholder="0" value={recibido} onChange={(e) => setRecibido(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Otra forma</label>
                      <select value={pago2} onChange={(e) => setPago2(e.target.value)}>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Valor {pago2.toLowerCase()}</label>
                      <input type="number" min="0" placeholder="0" value={pago2Monto} onChange={(e) => setPago2Monto(e.target.value)} />
                    </div>
                    <div className="total-line grand">
                      <span>Efectivo</span>
                      <span>{money(Math.max(0, subtotal - Number(pago2Monto || 0)))}</span>
                    </div>
                  </>
                )}

                {!apertura && (
                  <div className="row" role="alert" style={{ marginTop: 12, gap: 8 }}>
                    <span className="mini" style={{ color: 'var(--red)', flex: 1 }}>
                      {puede(user, 'caja.ver') && puede(user, 'caja.abrir') ? 'Abre la caja para facturar esta venta.' : 'Solicita la apertura de caja a un usuario autorizado.'}
                    </span>
                    {puede(user, 'caja.ver') && puede(user, 'caja.abrir') && <Button size="sm" onClick={() => { cerrarModal(); navigate('/caja'); }}>Ir a Caja</Button>}
                  </div>
                )}
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    loading={procesando}
                    disabled={!apertura || carrito.length === 0 || !pagoOk(mixto, recibido, pago2Monto, subtotal)}
                    onClick={registrar}
                  >
                    Facturar e imprimir {money(subtotal)}
                  </Button>
                </div>
                {!mixto && metodoPago === 'EFECTIVO' && recibido !== '' && (
                  <div className="total-line grand" style={{ marginTop: 8 }}>
                    <span>Vuelto</span>
                    <span>{money(Math.max(0, Number(recibido) - subtotal))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
