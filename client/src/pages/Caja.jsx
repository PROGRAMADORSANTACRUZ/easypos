import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import CierreCajaModal from '../components/CierreCajaModal.jsx';
import { PageHeader, Modal, Button, EmptyState, LoadingState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

export default function Caja() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  const puedeCrear = puede(user, 'caja.crear');
  const puedeAbrir = puede(user, 'caja.abrir');
  const puedeCerrar = puede(user, 'caja.cerrar');

  const [cajas, setCajas] = useState([]);
  const [aperturas, setAperturas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [valorInicial, setValorInicial] = useState('');
  const [abrirModal, setAbrirModal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [cerrando, setCerrando] = useState(null);

  const cargar = async () => {
    try {
      setCargando(true);
      const [cs, aps] = await Promise.all([api.get('/cajas'), api.get('/aperturas')]);
      setCajas(cs);
      setAperturas(aps);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  // La caja es única: se usa la primera existente.
  const caja = cajas[0] || null;

  const crearCaja = async () => {
    try {
      setProcesando(true);
      await api.post('/cajas', { nombre: 'Caja principal' });
      notify('Caja creada');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  const abrir = async (e) => {
    e.preventDefault();
    if (!caja) return notify('Primero crea la caja', 'err');
    try {
      setProcesando(true);
      await api.post('/aperturas', { cajaId: caja.id, valorInicial: Number(valorInicial) || 0 });
      notify('Caja abierta');
      setValorInicial('');
      setAbrirModal(false);
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setProcesando(false);
    }
  };

  const cerrar = (ap) => setCerrando(ap);
  const fmt = (f) => (f ? new Date(f).toLocaleString() : '—');
  const turnoAbierto = aperturas.find((a) => a.estado === 'ABIERTA') || null;

  if (cargando) return <div><PageHeader title="Caja" subtitle="Abre la caja con la base para facturar y dar vueltos." /><LoadingState /></div>;

  return (
    <div>
      <PageHeader title="Caja" subtitle="Abre la caja con la base para poder facturar y dar vueltos." />

      {turnoAbierto ? (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--green)' }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Icon name="cash" size={16} /> <b>Caja abierta</b> — base <b>{money(turnoAbierto.valorInicial)}</b>
              <span className="mini" style={{ marginLeft: 8 }}>desde {fmt(turnoAbierto.fechaApertura)}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {(puede(user, 'facturas.ver') || puede(user, 'factura_venta.ver')) && <Button variant="primary" size="sm" onClick={() => navigate(puede(user, 'facturas.ver') ? '/facturas' : '/cotizaciones')}>Ir a facturar <Icon name="forward" size={14} /></Button>}
              {puedeCerrar && <Button variant="secondary" size="sm" icon="lock" onClick={() => cerrar(turnoAbierto)}>Cerrar caja</Button>}
            </div>
          </div>
        </div>
      ) : !caja ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <EmptyState
            icon="caja"
            title="No hay caja configurada"
            description="Crea la caja del negocio para empezar a abrir turnos."
            action={puedeCrear && <Button variant="primary" icon="add" loading={procesando} onClick={crearCaja} title="Crear caja" />}
          />
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Icon name="lock" size={16} /> <b>No hay caja abierta.</b>{' '}
              {puedeAbrir ? 'Abre un turno con la base inicial.' : 'Pide a un cajero o administrador que abra la caja.'}
            </div>
            {puedeAbrir && <Button variant="primary" icon="cash" onClick={() => setAbrirModal(true)}>Abrir caja</Button>}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Historial de turnos</h3>
        {aperturas.length === 0 ? (
          <EmptyState icon="caja" title="Sin turnos" description="Aún no se ha abierto ningún turno de caja." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuario</th><th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>Esperado</th><th style={{ textAlign: 'right' }}>Contado</th><th style={{ textAlign: 'right' }}>Dif.</th>
                <th>Apertura</th><th>Cierre</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {aperturas.map((ap) => (
                <tr key={ap.id}>
                  <td>{ap.usuario?.usuario || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(ap.valorInicial)}</td>
                  <td style={{ textAlign: 'right' }}>{ap.valorEsperado != null ? money(ap.valorEsperado) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{ap.valorContado != null ? money(ap.valorContado) : '—'}</td>
                  <td style={{ textAlign: 'right', color: ap.diferencia == null ? undefined : ap.diferencia === 0 ? 'var(--green)' : 'var(--red)' }}>
                    {ap.diferencia != null ? money(ap.diferencia) : '—'}
                  </td>
                  <td className="mini">{fmt(ap.fechaApertura)}</td>
                  <td className="mini">{fmt(ap.fechaCierre)}</td>
                  <td><span className={`badge ${ap.estado === 'ABIERTA' ? 'green' : 'gray'}`}>{ap.estado || '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {puedeCerrar && ap.estado === 'ABIERTA' && (
                      <Button variant="secondary" size="sm" onClick={() => cerrar(ap)}>Cerrar</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {abrirModal && (
        <Modal
          title="Abrir caja"
          subtitle="Ingresa la base inicial con la que arranca el turno."
          onClose={() => setAbrirModal(false)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setAbrirModal(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="abrir-caja-form" loading={procesando}>Abrir caja</Button>
            </>
          )}
        >
          <form id="abrir-caja-form" onSubmit={abrir}>
            <div className="field">
              <label>Base inicial</label>
              <input type="number" step="any" value={valorInicial} onChange={(e) => setValorInicial(e.target.value)} autoFocus placeholder="0" />
            </div>
          </form>
        </Modal>
      )}

      {cerrando && (
        <CierreCajaModal
          apertura={cerrando}
          onClose={() => setCerrando(null)}
          onCerrada={() => { setCerrando(null); cargar(); }}
        />
      )}
    </div>
  );
}
