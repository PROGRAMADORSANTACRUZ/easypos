// Platos que cocina ya marco como listos y aun no se entregan en la mesa, por mesa.
// Misma regla que client/src/platosListos.js (lista de mesas de la web).
export function platosListosDePedido(pedido) {
  const preparacion = pedido?.preparacion;
  if (!preparacion) return null;
  const marcados = Array.isArray(preparacion.itemsListos) ? preparacion.itemsListos : [];
  if (!marcados.length) return preparacion.listo ? [] : null;
  const platos = marcados.filter((estado) => !estado.entregadoAt).map((estado) => {
    const item = pedido.items.find((it) => it.id === Number(estado.pedidoItemId));
    return item && Number(estado.cantidad ?? item.cantidad) === item.cantidad
      ? `${item.cantidad}x ${item.producto?.nombre || ''}` : null;
  }).filter(Boolean);
  return platos.length ? platos : null;
}

// Devuelve [{ mesaId, numero, platos }]; platos vacio = pedido anterior sin detalle por plato.
export function mesasConPlatosListos(mesas, mesaIdsAsignadas = []) {
  return mesas
    .filter((mesa) => !mesaIdsAsignadas.length || mesaIdsAsignadas.includes(mesa.id))
    .map((mesa) => ({ mesaId: mesa.id, numero: mesa.numero, platos: platosListosDePedido(mesa.pedidos?.[0]) }))
    .filter((mesa) => mesa.platos !== null);
}
