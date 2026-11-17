// Puente con la APK (Capacitor). En el navegador y en la app de escritorio no existe.
export const esApk = () => Boolean(window.Capacitor?.nativePromise);

export const llamarNativo = (plugin, metodo, opciones) => window.Capacitor.nativePromise(plugin, metodo, opciones);
