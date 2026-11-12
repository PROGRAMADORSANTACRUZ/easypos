import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { Modal, Button } from './ui/index.jsx';

// Estado de la recogida de una apertura: indicador permanente, avisos tras facturar y modal.
export function useRecogidaCaja(aperturaId) {
  const [estado, setEstado] = useState(null);
  const [modal, setModal] = useState(null);

  // Al abrir la pantalla se muestra el indicador; si ya es obligatoria, el modal no se puede evitar.
  useEffect(() => {
    let vigente = true;
    setEstado(null);
    setModal(null);
    if (!aperturaId) return undefined;
    api.get(`/aperturas/${aperturaId}/recogida`).then((actual) => {
      if (!vigente) return;
      setEstado(actual);
      if (actual.obligatorio) setModal(actual);
    }).catch(() => {});
    return () => { vigente = false; };
  }, [aperturaId]);

  // Tras cada factura: cuenta un aviso si se supero el tope.
  const avisar = async () => {
    if (!aperturaId) return;
    try {
      const actual = await api.post(`/aperturas/${aperturaId}/recogida/aviso`, {});
      setEstado(actual);
      if (actual.requiere) setModal(actual);
    } catch { /* el aviso no debe interrumpir la venta ya registrada */ }
  };

  // Tras un error al facturar: muestra el modal si el servidor exige la recogida.
  const revisar = async () => {
    if (!aperturaId) return;
    try {
      const actual = await api.get(`/aperturas/${aperturaId}/recogida`);
      setEstado(actual);
      if (actual.obligatorio) setModal(actual);
    } catch { /* sin estado disponible */ }
  };

  const abrirManual = async () => {
    const actual = await api.get(`/aperturas/${aperturaId}/recogida`);
    setEstado(actual);
    setModal({ ...actual, manual: true });
  };

  const registrada = (resultado) => {
    setModal(null);
    const { movimiento, ...nuevo } = resultado || {};
    if (nuevo.tope) setEstado(nuevo);
  };

  return { estado, modal, avisar, revisar, abrirManual, cerrar: () => setModal(null), registrada };
}

// Moneda parpadeante visible mientras el efectivo sin base este en el tope o por encima.
export function IndicadorRecogida({ estado, onClick }) {
  if (!estado?.requiere) return null;
  return (
    <button type="button" className={`alerta-recogida${estado.obligatorio ? ' obligatoria' : ''}`} onClick={onClick}
      title="Haz una recogida parcial de efectivo">
      <span className="alerta-recogida-moneda"><Icon name="moneda" size={20} /></span>
      <span>
        <b>{estado.obligatorio ? 'Recogida obligatoria' : 'Haz una recogida'}</b>
        <span className="alerta-recogida-detalle">{money(estado.efectivoDisponible)} en efectivo (tope {money(estado.tope)})</span>
      </span>
    </button>
  );
}

// Modal de recogida controlado por useRecogidaCaja.
export function RecogidaCaja({ aperturaId, control, onRegistrada }) {
  if (!control.modal || !aperturaId) return null;
  return (
    <RecogidaParcialModal
      aperturaId={aperturaId}
      estado={control.modal}
      manual={!!control.modal.manual}
      onClose={control.cerrar}
      onRegistrada={(resultado) => { control.registrada(resultado); onRegistrada?.(resultado); }}
    />
  );
}

export default function RecogidaParcialModal({ aperturaId, estado, manual = false, onClose, onRegistrada }) {
  const notify = useToast();
  const sugerido = Math.max(0, estado.efectivoDisponible);
  const [monto, setMonto] = useState(sugerido > 0 ? String(sugerido) : '');
  const [motivo, setMotivo] = useState('Recogida parcial');
  const [guardando, setGuardando] = useState(false);
  const obligatorio = !!estado.obligatorio;

  const guardar = async (e) => {
    e.preventDefault();
    try {
      setGuardando(true);
      const resultado = await api.post(`/aperturas/${aperturaId}/recogidas`, { monto: Number(monto), motivo: motivo.trim() });
      notify(`Recogida registrada: ${money(Number(monto))}`);
      onRegistrada?.(resultado);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const titulo = obligatorio ? 'Recogida obligatoria'
    : manual ? 'Recogida parcial' : `Haz una recogida (aviso ${estado.avisos} de ${estado.maxAvisos})`;

  return (
    <Modal
      title={titulo}
      subtitle={manual && !obligatorio ? 'Retira efectivo de la caja sin tocar la base.' : undefined}
      onClose={obligatorio ? undefined : onClose}
      size="sm"
      footer={(
        <>
          {!obligatorio && <Button variant="secondary" onClick={onClose}>{manual ? 'Cancelar' : 'Cancelar por ahora'}</Button>}
          <Button variant="primary" type="submit" form="recogida-form" loading={guardando}>Registrar recogida</Button>
        </>
      )}
    >
      <form id="recogida-form" onSubmit={guardar}>
        {(!manual || obligatorio) && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12, background: obligatorio ? 'var(--red-soft)' : 'var(--warning-soft)', color: obligatorio ? 'var(--red)' : 'var(--warning)' }}>
            {obligatorio
              ? <b>Este es el aviso {estado.maxAvisos} de {estado.maxAvisos}. Debes registrar la recogida para seguir facturando.</b>
              : <>El efectivo en caja llegó al tope de <b>{money(estado.tope)}</b>. Haz una recogida parcial. Al aviso {estado.maxAvisos} será obligatoria.</>}
          </div>
        )}
        {manual && !obligatorio && estado.requiere && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12, background: 'var(--warning-soft)', color: 'var(--warning)' }}>
            El efectivo en caja llegó al tope de <b>{money(estado.tope)}</b>.
          </div>
        )}
        <div className="row between"><span>Base (no se recoge)</span><b>{money(estado.base)}</b></div>
        <div className="row between"><span>Efectivo en caja sin la base</span><b>{money(estado.efectivoDisponible)}</b></div>
        <div className="row between mini"><span>Tope sin la base</span><span>{money(estado.tope)}</span></div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="recogida-monto">Valor a recoger</label>
          <input id="recogida-monto" type="number" min="0.01" step="0.01" max={sugerido || undefined} required autoFocus
            value={monto} onChange={(e) => setMonto(e.target.value)} />
          {estado.requiere && <span className="mini">Deben quedar menos de {money(estado.tope)} en efectivo, sin contar la base.</span>}
        </div>
        <div className="field">
          <label htmlFor="recogida-motivo">Observación</label>
          <input id="recogida-motivo" maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
