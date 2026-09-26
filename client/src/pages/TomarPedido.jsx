import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { LoadingState, overlayCierre, Modal, Button } from '../components/ui/index.jsx';
import { LOGO_RECIBO } from '../logoRecibo.js';
import { formatoDe, estiloPagina, abrirVentanaVacia, escribirEImprimir } from '../print.js';

// Escapa texto libre antes de insertarlo en el HTML del ticket (evita inyeccion via nombres/observaciones).
const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Abre una ventana de impresión con la comanda en el formato configurado (Parámetros > Empresa)
function imprimirComanda(pedido, opts = {}) {
  imprimirComandaAsync(pedido, opts);
}
async function imprimirComandaAsync(pedido, { reimpresion = false, cambios = '' } = {}) {
  if (!pedido) return;
  const ventana = abrirVentanaVacia(); // debe abrirse ya (sincrono) para que el navegador no bloquee el popup
  const titulo = reimpresion ? 'REIMPRESIÓN Y MODIFICACIÓN DE PEDIDO' : 'PEDIDO';
  const fecha = new Date().toLocaleString('es-CO');
  const filas = (pedido.items || [])
    .map((it) => {
      const nombre = esc((it.producto?.nombre || it.nombre || '').toUpperCase());
      const cant = it.cantidad;
      const importe = money((it.precioUnit || 0) * cant);
      return `<tr><td class="c">${cant}×</td><td class="n">${nombre}</td><td class="p">${importe}</td></tr>`;
    })
    .join('');
  const subtotal = (pedido.items || []).reduce((s, it) => s + (it.precioUnit || 0) * it.cantidad, 0);
  const bloqueObs = pedido.observaciones
    ? `<div class="obs"><div class="lbl">Observaciones</div><div class="cambios">${esc(pedido.observaciones)}</div></div>`
    : '';
  const bloqueCambios = reimpresion && cambios
    ? `<div class="sec"><div class="lbl">Cambios</div><div class="cambios">${esc(cambios)}</div></div>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
  <style>
    ${estiloPagina(await formatoDe('formatoComanda'))}
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; font-size: 12px; padding: 3mm 4mm; }
    .logo { display: block; width: 28mm; max-width: 55%; margin: 0 auto 4px; }
    .titulo { text-align: center; font-weight: 800; font-size: 13px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px; line-height: 1.2; }
    .marca { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 1px; margin-top: 0; }
    .meta { font-size: 11px; margin-bottom: 6px; }
    .meta div { margin: 1px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; font-size: 12px; }
    td.c { width: 22px; font-weight: 700; }
    td.n { text-transform: uppercase; }
    td.p { text-align: right; white-space: nowrap; font-weight: 700; }
    .tot { border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; }
    .sec { margin-top: 6px; border-top: 1px dashed #000; padding-top: 4px; }
    .obs { margin-top: 6px; border: 1px solid #000; border-radius: 3px; padding: 4px 6px; }
    .obs .lbl { font-weight: 800; font-size: 11px; text-transform: uppercase; }
    .lbl { font-weight: 700; font-size: 11px; }
    .cambios { white-space: pre-wrap; font-size: 11px; }
    .pie { text-align: center; margin-top: 8px; font-size: 10px; }
  </style></head><body>
    <div class="titulo">${titulo}</div>
    <div class="meta">
      <div><b>Mesa:</b> ${pedido.mesa?.numero ?? ''}</div>
      <div><b>Mesera:</b> ${pedido.mesera?.nombre ?? ''}</div>
      <div><b>Pedido #:</b> ${pedido.id ?? ''}</div>
      <div><b>Fecha:</b> ${fecha}</div>
    </div>
    <table><tbody>${filas}</tbody></table>
    <div class="tot"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    ${bloqueObs}
    ${bloqueCambios}
    <div class="pie">¡Gracias!</div>
  </body></html>`;

  escribirEImprimir(ventana, html);
}

