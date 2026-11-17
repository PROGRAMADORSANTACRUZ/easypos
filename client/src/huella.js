import { esApk, llamarNativo } from './movil.js';

// Ingreso con huella de la APK: las credenciales se guardan cifradas con una llave del teléfono
// que solo se abre con la huella (plugin nativo "Biometrico").
const SIN_HUELLA = { disponible: false, activada: false };

export async function estadoHuella() {
  if (!esApk()) return SIN_HUELLA;
  try {
    const estado = await llamarNativo('Biometrico', 'disponible');
    return { disponible: Boolean(estado?.disponible), activada: Boolean(estado?.activada) };
  } catch {
    return SIN_HUELLA; // APK anterior sin el componente de huella
  }
}

export const activarHuella = (credenciales) => llamarNativo('Biometrico', 'guardar', { texto: JSON.stringify(credenciales) });

export async function leerHuella() {
  const resultado = await llamarNativo('Biometrico', 'leer');
  return JSON.parse(resultado.texto);
}

export const quitarHuella = () => llamarNativo('Biometrico', 'borrar');

// El plugin rechaza con un texto corto ("CANCELADO", "INVALIDADA"…): se normaliza el mensaje.
export const motivoHuella = (error) => String(error?.message || error?.errorMessage || error || '');
