// Conversion del peso leido de la bascula (siempre en kg) a la unidad de venta del producto.
const KG_POR_UNIDAD = {
  KG: 1, KGS: 1, KILO: 1, KILOS: 1, KILOGRAMO: 1, KILOGRAMOS: 1,
  G: 0.001, GR: 0.001, GRS: 0.001, GRAMO: 0.001, GRAMOS: 0.001,
  LB: 0.45359237, LBS: 0.45359237, LIBRA: 0.45359237, LIBRAS: 0.45359237,
};

const normalizar = (texto) => String(texto || '')
  .trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');

export function kgPorUnidad(producto) {
  const unidad = producto?.unidad;
  return KG_POR_UNIDAD[normalizar(unidad?.abreviatura)] ?? KG_POR_UNIDAD[normalizar(unidad?.nombre)] ?? null;
}

export const esProductoPesable = (producto) => kgPorUnidad(producto) != null;

// Devuelve la cantidad en la unidad del producto, redondeada a la precision de esa unidad.
export function cantidadDesdePeso(producto, kg) {
  const factorKg = kgPorUnidad(producto);
  if (factorKg == null || !Number.isFinite(kg) || kg <= 0) return null;
  const precision = Number(producto.unidad?.factorConversion) > 0 ? Number(producto.unidad.factorConversion) : 1;
  const cantidad = Math.round((kg / factorKg) * precision) / precision;
  return cantidad > 0 ? cantidad : null;
}

export const basculaDisponible = () => typeof window !== 'undefined' && Boolean(window.posDesktop?.bascula);

export const formatoPeso = (kg) => (kg == null ? '—' : `${kg.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`);
