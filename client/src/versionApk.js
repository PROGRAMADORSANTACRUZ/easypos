// Compara la versión publicada de la APK con la instalada (versionCode creciente).
export function hayVersionNueva(instalada, remota) {
  return Number(remota?.versionCode) > Number(instalada?.versionCode);
}
