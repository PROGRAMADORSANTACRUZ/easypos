import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { Modal, Button } from './ui/index.jsx';

// Estado de la recogida de una apertura: indicador permanente, avisos tras facturar y modal.
export function useRecogidaCaja(aperturaId) {
  const [estado, setEstado] = useState(null);
  const [modal, setModal] = useState(null);

  // Al abrir la pantalla con la caja en el tope se abre el recuadro y cuenta como aviso;
  // si ya es obligatorio, se abre sin opcion de cancelar.
  useEffect(() => {
    let vigente = true;
    setEstado(null);
    setModal(null);
    if (!aperturaId) return undefined;
    (async () => {
      let actual = await api.get(`/aperturas/${aperturaId}/recogida`);
      if (vigente && actual.requiere && !actual.obligatorio) {
        actual = await api.post(`/aperturas/${aperturaId}/recogida/aviso`, {});
      }
      if (!vigente) return;
      setEstado(actual);
      if (actual.requiere) setModal(actual);
    })().catch(() => {});
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

  const titulo = obligatorio ? 'Recogida obligatoria de efectivo' : 'Recogida de efectivo';
  // Cancelaciones que quedan despues de cancelar este aviso.
  const quedanTrasCancelar = Math.max(0, estado.maxAvisos - estado.avisos - 1);
  const contador = !manual || obligatorio;

  return (
    <Modal
      title={titulo}
      subtitle={manual && !obligatorio ? 'Retira efectivo de la caja sin tocar la base.' : undefined}
      onClose={obligatorio ? undefined : onClose}
      size="md"
      footer={(
        <>
          {!obligatorio && <Button variant="secondary" onClick={onClose}>Cancelar</Button>}
          <Button variant="primary" type="submit" form="recogida-form" loading={guardando}>Confirmar recogida</Button>
        </>
      )}
    >
      <form id="recogida-form" onSubmit={guardar}>
        {estado.requiere && (
          <div role="alert" className={`recogida-aviso${obligatorio ? ' obligatoria' : ''}`}>
            <span className="alerta-recogida-moneda recogida-aviso-moneda"><Icon name="moneda" size={34} /></span>
            <div>
              <div className="recogida-aviso-titulo">
                {obligatorio ? 'Ya no puedes cancelar: confirma la recogida' : 'La caja superó el tope de efectivo'}
              </div>
              <div>
                Tienes <b>{money(estado.efectivoDisponible)}</b> en efectivo sin contar la base; el tope es <b>{money(estado.tope)}</b>.
              </div>
              {contador && (
                <div className="recogida-aviso-contador">
                  Aviso {estado.avisos} de {estado.maxAvisos}
                  {obligatorio ? ' · Debes registrar la recogida para seguir facturando.'
                    : quedanTrasCancelar === 0 ? ' · Si cancelas, el próximo aviso será obligatorio.'
                      : ` · Si cancelas, te ${quedanTrasCancelar === 1 ? 'queda 1 cancelación' : `quedan ${quedanTrasCancelar} cancelaciones`}; el aviso ${estado.maxAvisos} será obligatorio.`}
                </div>
              )}
            </div>
          </div>
        )}
        {manual && !obligatorio && !estado.requiere && (
          <p className="mini">La caja todavía no llega al tope de {money(estado.tope)}; puedes hacer una recogida igual.</p>
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
