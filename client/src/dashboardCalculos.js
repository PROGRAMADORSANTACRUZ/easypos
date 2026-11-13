// Escala "redonda" para el eje Y (pasos de 1, 2, 2.5, 5 o 10 por potencia de 10).
export function escalaEje(maximo, divisiones = 4) {
  if (!(maximo > 0)) return { tope: divisiones, paso: 1 };
  const bruto = maximo / divisiones;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((factor) => factor * potencia).find((valor) => valor >= bruto);
  return { tope: paso * divisiones, paso };
}

// Porcentaje de avance frente al objetivo con dos decimales; null si no hay objetivo.
export function porcentajeObjetivo(valor, objetivo) {
  if (!(objetivo > 0)) return null;
  return Math.round((valor / objetivo) * 10000) / 100;
}
