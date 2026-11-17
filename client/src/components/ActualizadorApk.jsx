import { useEffect, useState } from 'react';
import { hayVersionNueva } from '../versionApk.js';

// Solo existe dentro de la APK (puente nativo de Capacitor): avisa de una APK nueva y la instala.
const nativo = () => window.Capacitor?.nativePromise;
const llamar = (metodo, opciones) => window.Capacitor.nativePromise('ApkUpdater', metodo, opciones);

const MENSAJES = {
  descargando: 'Descargando la actualización…',
  instalando: 'Confirma la instalación en la pantalla de Android.',
  permiso: 'Activa «Permitir de esta fuente» en los ajustes y vuelve a pulsar Actualizar.',
  error: 'No se pudo actualizar. Inténtalo de nuevo.',
};

export default function ActualizadorApk() {
  const [nueva, setNueva] = useState(null);
  const [estado, setEstado] = useState('');

  useEffect(() => {
    if (!nativo()) return undefined;
    let activo = true;
    const revisar = async () => {
      try {
        const [instalada, respuesta] = await Promise.all([
          llamar('getVersion'),
          fetch('/movil/version.json', { cache: 'no-store' }),
        ]);
        if (!respuesta.ok) return;
        const remota = await respuesta.json();
        if (activo && hayVersionNueva(instalada, remota)) setNueva(remota);
      } catch {
        // Sin conexión o sin versión publicada: se revisa de nuevo más tarde.
      }
    };
    revisar();
    const intervalo = setInterval(revisar, 30 * 60 * 1000);
    return () => { activo = false; clearInterval(intervalo); };
  }, []);

  if (!nueva) return null;

  const actualizar = async () => {
    setEstado('descargando');
    try {
      const resultado = await llamar('install', { url: new URL(nueva.url, window.location.origin).href, sha256: nueva.sha256 });
      setEstado(resultado?.estado === 'permiso' ? 'permiso' : 'instalando');
    } catch {
      setEstado('error');
    }
  };

  return (
    <div className="actualizador-apk" role="status">
      <div>
        <strong>Hay una nueva versión de la app ({nueva.versionName}).</strong>
        {estado && <div className="mini">{MENSAJES[estado]}</div>}
      </div>
      <button type="button" className="btn btn-primary btn-sm" disabled={estado === 'descargando'} onClick={actualizar}>Actualizar</button>
    </div>
  );
}
