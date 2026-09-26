import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Marcadores como divIcon (HTML) para evitar el problema de imágenes de Leaflet con bundlers.
const iconoDestino = L.divIcon({
  className: 'mapa-pin',
  html: '<div class="mapa-pin-dot destino">🏠</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});
const iconoRepartidor = L.divIcon({
  className: 'mapa-pin',
  html: '<div class="mapa-pin-dot repartidor">🛵</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// Mapa de seguimiento con Leaflet + OpenStreetMap.
// Props: destino {lat,lng}, repartidor {lat,lng}, height (px)
export default function MapaSeguimiento({ destino, repartidor, height = 300 }) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);
  const destinoRef = useRef(null);
  const repartidorRef = useRef(null);
  const rutaRef = useRef(null);

  // Inicializa el mapa una sola vez
  useEffect(() => {
    if (mapaRef.current || !contenedorRef.current) return;
    const centro = destino || repartidor || { lat: 4.60971, lng: -74.08175 }; // Bogotá por defecto
    const mapa = L.map(contenedorRef.current, { zoomControl: true, attributionControl: false })
      .setView([centro.lat, centro.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(mapa);
    mapaRef.current = mapa;
    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  // Actualiza marcadores y encuadre cuando cambian las coordenadas
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (destino && Number.isFinite(destino.lat) && Number.isFinite(destino.lng)) {
      if (destinoRef.current) destinoRef.current.setLatLng([destino.lat, destino.lng]);
      else destinoRef.current = L.marker([destino.lat, destino.lng], { icon: iconoDestino })
        .addTo(mapa).bindPopup('Punto de entrega');
    }

    if (repartidor && Number.isFinite(repartidor.lat) && Number.isFinite(repartidor.lng)) {
      if (repartidorRef.current) repartidorRef.current.setLatLng([repartidor.lat, repartidor.lng]);
      else repartidorRef.current = L.marker([repartidor.lat, repartidor.lng], { icon: iconoRepartidor })
        .addTo(mapa).bindPopup('Repartidor');
    }

    // Línea entre repartidor y destino
    if (destino && repartidor && Number.isFinite(repartidor.lat) && Number.isFinite(destino.lat)) {
      const puntos = [[repartidor.lat, repartidor.lng], [destino.lat, destino.lng]];
      if (rutaRef.current) rutaRef.current.setLatLngs(puntos);
      else rutaRef.current = L.polyline(puntos, { color: '#2f7d32', weight: 3, dashArray: '6 8' }).addTo(mapa);
    }

    // Encuadre
    const puntos = [];
    if (destino && Number.isFinite(destino.lat)) puntos.push([destino.lat, destino.lng]);
    if (repartidor && Number.isFinite(repartidor.lat)) puntos.push([repartidor.lat, repartidor.lng]);
    if (puntos.length === 2) mapa.fitBounds(puntos, { padding: [40, 40], maxZoom: 16 });
    else if (puntos.length === 1) mapa.setView(puntos[0], 15);

    setTimeout(() => mapa.invalidateSize(), 0);
  }, [destino?.lat, destino?.lng, repartidor?.lat, repartidor?.lng]);

  return <div ref={contenedorRef} className="mapa-seguimiento" style={{ height }} />;
}
