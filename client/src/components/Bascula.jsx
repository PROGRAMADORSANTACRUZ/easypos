import { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Modal, Button } from './ui/index.jsx';
import { useToast } from '../App.jsx';
import { formatoPeso } from '../bascula.js';

const puente = () => window.posDesktop?.bascula;
const LECTURA_VIGENTE_MS = 3000;

// Los comandos se escriben como texto con escapes (\r, \n, \x05) para poder configurarlos a mano
const desescapar = (texto) => String(texto || '')
  .replace(/\\x([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
  .replace(/\\r/g, '\r').replace(/\\n/g, '\n');
const escapar = (texto) => String(texto || '').replace(/[\x00-\x1f\x7f]/g, (c) => (
  c === '\r' ? '\\r' : c === '\n' ? '\\n' : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`));

export function useBascula() {
  const [estado, setEstado] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [, setReloj] = useState(0);

  useEffect(() => {
    const b = puente();
    if (!b) return undefined;
    let activo = true;
    b.estado().then((e) => { if (activo) { setEstado(e); setLectura(e.lectura); } }).catch(() => {});
    const quitarPeso = b.onPeso((l) => setLectura(l));
    const quitarEstado = b.onEstado((e) => { setEstado(e); if (!e.conectada) setLectura(null); });
    // Re-render periodico para que una lectura vieja deje de mostrarse como vigente
    const reloj = setInterval(() => setReloj((n) => n + 1), 1000);
    return () => { activo = false; quitarPeso(); quitarEstado(); clearInterval(reloj); };
  }, []);

  const vigente = lectura && Date.now() - lectura.fecha < LECTURA_VIGENTE_MS ? lectura : null;
  return { disponible: Boolean(puente()), estado, setEstado, lectura: vigente };
}

export function PanelBascula({ bascula }) {
  const [configurando, setConfigurando] = useState(false);
  if (!bascula.disponible) return null;
  const { estado, lectura } = bascula;
  const conectada = Boolean(estado?.conectada);
  return (
    <div className="bascula-panel" role="status" aria-live="polite">
      <Icon name="bascula" size={22} />
      <div className="bascula-panel__peso">
        {!conectada ? <span className="mini">Báscula sin conectar</span>
          : lectura?.sobrecarga ? <strong>Sobrecarga</strong>
            : <strong>{formatoPeso(lectura?.kg)}</strong>}
        {conectada && lectura && !lectura.sobrecarga && (
          <span className={`badge ${lectura.estable ? 'green' : 'orange'}`}>{lectura.estable ? 'Estable' : 'Estabilizando…'}</span>
        )}
        {conectada && !lectura && <span className="mini">Esperando peso…</span>}
      </div>
      <button type="button" className="btn btn-sm" title="Configurar báscula" onClick={() => setConfigurando(true)}>
        <Icon name="ajustes" size={16} />
      </button>
      {configurando && <ConfigBascula bascula={bascula} onClose={() => setConfigurando(false)} />}
    </div>
  );
}

function ConfigBascula({ bascula, onClose }) {
  const notify = useToast();
  const [puertos, setPuertos] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [form, setForm] = useState(() => {
    const c = bascula.estado?.config || {};
    return {
      path: c.path || '',
      baudRate: c.baudRate || 9600,
      dataBits: c.dataBits || 8,
      parity: c.parity || 'none',
      stopBits: c.stopBits || 1,
      perfil: c.perfil || 'continuo',
      comando: escapar(c.comando),
      unidadPorDefecto: c.unidadPorDefecto || 'kg',
    };
  });
  const [ocupado, setOcupado] = useState('');
  const [progreso, setProgreso] = useState('');

  const cargarPuertos = () => puente().puertos().then(setPuertos).catch((e) => notify(e.message, 'err'));
  useEffect(() => {
    cargarPuertos();
    puente().perfiles().then(setPerfiles).catch(() => {});
    // Refresca la ultima trama recibida aunque no se haya podido interpretar como peso
    const refresco = setInterval(() => puente().estado().then(bascula.setEstado).catch(() => {}), 700);
    const quitarProgreso = puente().onProgreso(setProgreso);
    return () => { clearInterval(refresco); quitarProgreso(); };
  }, []);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const elegirPerfil = (e) => {
    const perfil = perfiles.find((p) => p.id === e.target.value);
    setForm((f) => ({ ...f, perfil: e.target.value, comando: perfil?.id === 'personalizado' ? f.comando : escapar(perfil?.comando) }));
  };
  const aplicar = (estado) => {
    bascula.setEstado(estado);
    const c = estado.config || {};
    setForm((f) => ({ ...f, ...c, comando: escapar(c.comando) }));
  };
  const ejecutar = async (accion, fn) => {
    setOcupado(accion);
    try { await fn(); } catch (e) { notify(e.message, 'err'); } finally { setOcupado(''); setProgreso(''); }
  };

  const detectar = () => ejecutar('detectar', async () => {
    const estado = await puente().detectar();
    aplicar(estado);
    notify(`Báscula detectada en ${estado.config.path} (${estado.config.baudRate} baudios)`);
  });
  const conectar = () => ejecutar('conectar', async () => {
    const estado = await puente().conectar({
      ...form,
      comando: form.comando ? desescapar(form.comando) : null,
    });
    aplicar(estado);
    notify(`Báscula conectada en ${estado.config.path}`);
  });
  const desconectar = () => ejecutar('desconectar', async () => aplicar(await puente().desconectar()));

  const { estado, lectura } = bascula;
  return (
    <Modal
      title="Báscula"
      subtitle="Lee el peso por puerto COM. La configuración se guarda en este equipo."
      onClose={onClose}
      size="md"
      footer={(
        <>
          {estado?.conectada && <Button variant="secondary" disabled={!!ocupado} onClick={desconectar}>Desconectar</Button>}
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon="check" disabled={!!ocupado || !form.path} onClick={conectar}>
            {ocupado === 'conectar' ? 'Conectando…' : 'Conectar'}
          </Button>
        </>
      )}
    >
      <div className="bascula-config">
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" icon="bascula" disabled={!!ocupado} onClick={detectar}>
            {ocupado === 'detectar' ? 'Detectando…' : 'Detectar automáticamente'}
          </Button>
          {progreso && <span className="mini">Probando {progreso}</span>}
        </div>
        <p className="mini">Enciende la báscula, pon algo encima y presiona detectar. Si no la encuentra, configúrala abajo.</p>

        <div className="grid form-2col" style={{ gap: 12 }}>
          <div className="field">
            <label>Puerto COM</label>
            <div className="row" style={{ gap: 6 }}>
              <select value={form.path} onChange={cambiar('path')} style={{ flex: 1 }}>
                <option value="">Selecciona…</option>
                {form.path && !puertos.some((p) => p.path === form.path) && <option value={form.path}>{form.path}</option>}
                {puertos.map((p) => <option key={p.path} value={p.path}>{p.nombre === p.path ? p.path : `${p.path} · ${p.nombre}`}</option>)}
              </select>
              <button type="button" className="btn btn-sm" title="Actualizar puertos" onClick={cargarPuertos}><Icon name="reload" size={16} /></button>
            </div>
          </div>
          <div className="field">
            <label>Protocolo / marca</label>
            <select value={form.perfil} onChange={elegirPerfil}>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Velocidad (baudios)</label>
            <select value={form.baudRate} onChange={cambiar('baudRate')}>
              {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Datos · paridad · parada</label>
            <div className="row" style={{ gap: 6 }}>
              <select value={form.dataBits} onChange={cambiar('dataBits')}>
                <option value={8}>8</option><option value={7}>7</option>
              </select>
              <select value={form.parity} onChange={cambiar('parity')}>
                <option value="none">Ninguna</option><option value="even">Par</option><option value="odd">Impar</option>
              </select>
              <select value={form.stopBits} onChange={cambiar('stopBits')}>
                <option value={1}>1</option><option value={2}>2</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Comando para pedir el peso</label>
            <input
              value={form.comando}
              placeholder="Vacío = la báscula envía sola"
              disabled={form.perfil !== 'personalizado'}
              onChange={cambiar('comando')}
            />
          </div>
          <div className="field">
            <label>Unidad si la báscula no la envía</label>
            <select value={form.unidadPorDefecto} onChange={cambiar('unidadPorDefecto')}>
              <option value="kg">Kilogramos</option><option value="g">Gramos</option><option value="lb">Libras</option>
            </select>
          </div>
        </div>

        <div className="bascula-config__lectura">
          <div><span className="mini">Estado: </span><strong>{estado?.conectada ? `Conectada (${estado.config?.path})` : 'Desconectada'}</strong></div>
          <div><span className="mini">Peso: </span><strong>{formatoPeso(lectura?.kg)}</strong>{lectura && ` · ${lectura.estable ? 'estable' : 'inestable'}`}</div>
          {estado?.ultimaTrama && <div className="mini">Última trama: <code>{estado.ultimaTrama}</code></div>}
          {estado?.error && <div className="mini" role="alert" style={{ color: 'var(--red)' }}>{estado.error}</div>}
        </div>
      </div>
    </Modal>
  );
}
