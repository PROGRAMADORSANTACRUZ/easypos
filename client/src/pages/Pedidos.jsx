import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { LoadingState, overlayCierre } from '../components/ui/index.jsx';
import SeguimientoPedido from '../components/SeguimientoPedido.jsx';

const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Daviplata'];

// Tipos de identificación DIAN habituales
const TIPOS_ID = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de identidad' },
];

const ULTIMO_KEY = 'easypos_ultimo_domicilio';

const norm = (s) => String(s || '').toLowerCase().trim();

// Buscador de clientes ya registrados: al elegir uno, rellena los datos del pedido.
function ClienteBuscador({ clientes, onPick }) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const q = norm(filtro);
  const lista = q
    ? clientes.filter((c) =>
        norm(c.nombre).includes(q) ||
        norm(c.documento).includes(q) ||
        norm(c.telefono).includes(q))
      .slice(0, 30)
    : clientes.slice(0, 30);

  return (
    <div className="cliente-picker">
      <button type="button" className="cliente-picker-btn" onClick={() => setAbierto((v) => !v)}>
        <span className="cliente-picker-txt">Buscar cliente registrado…</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {abierto && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => setAbierto(false)} />
          <div className="cliente-picker-pop">
            <input
              className="cliente-picker-search"
              placeholder="Nombre, cédula o teléfono…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              autoFocus
            />
            <div className="cliente-picker-list">
              {lista.length === 0 ? (
                <p className="empty" style={{ margin: 6 }}>Sin coincidencias.</p>
              ) : (
                lista.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cliente-picker-item"
                    onClick={() => { onPick(c); setAbierto(false); setFiltro(''); }}
                  >
                    <div>{c.nombre || `${c.nombres || ''} ${c.apellidos || ''}`.trim() || 'Sin nombre'}</div>
                    <div className="mini">{[c.documento, c.telefono].filter(Boolean).join(' · ') || 'Sin documento'}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CLIENTE_VACIO = {
  tipoId: 'CC',
  tipoPersona: 'NATURAL',
  documento: '',
  primerNombre: '',
  segundoNombre: '',
  primerApellido: '',
  segundoApellido: '',
  direccion: '',
  barrio: '',
  email: '',
  telefono: '',
};

// Modulo de auto-pedido: el cliente selecciona productos, digita sus datos
// y su forma de pago. Genera un pedido a domicilio (sin mesa ni mesera).
export default function Pedidos() {
  const notify = useToast();

  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [cliente, setCliente] = useState(CLIENTE_VACIO);
  const [metodoPago, setMetodoPago] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [filtroCat, setFiltroCat] = useState('');
  const [busquedaProd, setBusquedaProd] = useState('');
  const [datosAbierto, setDatosAbierto] = useState(false);
  const [exitoAbierto, setExitoAbierto] = useState(false);
  // Geolocalización del punto de entrega y seguimiento del pedido creado
  const [ubicacion, setUbicacion] = useState(null); // { lat, lng }
  const [ubicando, setUbicando] = useState(false);
  const [pedidoCreado, setPedidoCreado] = useState(null); // { id, token }
  const [seguimientoAbierto, setSeguimientoAbierto] = useState(false);
  const [ultimo, setUltimo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ULTIMO_KEY)); } catch { return null; }
  });

  useEffect(() => {
    (async () => {
      try {
        const [prods, clis] = await Promise.all([
          api.get('/productos'),
          api.get('/clientes').catch(() => []),
        ]);
        setProductos(prods);
        setClientes(Array.isArray(clis) ? clis : []);
      } catch (e) {
        notify(e.message, 'err');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const items = useMemo(
    () =>
      carrito.map((c) => ({
        id: c.producto.id,
        nombre: c.producto.nombre,
        cantidad: c.cantidad,
        precioUnit: c.producto.precio,
      })),
    [carrito]
  );
  const subtotal = items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);

  const categoriasMenu = [...new Set(productos.map((p) => p.categoria?.nombre || 'Sin categoría'))].sort();
  const productosMenu = productos.filter((p) => {
    const cat = p.categoria?.nombre || 'Sin categoría';
    const okCat = !filtroCat || cat === filtroCat;
    const q = busquedaProd.trim().toLowerCase();
    const okQ = !q || p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q);
    return okCat && okQ;
  });

  const agregarProducto = (producto) => {
    if (producto.disponibles === 0) {
      notify(`${producto.nombre} sin inventario`, 'err');
      return;
    }
    setCarrito((prev) => {
      const existe = prev.find((c) => c.producto.id === producto.id);
      if (existe) {
        if (producto.disponibles != null && existe.cantidad >= producto.disponibles) {
          notify(`Solo hay ${producto.disponibles} de ${producto.nombre}`, 'err');
          return prev;
        }
        return prev.map((c) => (c.producto.id === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (item, delta) => {
    setCarrito((prev) =>
      prev
        .map((c) => (c.producto.id === item.id ? { ...c, cantidad: c.cantidad + delta } : c))
        .filter((c) => c.cantidad > 0)
    );
  };

  const quitarItem = (item) => setCarrito((prev) => prev.filter((c) => c.producto.id !== item.id));

  const setCampo = (campo) => (e) => setCliente((c) => ({ ...c, [campo]: e.target.value }));

  // Rellena el formulario con los datos de un cliente ya registrado
  const elegirCliente = (c) => {
    const nombres = (c.nombres || '').trim().split(/\s+/).filter(Boolean);
    const apellidos = (c.apellidos || '').trim().split(/\s+/).filter(Boolean);
    setCliente({
      tipoId: c.tipoDocumento || 'CC',
      tipoPersona: c.razonSocial ? 'JURIDICA' : 'NATURAL',
      documento: c.documento || c.numeroDocumento || '',
      primerNombre: nombres[0] || c.razonSocial || '',
      segundoNombre: nombres.slice(1).join(' '),
      primerApellido: apellidos[0] || '',
      segundoApellido: apellidos.slice(1).join(' '),
      direccion: c.direccion || '',
      barrio: c.barrio || '',
      email: c.email || '',
      telefono: c.telefono || '',
    });
    notify(`Cliente ${c.nombre || nombres.join(' ')} seleccionado`, 'ok');
  };

  const abrirDatos = () => {
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    setDatosAbierto(true);
  };

  // Captura la ubicación del cliente para la entrega (GPS del navegador)
  const ubicarme = () => {
    if (!navigator.geolocation) return notify('Tu dispositivo no permite geolocalización', 'err');
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUbicando(false);
        notify('Ubicación de entrega guardada', 'ok');
      },
      () => {
        setUbicando(false);
        notify('No pudimos obtener tu ubicación. Revisa los permisos.', 'err');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const enviarPedido = async () => {
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    if (!cliente.primerNombre.trim()) return notify('Ingresa el primer nombre del cliente', 'err');
    if (!metodoPago) return notify('Selecciona una forma de pago', 'err');
    const nombres = [cliente.primerNombre, cliente.segundoNombre].map((s) => s.trim()).filter(Boolean).join(' ');
    const apellidos = [cliente.primerApellido, cliente.segundoApellido].map((s) => s.trim()).filter(Boolean).join(' ');
    setEnviando(true);
    try {
      const creado = await api.post('/pedidos/online', {
        cliente: {
          tipoDocumento: cliente.tipoId,
          documento: cliente.documento,
          nombres,
          apellidos,
          telefono: cliente.telefono,
          email: cliente.email,
          direccion: cliente.direccion,
          barrio: cliente.barrio,
        },
        items: carrito.map((c) => ({ productoId: c.producto.id, cantidad: c.cantidad })),
        metodoPago,
        latDestino: ubicacion?.lat ?? null,
        lngDestino: ubicacion?.lng ?? null,
      });
      const ref = { id: creado.id, token: creado.seguimientoToken };
      setPedidoCreado(ref);
      setUltimo(ref);
      try { localStorage.setItem(ULTIMO_KEY, JSON.stringify(ref)); } catch { /* almacenamiento no disponible */ }
      setCarrito([]);
      setCliente(CLIENTE_VACIO);
      setMetodoPago('');
      setUbicacion(null);
      setDatosAbierto(false);
      setExitoAbierto(true);
      // Refresca la lista para que el cliente recién creado quede sugerido la próxima vez
      api.get('/clientes').then((cs) => setClientes(Array.isArray(cs) ? cs : [])).catch(() => {});
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <LoadingState />;

  return (
    <div>
      <div className="row between">
        <div>
          <h1>Domicilios</h1>
          <p className="subtitle">Arma tu pedido, ingresa tus datos y elige cómo pagar.</p>
        </div>
        {ultimo && (
          <button className="btn" onClick={() => { setPedidoCreado(ultimo); setSeguimientoAbierto(true); }}>
            <Icon name="mapa" size={16} /> Seguir mi último pedido
          </button>
        )}
      </div>

      <div className="grid grid-2">
        {/* Menu */}
        <div className="card menu-panel">
          <h3 style={{ marginTop: 0 }}>Menú</h3>
          <input
            className="cliente-picker-search"
            placeholder="Buscar producto…"
            value={busquedaProd}
            onChange={(e) => setBusquedaProd(e.target.value)}
          />
          <div className="menu-cats">
            <button className={`cat-chip ${filtroCat === '' ? 'active' : ''}`} onClick={() => setFiltroCat('')}>Todas</button>
            {categoriasMenu.map((c) => (
              <button key={c} className={`cat-chip ${filtroCat === c ? 'active' : ''}`} onClick={() => setFiltroCat(c)}>{c}</button>
            ))}
          </div>
          {productosMenu.length === 0 ? (
            <p className="empty">Sin productos.</p>
          ) : (
            <div className="menu-grid">
              {productosMenu.map((p) => (
                <button
                  key={p.id}
                  className={`producto-card ${p.disponibles === 0 ? 'agotado' : ''}`}
                  onClick={() => agregarProducto(p)}
                  disabled={p.disponibles === 0}
                >
                  {p.foto && <img src={p.foto} alt={p.nombre} className="pc-foto" />}
                  <div className="pc-cat">{p.categoria?.nombre || 'Sin categoría'}</div>
                  <div className="pc-nombre">{p.nombre}</div>
                  <div className="pc-precio">{money(p.precio)}</div>
                  {p.disponibles != null && (
                    <div className="pc-disp">{p.disponibles === 0 ? 'Agotado' : `Stock: ${p.disponibles}`}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carrito */}
        <div className="card cuenta-panel">
          <div className="carrito-head">
            <h3 style={{ margin: 0 }}>Mi pedido</h3>
            <span className="carrito-badge">
              <Icon name="cart" size={15} />
              {totalUnidades} {totalUnidades === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="carrito-vacio">
              <Icon name="cart" size={40} strokeWidth={1.4} />
              <p className="empty" style={{ margin: 0 }}>Tu pedido está vacío.</p>
              <span className="mini">Agrega productos desde el menú.</span>
            </div>
          ) : (
            <div className="carrito-items">
              {items.map((it) => (
                <div key={it.id} className="carrito-item">
                  <div className="ci-info">
                    <div className="ci-nombre">{it.nombre}</div>
                    <div className="mini">{money(it.precioUnit)} c/u</div>
                  </div>
                  <div className="qty">
                    <button className="qty-btn" title="Quitar uno" onClick={() => cambiarCantidad(it, -1)}>
                      <Icon name="minus" size={15} />
                    </button>
                    <span className="qty-num">{it.cantidad}</span>
                    <button className="qty-btn" title="Agregar uno" onClick={() => cambiarCantidad(it, 1)}>
                      <Icon name="add" size={15} />
                    </button>
                  </div>
                  <div className="ci-total">{money(it.precioUnit * it.cantidad)}</div>
                  <button className="ci-quitar" title="Quitar del pedido" onClick={() => quitarItem(it)}>
                    <Icon name="delete" size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="carrito-footer">
            <div className="total-line grand">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <button
              className="btn btn-primary carrito-cta"
              disabled={items.length === 0}
              onClick={abrirDatos}
            >
              <Icon name="forward" size={18} /> Continuar
            </button>
          </div>
        </div>
      </div>

      {datosAbierto && (
        <div className="modal-overlay" {...overlayCierre(() => setDatosAbierto(false))}>
          <div className="modal datos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ margin: 0 }}>Mis datos</h3>
              <button className="btn btn-sm" title="Cerrar" onClick={() => setDatosAbierto(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="datos-resumen">
              <span><Icon name="cart" size={15} /> {totalUnidades} {totalUnidades === 1 ? 'ítem' : 'ítems'}</span>
              <strong>{money(subtotal)}</strong>
            </div>

            {clientes.length > 0 && (
              <div className="field">
                <label>Cliente registrado</label>
                <ClienteBuscador clientes={clientes} onPick={elegirCliente} />
                <span className="mini">Si ya pediste antes, búscate aquí y se autocompletan tus datos.</span>
              </div>
            )}

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="field">
                <label>NIT o Cédula</label>
                <input value={cliente.documento} onChange={setCampo('documento')} placeholder="NIT o Cédula" />
              </div>
              <div className="field">
                <label>Tipo de ID</label>
                <select value={cliente.tipoId} onChange={setCampo('tipoId')}>
                  {TIPOS_ID.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Tipo de persona</label>
              <div className="row" style={{ gap: 18 }}>
                <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="tipoPersona"
                    checked={cliente.tipoPersona === 'NATURAL'}
                    onChange={() => setCliente((c) => ({ ...c, tipoPersona: 'NATURAL' }))}
                  />
                  Persona natural
                </label>
                <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="tipoPersona"
                    checked={cliente.tipoPersona === 'JURIDICA'}
                    onChange={() => setCliente((c) => ({ ...c, tipoPersona: 'JURIDICA' }))}
                  />
                  Persona jurídica
                </label>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="field">
                <label>Primer nombre *</label>
                <input value={cliente.primerNombre} onChange={setCampo('primerNombre')} placeholder="PRIMER NOMBRE" />
              </div>
              <div className="field">
                <label>Segundo nombre</label>
                <input value={cliente.segundoNombre} onChange={setCampo('segundoNombre')} placeholder="SEGUNDO NOMBRE" />
              </div>
              <div className="field">
                <label>Primer apellido</label>
                <input value={cliente.primerApellido} onChange={setCampo('primerApellido')} placeholder="PRIMER APELLIDO" />
              </div>
              <div className="field">
                <label>Segundo apellido</label>
                <input value={cliente.segundoApellido} onChange={setCampo('segundoApellido')} placeholder="SEGUNDO APELLIDO" />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input value={cliente.direccion} onChange={setCampo('direccion')} placeholder="DIRECCIÓN" />
              </div>
              <div className="field">
                <label>Barrio</label>
                <input value={cliente.barrio} onChange={setCampo('barrio')} placeholder="BARRIO" />
              </div>
              <div className="field">
                <label>Correo (factura electrónica)</label>
                <input type="email" value={cliente.email} onChange={setCampo('email')} placeholder="CORREO@DOMINIO.COM" />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={cliente.telefono} onChange={setCampo('telefono')} placeholder="Teléfono" />
              </div>
            </div>

            <div className="field">
              <label>Forma de pago *</label>
              <div className="mesera-grid">
                {FORMAS_PAGO.map((fp) => (
                  <button
                    key={fp}
                    type="button"
                    className={`mesera-card ${metodoPago === fp ? 'sel' : ''}`}
                    onClick={() => setMetodoPago(fp)}
                  >
                    <div className="mesera-nombre">{fp}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Ubicación de entrega (para el seguimiento en vivo)</label>
              <button type="button" className={`btn ${ubicacion ? 'btn-ok' : ''}`} onClick={ubicarme} disabled={ubicando}>
                <Icon name={ubicacion ? 'check' : 'gps'} size={16} />
                {ubicando ? ' Obteniendo ubicación…' : ubicacion ? ' Ubicación guardada' : ' Usar mi ubicación actual'}
              </button>
              <span className="mini">Opcional. Permite ver al repartidor en el mapa mientras llega.</span>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setDatosAbierto(false)}>
                <Icon name="back" size={16} /> Volver
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={enviando} onClick={enviarPedido}>
                {enviando ? 'Enviando...' : <><Icon name="check" size={16} /> Enviar pedido ({money(subtotal)})</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {exitoAbierto && (
        <div className="modal-overlay" {...overlayCierre(() => setExitoAbierto(false))}>
          <div className="modal exito-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exito-check">
              <Icon name="check" size={44} strokeWidth={2.5} />
            </div>
            <h2 className="exito-titulo">¡Pedido creado con éxito!</h2>
            <p className="exito-msg">
              Tu pedido ya fue recibido y está siendo gestionado por el restaurante.
            </p>
            <div className="exito-tiempo">
              <Icon name="reload" size={18} />
              <div>
                <span className="et-label">Tiempo estimado de entrega</span>
                <strong>20–30 minutos</strong>
              </div>
            </div>
            <p className="exito-nota">Te contactaremos si necesitamos confirmar algún dato.</p>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setExitoAbierto(false)}>
                <Icon name="check" size={16} /> Entendido
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => { setExitoAbierto(false); setSeguimientoAbierto(true); }}
              >
                <Icon name="mapa" size={16} /> Seguir mi pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {seguimientoAbierto && pedidoCreado && (
        <SeguimientoPedido
          pedidoId={pedidoCreado.id}
          token={pedidoCreado.token}
          onClose={() => setSeguimientoAbierto(false)}
        />
      )}
    </div>
  );
}
