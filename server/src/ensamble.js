export function normalizarEnsamble({ outputItemId, outputQuantity, inputs } = {}) {
  const salidaId = Number(outputItemId);
  const cantidadSalida = Number(outputQuantity);
  if (!Number.isSafeInteger(salidaId) || salidaId <= 0) throw new Error('Selecciona el insumo que vas a producir');
  if (!Number.isFinite(cantidadSalida) || cantidadSalida <= 0) throw new Error('La cantidad producida debe ser mayor que cero');
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('Agrega al menos un insumo consumido');

  const cantidadesPorInsumo = new Map();
  for (const input of inputs) {
    const itemId = Number(input?.itemId);
    const quantity = Number(input?.quantity);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error('Selecciona todos los insumos consumidos');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Las cantidades consumidas deben ser mayores que cero');
    if (itemId === salidaId) throw new Error('El insumo producido no puede consumirse en el mismo ensamble');
    cantidadesPorInsumo.set(itemId, (cantidadesPorInsumo.get(itemId) || 0) + quantity);
  }

  return {
    outputItemId: salidaId,
    outputQuantity: cantidadSalida,
    inputs: [...cantidadesPorInsumo.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

export function validarExistenciasEnsamble({ inputs, items }) {
  const itemsPorId = new Map(items.map((item) => [item.id, item]));
  const faltantes = inputs.filter((input) => !itemsPorId.has(input.itemId));
  if (faltantes.length) throw new Error('Uno o más insumos ya no existen');

  for (const input of inputs) {
    const item = itemsPorId.get(input.itemId);
    if (item.stock < input.quantity) {
      throw new Error(`Stock insuficiente de "${item.nombre}" (disponible ${item.stock} ${item.unidad}, requerido ${input.quantity} ${item.unidad})`);
    }
  }

  return itemsPorId;
}