// Imprime la pre-cuenta (prefactura) que se entrega al cliente con la propina sugerida del 10%
function imprimirPrefactura(pedido) {
  imprimirPrefacturaAsync(pedido);
}
async function imprimirPrefacturaAsync(pedido) {
  if (!pedido) return;
  const ventana = abrirVentanaVacia(); // debe abrirse ya (sincrono) para que el navegador no bloquee el popup
  const fecha = new Date().toLocaleString('es-CO');
  const items = pedido.items || [];
  const filas = items
    .map((it) => {
      const nombre = esc((it.producto?.nombre || it.nombre || '').toUpperCase());
      const cant = it.cantidad;
      const importe = money((it.precioUnit || 0) * cant);
      const unit = money(it.precioUnit || 0);
      return `<tr><td class="c">${cant}</td><td class="n">${nombre}</td><td class="vu">${unit}</td><td class="p">${importe}</td></tr>`;
    })
    .join('');
  const subtotal = items.reduce((s, it) => s + (it.precioUnit || 0) * it.cantidad, 0);
  const propina = Math.round(subtotal * 0.1);
  const total = subtotal + propina;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PRE-CUENTA</title>
  <style>
    ${estiloPagina(await formatoDe('formatoPrefactura'))}
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; font-size: 12px; padding: 3mm 4mm; }
    .logo { display: block; width: 28mm; max-width: 55%; margin: 0 auto 4px; }
    .titulo { text-align: center; font-weight: 800; font-size: 13px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px; line-height: 1.2; }
    .meta { font-size: 11px; margin-bottom: 6px; }
    .meta div { margin: 1px 0; }
    table { width: 100%; border-collapse: collapse; }
    thead th { font-size: 8px; text-transform: uppercase; letter-spacing: .3px; color: #444; text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px; }
    thead th.vu, thead th.p { text-align: right; }
    td { padding: 2px 0; vertical-align: top; font-size: 11px; }
    td.c { width: 20px; font-weight: 700; }
    td.n { text-transform: uppercase; line-height: 1.15; }
    td.vu { text-align: right; white-space: nowrap; padding-left: 4px; }
    td.p { text-align: right; white-space: nowrap; font-weight: 700; padding-left: 4px; }
    .detalle-titulo { font-weight: 800; font-size: 11px; text-transform: uppercase; margin: 6px 0 2px; }
    .metodos { text-align: center; font-size: 10px; margin-top: 6px; line-height: 1.4; }
    .lin { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
    .sep { border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; }
    .tot { display: flex; justify-content: space-between; font-weight: 800; font-size: 14px; border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px; }
    .obs { border: 1px solid #000; border-radius: 3px; padding: 4px 6px; margin-top: 6px; font-size: 11px; text-align: left; }
    .nota { text-align: center; font-size: 10px; margin-top: 6px; }
    .pie { text-align: center; margin-top: 8px; font-size: 10px; }
  </style></head><body>
    <img class="logo" src="${LOGO_RECIBO}" alt="Asados Santacruz">
    <div class="titulo">Pre-cuenta</div>
    <div class="meta">
      <div><b>Mesa:</b> ${pedido.mesa?.numero ?? ''}</div>
      <div><b>Mesera:</b> ${pedido.mesera?.nombre ?? ''}</div>
      <div><b>Pedido #:</b> ${pedido.id ?? ''}</div>
      <div><b>Fecha:</b> ${fecha}</div>
    </div>
    <div class="detalle-titulo">Detalle de Consumo</div>
    <table>
      <thead><tr><th class="c">Cant.</th><th class="n">Descripción</th><th class="vu">V. Unit.</th><th class="p">Total</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="sep">
      <div class="lin"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="lin"><span>Impuesto (si aplica)</span><span>${money(0)}</span></div>
      <div class="lin"><span>Servicio Voluntario (10%)</span><span>${money(propina)}</span></div>
    </div>
    <div class="tot"><span>TOTAL A PAGAR</span><span>${money(total)}</span></div>
    ${pedido.observaciones ? `<div class="obs"><b>Observaciones:</b> ${esc(pedido.observaciones)}</div>` : ''}
    <div class="nota">Esta es una precuenta informativa. Solicite su factura para efectos tributarios.</div>
    <div class="metodos"><b>Métodos de pago:</b> Efectivo • Tarjeta Débito • Tarjeta Crédito • Transferencia • QR</div>
    <div class="pie">¡Gracias por su visita!</div>
  </body></html>`;

  escribirEImprimir(ventana, html);
}

export default function TomarPedido() {
  const { mesaId } = useParams();
  const navigate = useNavigate();
  const notify = useToast();

  const [mesa, setMesa] = useState(null);
  const [meseras, setMeseras] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedido, setPedido] = useState(null);      // pedido abierto existente
  const [carrito, setCarrito] = useState([]);       // items locales para pedido nuevo
  const [meseraId, setMeseraId] = useState('');
  const [editando, setEditando] = useState(true); // un pedido enviado inicia bloqueado
  const [snapshot, setSnapshot] = useState([]); // items al entrar en modo edicion
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [mesasLibres, setMesasLibres] = useState([]); // mesas disponibles para mover
  const [moviendo, setMoviendo] = useState(false);    // muestra el selector de mesa
  const [busquedaProd, setBusquedaProd] = useState(''); // filtro por nombre en el menú
  const [filtroCat, setFiltroCat] = useState('');       // filtro por categoría en el menú
  const [observaciones, setObservaciones] = useState(''); // nota general del pedido (ej. "sin cebolla")
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  const cargar = async () => {
    try {
      const [mesas, ms, ps, abiertos] = await Promise.all([
        api.get('/mesas'),
        api.get('/meseras'),
        api.get('/productos'),
        api.get('/pedidos?estado=ABIERTO'),
      ]);
      const m = mesas.find((x) => x.id === Number(mesaId));
      setMesa(m);
      setMeseras(ms);
      setProductos(ps.filter((p) => p.activo !== false && p.precio > 0));
      setMesasLibres(mesas.filter((x) => x.estado === 'LIBRE' && x.id !== Number(mesaId)));
      const abierto = abiertos.find((p) => p.mesaId === Number(mesaId));
      setPedido(abierto || null);
      setEditando(!abierto); // nuevo pedido = editando; pedido existente = bloqueado
      if (abierto) {
        setMeseraId(String(abierto.meseraId));
        setObservaciones(abierto.observaciones || '');
      } else {
        setObservaciones('');
      }
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [mesaId]);

  // Categorías y productos filtrados del menú
  const categoriasMenu = [...new Set(productos.map((p) => p.categoria?.nombre || 'Sin categoría'))];
  const productosFiltrados = productos.filter((p) => {
    const cat = p.categoria?.nombre || 'Sin categoría';
    const okCat = filtroCat === '' || cat === filtroCat;
    const okBusca = !busquedaProd.trim() || p.nombre.toLowerCase().includes(busquedaProd.trim().toLowerCase());
    return okCat && okBusca;
  });

  // Items a mostrar (pedido existente o carrito local)
  const items = useMemo(() => {
    if (pedido) {
      return pedido.items.map((it) => ({
        id: it.id,
        nombre: it.producto.nombre,
        cantidad: it.cantidad,
        precioUnit: it.precioUnit,
      }));
    }
    return carrito.map((c) => ({
      id: c.producto.id,
      nombre: c.producto.nombre,
      cantidad: c.cantidad,
      precioUnit: c.producto.precio,
    }));
  }, [pedido, carrito]);

  const subtotal = items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  const puedeEditar = !pedido || editando; // carrito nuevo o pedido en modo edicion

  const agregarProducto = async (producto) => {
    if (producto.disponibles === 0) {
      notify(`${producto.nombre} sin inventario`, 'err');
      return;
    }
    if (pedido) {
      try {
        const actualizado = await api.post(`/pedidos/${pedido.id}/items`, { productoId: producto.id, cantidad: 1 });
        setPedido(actualizado);
      } catch (e) {
        notify(e.message, 'err');
      }
    } else {
      setCarrito((prev) => {
        const existe = prev.find((c) => c.producto.id === producto.id);
        if (existe) return prev.map((c) => (c.producto.id === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c));
        return [...prev, { producto, cantidad: 1 }];
      });
    }
  };

  const quitarItem = async (item) => {
    if (pedido) {
      try {
        const actualizado = await api.del(`/pedidos/${pedido.id}/items/${item.id}`);
        setPedido(actualizado);
      } catch (e) {
        notify(e.message, 'err');
      }
    } else {
      setCarrito((prev) => prev.filter((c) => c.producto.id !== item.id));
    }
  };

  // Cambia la cantidad de un item en +/-1 (si llega a 0 se elimina)
  const cambiarCantidad = async (item, delta) => {
    const nuevaCant = item.cantidad + delta;
    if (pedido) {
      try {
        const actualizado = nuevaCant <= 0
          ? await api.del(`/pedidos/${pedido.id}/items/${item.id}`)
          : await api.put(`/pedidos/${pedido.id}/items/${item.id}`, { cantidad: nuevaCant });
        setPedido(actualizado);
      } catch (e) {
        notify(e.message, 'err');
      }
    } else {
      setCarrito((prev) =>
        prev
          .map((c) => (c.producto.id === item.id ? { ...c, cantidad: nuevaCant } : c))
          .filter((c) => c.cantidad > 0)
      );
    }
  };

  const enviarPedido = async () => {
    if (!meseraId) return notify('Selecciona una mesera', 'err');
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    setProcesando(true);
    try {
      const nuevo = await api.post('/pedidos', {
        mesaId: Number(mesaId),
        meseraId: Number(meseraId),
        items: carrito.map((c) => ({ productoId: c.producto.id, cantidad: c.cantidad })),
        observaciones: observaciones.trim() || null,
      });
      setPedido(nuevo);
      setCarrito([]);
      setEditando(false);
      imprimirComanda(nuevo, { reimpresion: false });
      notify('Pedido enviado. Puedes editarlo o ir a facturar.');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  // Entra en modo edición y guarda una foto de los items actuales para el diff
  const entrarEdicion = () => {
    setSnapshot(items.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad })));
    setEditando(true);
  };

  // Calcula qué cambió respecto al snapshot y arma el texto del log
  const calcularCambios = () => {
    const antes = new Map(snapshot.map((s) => [s.nombre, s.cantidad]));
    const ahora = new Map(items.map((it) => [it.nombre, it.cantidad]));
    const cambios = [];
    for (const [nombre, cant] of ahora) {
      const prev = antes.get(nombre);
      if (prev === undefined) cambios.push(`+ ${nombre} x${cant}`);
      else if (prev !== cant) cambios.push(`${nombre} ${prev}→${cant}`);
    }
    for (const [nombre] of antes) {
      if (!ahora.has(nombre)) cambios.push(`− ${nombre}`);
    }
    return cambios.join('; ');
  };

  const reenviarPedido = async () => {
    const cambios = calcularCambios();
    const obsCambio = observaciones.trim() !== (pedido.observaciones || '').trim();
    if (!cambios && !obsCambio) {
      setEditando(false);
      return notify('No hubo cambios');
    }
    setProcesando(true);
    try {
      const actualizado = await api.post(`/pedidos/${pedido.id}/reenviar`, { cambios, observaciones: observaciones.trim() || null });
      setPedido(actualizado);
      setEditando(false);
      imprimirComanda(actualizado, { reimpresion: true, cambios });
      notify('Pedido reenviado a facturación');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  const cancelar = () => {
    if (!pedido) return navigate('/mesas');
    setConfirmandoCancelar(true);
  };

  const confirmarCancelar = async () => {
    setConfirmandoCancelar(false);
    try {
      await api.post(`/pedidos/${pedido.id}/cancelar`, {});
      notify('Pedido cancelado');
      navigate('/mesas');
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  // Mueve el pedido a otra mesa y navega a la nueva
  const cambiarMesa = async (destino) => {
    try {
      await api.post(`/pedidos/${pedido.id}/cambiar-mesa`, { mesaId: destino.id });
      notify(`Pedido movido a la mesa ${destino.numero}`);
      setMoviendo(false);
      navigate(`/mesas/${destino.id}/pedido`);
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  if (cargando) return <LoadingState />;
  if (!mesa) return <p className="empty">Mesa no encontrada.</p>;

  return (
    <div>
      <div className="row between">
        <div>
          <h1>Mesa {mesa.numero}</h1>
          <p className="subtitle">
            {pedido ? <span className="badge orange">Pedido abierto — {editando ? 'editando' : 'guardado'}</span> : 'Nuevo pedido'}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {pedido && (
            <button className="btn" onClick={() => setMoviendo(true)}><Icon name="swap" size={16} /> Cambiar mesa</button>
          )}
          <button className="btn" onClick={() => navigate('/mesas')}><Icon name="back" size={16} /> Volver a mesas</button>
        </div>
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
          {productos.length === 0 ? (
            <p className="empty">No hay productos.</p>
          ) : productosFiltrados.length === 0 ? (
            <p className="empty">Sin productos que coincidan.</p>
          ) : (
            <div className="menu-grid">
              {productosFiltrados.map((p) => (
                <button
                  key={p.id}
                  className={`producto-card ${p.disponibles === 0 ? 'agotado' : ''}`}
                  onClick={() => agregarProducto(p)}
                  disabled={p.disponibles === 0 || (pedido && !editando)}
                >
                  {p.foto && <img src={p.foto} alt={p.nombre} className="pc-foto" />}
                  <div className="pc-cat">{p.categoria?.nombre || 'Sin categoría'}</div>
                  <div className="pc-nombre">{p.nombre}</div>
                  <div className="pc-precio">{money(p.precio)}</div>
                  {p.disponibles != null && (
                    <div className="pc-disp">{p.disponibles === 0 ? 'Agotado' : `${p.disponibles} disp.`}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cuenta */}
        <div className="card cuenta-panel">
          <h3 style={{ marginTop: 0 }}>Cuenta</h3>

          <div className="field">
            <label>Mesera</label>
            <div className="mesera-grid">
              {meseras.map((m) => {
                const seleccionada = String(m.id) === meseraId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`mesera-card ${seleccionada ? 'sel' : ''}`}
                    onClick={() => !pedido && setMeseraId(String(m.id))}
                    disabled={!!pedido && !seleccionada}
                  >
                    <div className="mesera-codigo">#{m.codigo}</div>
                    <div className="mesera-nombre">{m.nombre}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="empty">Agrega productos del menú.</p>
          ) : (
            <table>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{it.nombre}</div>
                      <div className="mini">{money(it.precioUnit)} c/u</div>
                    </td>
                    <td>
                      {puedeEditar ? (
                        <div className="qty">
                          <button className="btn btn-sm" onClick={() => cambiarCantidad(it, -1)}>−</button>
                          <span className="qty-num">{it.cantidad}</span>
                          <button className="btn btn-sm" onClick={() => cambiarCantidad(it, 1)}>+</button>
                        </div>
                      ) : (
                        <span className="qty-num">×{it.cantidad}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(it.precioUnit * it.cantidad)}</td>
                    <td style={{ width: 30 }}>
                      {puedeEditar && (
                        <button className="btn btn-red btn-sm" title="Quitar" onClick={() => quitarItem(it)}><Icon name="close" size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 14 }}>
            <label className="mini" style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Observaciones</label>
            <textarea
              rows={2}
              placeholder="Ej. sin cebolla, para llevar…"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              disabled={!!pedido && !editando}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="total-line grand"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            {!pedido ? (
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={procesando} onClick={enviarPedido}>
                Enviar pedido
              </button>
            ) : editando ? (
              <button className="btn btn-green" style={{ flex: 1 }} disabled={procesando} onClick={reenviarPedido}>
                <Icon name="reload" size={16} /> Reenviar pedido
              </button>
            ) : (
              <>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={entrarEdicion}>
                  <Icon name="edit" size={16} /> Editar
                </button>
                <button className="btn btn-green" style={{ flex: 1 }} onClick={() => imprimirPrefactura(pedido)}>
                  <Icon name="receipt" size={16} /> Prefactura
                </button>
              </>
            )}
            <button className="btn btn-red" onClick={cancelar}>Cancelar</button>
          </div>
        </div>
      </div>

      {moviendo && (
        <div className="modal-overlay" {...overlayCierre(() => setMoviendo(false))}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>Cambiar de mesa</h3>
              <button className="btn btn-sm" title="Cerrar" onClick={() => setMoviendo(false)}><Icon name="close" size={16} /></button>
            </div>
            <p className="subtitle" style={{ marginTop: 6 }}>
              Mueve el pedido de la mesa {mesa.numero} a una mesa libre. Se registra el movimiento en facturación.
            </p>
            {mesasLibres.length === 0 ? (
              <p className="empty">No hay mesas libres disponibles.</p>
            ) : (
              <div className="grid grid-mesas" style={{ marginTop: 10 }}>
                {mesasLibres.map((m) => (
                  <button key={m.id} type="button" className="card mesa LIBRE" onClick={() => cambiarMesa(m)}>
                    <div className="num">{m.numero}</div>
                    <div className="mini">Cap. {m.capacidad}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmandoCancelar && (
        <Modal
          title="Confirmar"
          size="sm"
          onClose={() => setConfirmandoCancelar(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setConfirmandoCancelar(false)}>No</Button>
              <Button variant="danger" onClick={confirmarCancelar}>Sí, cancelar</Button>
            </>
          )}
        >
          ¿Cancelar este pedido y liberar la mesa?
        </Modal>
      )}
    </div>
  );
}
