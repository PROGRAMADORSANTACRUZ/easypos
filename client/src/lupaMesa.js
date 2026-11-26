// Lupa de la pantalla de la mesa: cada mesera agranda el menu y la cuenta a su gusto
// y el nivel queda guardado en su celular.
export const NIVELES_LUPA = [1, 1.15, 1.3, 1.5, 1.75, 2];
export const CLAVE_LUPA = 'pos.lupaMesa';

export function nivelLupaGuardado(valor) {
  const nivel = Number(valor);
  return NIVELES_LUPA.includes(nivel) ? nivel : 1;
}

export function cambiarNivelLupa(actual, paso) {
  const indice = Math.max(NIVELES_LUPA.indexOf(actual), 0);
  const siguiente = Math.min(Math.max(indice + paso, 0), NIVELES_LUPA.length - 1);
  return NIVELES_LUPA[siguiente];
}
