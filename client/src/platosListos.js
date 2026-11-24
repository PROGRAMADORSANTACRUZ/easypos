// Platos que cocina ya marco como listos y aun no se entregan en la mesa.
// Devuelve textos como "2x COSTILLA" a partir de un elemento de GET /mesas.
export const platosListos = (mesa) => {
  const pedido = mesa.pedidos?.[0];
  const preparacion = pedido?.preparacion;
  if (!pedido || !preparacion) return [];
  const marcados = Array.isArray(preparacion.itemsListos) ? preparacion.itemsListos : [];
  return marcados.filter((estado) => !estado.entregadoAt).map((estado) => {
    const item = pedido.items.find((it) => it.id === Number(estado.pedidoItemId));
    return item && Number(estado.cantidad ?? item.cantidad) === item.cantidad
      ? `${item.cantidad}x ${item.producto?.nombre || ''}` : null;
  }).filter(Boolean);
};

// Pedidos anteriores a la confirmacion por plato solo traen el indicador general
export const tienePlatoListo = (mesa) => {
  const preparacion = mesa.pedidos?.[0]?.preparacion;
  if (!preparacion) return false;
  return Array.isArray(preparacion.itemsListos) && preparacion.itemsListos.length > 0
    ? platosListos(mesa).length > 0 : !!preparacion.listo;
};
