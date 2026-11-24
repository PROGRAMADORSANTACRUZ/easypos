import { useEffect, useMemo, useState } from 'react';

// Pagina publica de reservas: /reservar/<restaurante>. No requiere sesion; el restaurante viaja en x-tenant-id.
const BASE = (typeof window !== 'undefined' && window.POS_API_URL) || '/api';
const MINUTOS_PARA_CONFIRMAR = 5;
const TOLERANCIA_MIN = 10;
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const slugRestaurante = () => decodeURIComponent(window.location.pathname.split('/')[2] || '');

async function apiPublica(ruta, opciones = {}) {
  const slug = slugRestaurante();
  const res = await fetch(`${BASE}/reservas-publicas${ruta}`, {
    credentials: 'omit',
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(slug && { 'x-tenant-id': slug }) },
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || 'No se pudo completar la solicitud');
  return datos;
}

const hoyColombia = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const sumarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const diaSemana = (fecha) => new Date(`${fecha}T00:00:00Z`).getUTCDay();
const fechaLarga = (fecha) => `${DIAS[diaSemana(fecha)].charAt(0)}${DIAS[diaSemana(fecha)].slice(1).toLowerCase()} ${Number(fecha.slice(8))} ${MESES[Number(fecha.slice(5, 7)) - 1].slice(0, 3)}`;
const fechaCorta = (fecha) => `${Number(fecha.slice(8))} de ${MESES[Number(fecha.slice(5, 7)) - 1]}`;
const hora12 = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const capitalizar = (texto) => texto.toLowerCase().replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());

function Pasos({ personas, fecha, hora, zona, mesa }) {
  const pasos = [
    ['Número de personas', personas ? `${personas} pax` : ''],
    ['Selecciona fecha', fecha ? fechaCorta(fecha) : ''],
    ['Selecciona hora', hora ? hora12(hora) : ''],
    ['Zona y mesa', zona && mesa ? `${capitalizar(zona)} · Mesa ${mesa.numero}` : ''],
  ];
  return (
    <ol className="rsv-pasos">
      {pasos.map(([titulo, valor], i) => (
        <li key={titulo} className={valor ? 'is-hecho' : ''}>
          <span className="rsv-pasos__num">{i + 1}</span>
          <span><strong>{titulo}</strong>{valor && <small>{valor}</small>}</span>
        </li>
      ))}
    </ol>
  );
}

function Calendario({ fecha, onElegir, diasAnticipacion }) {
  const hoy = hoyColombia();
  const limite = sumarDias(hoy, diasAnticipacion);
  const [mes, setMes] = useState(() => (fecha || hoy).slice(0, 7));
  const primero = `${mes}-01`;
  const siguienteMes = sumarDias(primero, 32).slice(0, 7);
  const diasMes = (Date.parse(`${siguienteMes}-01T00:00:00Z`) - Date.parse(`${primero}T00:00:00Z`)) / 86400000;
  const celdas = [...Array(diaSemana(primero)).fill(null), ...Array.from({ length: diasMes }, (_, i) => sumarDias(primero, i))];
  const anterior = sumarDias(primero, -1).slice(0, 7);
  return (
    <div className="rsv-calendario">
      <div className="rsv-calendario__mes">
        <button type="button" aria-label="Mes anterior" disabled={mes <= hoy.slice(0, 7)} onClick={() => setMes(anterior)}>‹</button>
        <strong>{capitalizar(MESES[Number(mes.slice(5)) - 1])} {mes.slice(0, 4)}</strong>
        <button type="button" aria-label="Mes siguiente" disabled={siguienteMes > limite.slice(0, 7)} onClick={() => setMes(siguienteMes)}>›</button>
      </div>
      <div className="rsv-calendario__grid">
        {DIAS.map((d) => <span key={d} className="rsv-calendario__dia">{d}</span>)}
        {celdas.map((dia, i) => (dia ? (
          <button key={dia} type="button" className={dia === fecha ? 'is-activo' : ''} disabled={dia < hoy || dia > limite} onClick={() => onElegir(dia)}>
            {Number(dia.slice(8))}
          </button>
        ) : <span key={`v${i}`} />))}
      </div>
    </div>
  );
}

export default function ReservaPublica() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [personas, setPersonas] = useState(2);
  const [masPersonas, setMasPersonas] = useState(false);
  const [fecha, setFecha] = useState(hoyColombia);
  const [turnos, setTurnos] = useState([]);
  const [cargandoTurnos, setCargandoTurnos] = useState(false);
  const [hora, setHora] = useState('');
  const [zona, setZona] = useState('');
  const [mesas, setMesas] = useState([]);
  const [mesa, setMesa] = useState(null);
  const [modal, setModal] = useState(''); // zona | datos
  const [etapa, setEtapa] = useState('seleccion'); // seleccion | confirmar | listo
  const [cliente, setCliente] = useState({ nombre: '', celular: '', email: '', comentarios: '' });
  const [acepta, setAcepta] = useState({ terminos: false, datos: false, marketing: false });
  const [segundos, setSegundos] = useState(MINUTOS_PARA_CONFIRMAR * 60);
  const [enviando, setEnviando] = useState(false);
  const [reserva, setReserva] = useState(null);
  const [tocados, setTocados] = useState({});
  const [documento, setDocumento] = useState(''); // terminos | privacidad

  useEffect(() => {
    document.title = 'Reservas · Asados Santacruz';
    apiPublica('/info').then((datos) => {
      setInfo(datos);
      if (datos.restaurante && datos.restaurante !== 'Restaurante') document.title = `Reservas · ${datos.restaurante}`;
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!fecha) return;
    let activo = true;
    setCargandoTurnos(true);
    apiPublica(`/disponibilidad?fecha=${fecha}`)
      .then((datos) => { if (activo) setTurnos(datos); })
      .catch((e) => { if (activo) { setTurnos([]); setError(e.message); } })
      .finally(() => { if (activo) setCargandoTurnos(false); });
    return () => { activo = false; };
  }, [fecha]);

  useEffect(() => {
    if (etapa !== 'confirmar') return undefined;
    setSegundos(MINUTOS_PARA_CONFIRMAR * 60);
    const reloj = setInterval(() => setSegundos((s) => s - 1), 1000);
    return () => clearInterval(reloj);
  }, [etapa]);

  useEffect(() => {
    if (etapa === 'confirmar' && segundos <= 0) {
      setEtapa('seleccion');
      setError('Se acabó el tiempo para confirmar. Vuelve a elegir la hora y la mesa.');
      setHora(''); setMesa(null); setZona('');
    }
  }, [segundos, etapa]);

  const elegirFecha = (dia) => { setFecha(dia); setHora(''); setMesa(null); setZona(''); setError(''); };

  const elegirHora = async (turno) => {
    setHora(turno); setMesa(null); setZona(info?.zonas?.length === 1 ? info.zonas[0] : ''); setError('');
    try {
      setMesas(await apiPublica(`/mesas?fecha=${fecha}&hora=${turno}`));
      setModal('zona');
    } catch (e) { setError(e.message); }
  };


  const confirmar = async () => {
    setEnviando(true); setError('');
    try {
      const creada = await apiPublica('', {
        method: 'POST',
        body: JSON.stringify({
          personas, fecha, hora, zona, mesaId: mesa.id, ...cliente,
          aceptaPoliticas: acepta.terminos && acepta.datos, aceptaMarketing: acepta.marketing,
        }),
      });
      setReserva(creada);
      setEtapa('listo');
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setEtapa('seleccion'); setReserva(null); setHora(''); setMesa(null); setZona(''); setError('');
    setCliente({ nombre: '', celular: '', email: '', comentarios: '' });
    setAcepta({ terminos: false, datos: false, marketing: false });
    setTocados({});
    elegirFecha(fecha);
  };

  const mesasOrdenadas = useMemo(() => [...mesas].sort((a, b) => a.numero - b.numero), [mesas]);
  const nombreRestaurante = info?.restaurante && info.restaurante !== 'Restaurante' ? info.restaurante : 'Asados Santacruz';

  const erroresCliente = {
    nombre: cliente.nombre.trim().length < 3 ? 'Escribe tu nombre completo' : '',
    celular: cliente.celular.replace(/\D/g, '').length < 7 ? 'El celular no es válido' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email.trim()) ? 'El correo electrónico no es válido' : '',
  };
  const datosValidos = !erroresCliente.nombre && !erroresCliente.celular && !erroresCliente.email && acepta.terminos && acepta.datos;
  const tocar = (campo) => setTocados((t) => ({ ...t, [campo]: true }));
  const campoCliente = (campo, props) => (
    <div className="rsv-campo">
      <input className={`rsv-input${tocados[campo] && erroresCliente[campo] ? ' is-error' : ''}`} value={cliente[campo]}
        onChange={(e) => setCliente({ ...cliente, [campo]: e.target.value })} onBlur={() => tocar(campo)}
        aria-invalid={Boolean(tocados[campo] && erroresCliente[campo])} {...props} />
      {tocados[campo] && erroresCliente[campo] && <small className="rsv-campo__error">{erroresCliente[campo]}</small>}
    </div>
  );
  const camposCliente = (
    <>
      {campoCliente('nombre', { placeholder: 'Nombre completo', autoComplete: 'name' })}
      <div className="rsv-tel"><span>🇨🇴 +57</span>{campoCliente('celular', { placeholder: 'Celular', inputMode: 'tel', autoComplete: 'tel' })}</div>
      {campoCliente('email', { type: 'email', placeholder: 'Email', autoComplete: 'email' })}
    </>
  );

  const enlaceDocumento = (tipo, texto) => (
    <button type="button" className="rsv-enlace" onClick={(e) => { e.preventDefault(); setDocumento(tipo); }}>{texto}</button>
  );

  const casillas = (
    <div className="rsv-politicas">
      <label><input type="checkbox" checked={acepta.terminos} onChange={(e) => setAcepta({ ...acepta, terminos: e.target.checked })} />
        <span>Al ingresar los datos y continuar declaro que conozco y acepto el tratamiento de datos personales previamente informado
          y acepto los {enlaceDocumento('terminos', 'Términos y condiciones')} y la {enlaceDocumento('privacidad', 'Política de privacidad')} de <b>{nombreRestaurante}</b>.</span></label>
      <label><input type="checkbox" checked={acepta.datos} onChange={(e) => setAcepta({ ...acepta, datos: e.target.checked })} />
        <span>Autorizo a <b>{nombreRestaurante}</b> a usar mis datos (nombre, celular y correo) para gestionar esta reserva y contactarme
          sobre ella, conforme a la Ley 1581 de 2012.</span></label>
      {etapa === 'confirmar' && (
        <label><input type="checkbox" checked={acepta.marketing} onChange={(e) => setAcepta({ ...acepta, marketing: e.target.checked })} />
          <span>Autorizo el uso de mis datos personales para recibir novedades, invitaciones a eventos, experiencias y beneficios especiales del restaurante.</span></label>
      )}
    </div>
  );

  const ventanaDocumento = documento && (
    <div className="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="rsv-doc-titulo" style={{ zIndex: 60 }}>
      <div className="rsv-modal__caja rsv-documento">
        <button type="button" className="rsv-modal__cerrar" aria-label="Cerrar" onClick={() => setDocumento('')}>×</button>
        {documento === 'terminos' ? (
          <>
            <h2 id="rsv-doc-titulo">Términos y condiciones de reserva</h2>
            <ol>
              <li>La reserva es gratuita y queda confirmada al finalizar el proceso en esta página.</li>
              <li>Cada reserva corresponde a una mesa, una fecha y una hora. La mesa se asigna a quien confirme primero.</li>
              <li>La mesa se guarda hasta <b>{TOLERANCIA_MIN} minutos</b> después de la hora reservada. Pasado ese tiempo la reserva puede liberarse
                y la mesa se asignará según disponibilidad.</li>
              <li>La reserva tiene una duración de {info?.duracionMin || 60} minutos para el uso de la mesa.</li>
              <li>Si no puedes asistir o necesitas cambiar tu reserva, comunícate con el restaurante con anticipación.</li>
              <li>El restaurante puede cancelar o modificar reservas por causas de fuerza mayor y lo informará a los datos de contacto registrados.</li>
              <li>Los datos ingresados deben ser veraces; las reservas con datos falsos podrán cancelarse.</li>
            </ol>
          </>
        ) : (
          <>
            <h2 id="rsv-doc-titulo">Política de privacidad y tratamiento de datos</h2>
            <p><b>{nombreRestaurante}</b> es responsable del tratamiento de los datos personales que entregas al hacer una reserva, de acuerdo con la
              Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>
            <ul>
              <li><b>Datos que recogemos:</b> nombre, celular, correo electrónico, número de personas, fecha, hora y comentarios de la reserva.</li>
              <li><b>Para qué los usamos:</b> registrar y gestionar tu reserva, contactarte sobre ella y, solo si lo autorizas, enviarte novedades,
                eventos y beneficios del restaurante.</li>
              <li><b>Tus derechos:</b> conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y presentar quejas ante la
                Superintendencia de Industria y Comercio.</li>
              <li><b>Cómo ejercerlos:</b> comunícate directamente con el restaurante por sus canales de atención.</li>
              <li>Tus datos no se venden ni se comparten con terceros ajenos a la gestión de tu reserva.</li>
            </ul>
          </>
        )}
        <button type="button" className="rsv-btn rsv-btn--negro" onClick={() => setDocumento('')}>Entendido</button>
      </div>
    </div>
  );

  if (etapa === 'listo' && reserva) {
    const fechaReserva = new Date(reserva.fechaHora);
    return (
      <div className="rsv rsv--fondo">
        <div className="rsv-exito">
          <span className="rsv-exito__check" aria-hidden="true">✓</span>
          <img className="rsv-logo rsv-logo--exito" src="/logo-oscuro.png" alt={nombreRestaurante} />
          <h1>¡Felicitaciones!</h1>
          <p><b>{capitalizar(reserva.nombre)}</b>, tu reserva ha sido realizada y confirmada con éxito.</p>
          <div className="rsv-resumen rsv-resumen--linea">
            <span>👤 {reserva.personas}</span>
            <span>📅 {fechaCorta(fecha)}</span>
            <span>🕒 {fechaReserva.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}</span>
            <span>🍽️ {capitalizar(reserva.zona)} · Mesa {reserva.mesa}</span>
          </div>
          <p>Recuerda que la mesa únicamente se guardará por <b>{TOLERANCIA_MIN} minutos</b> después de la hora reservada. Después de ese tiempo
            podrás hacer uso de tu reserva solo si tenemos disponibilidad.</p>
          <p className="rsv-exito__cierre">¡Te esperamos!</p>
          <button type="button" className="rsv-btn rsv-btn--negro" onClick={reiniciar}>Finalizar</button>
          {info?.telefono && <p className="rsv-exito__contacto">Si tienes alguna consulta, comunícate al <b>{info.telefono}</b></p>}
        </div>
      </div>
    );
  }

  if (etapa === 'confirmar') {
    const mm = String(Math.floor(Math.max(segundos, 0) / 60));
    const ss = String(Math.max(segundos, 0) % 60).padStart(2, '0');
    return (
      <div className="rsv">
        <header className="rsv-top">
          <button type="button" className="rsv-volver" onClick={() => setEtapa('seleccion')}>‹ Volver</button>
          <img className="rsv-logo" src="/logo-oscuro.png" alt={nombreRestaurante} />
          <span className="rsv-reloj">Para completar tu reserva te quedan <b>{mm}:{ss}</b></span>
        </header>
        <main className="rsv-confirmar">
          <h1>¡Falta poco para completar tu reserva!</h1>
          <p>Verifica los datos y haz clic en «Confirmar reserva».</p>
          <div className="rsv-confirmar__cols">
            <section>
              <h2>Datos del cliente</h2>
              {camposCliente}
              <textarea className="rsv-input" rows={3} maxLength={500} placeholder="Comentarios (opcional)" value={cliente.comentarios} onChange={(e) => setCliente({ ...cliente, comentarios: e.target.value })} />
            </section>
            <section>
              <h2>Datos de la reserva</h2>
              <div className="rsv-resumen">
                <div><small>Personas</small><b>{personas}</b></div>
                <div><small>Fecha</small><b>{fechaCorta(fecha)}</b></div>
                <div><small>Hora</small><b>{hora12(hora)}</b></div>
                <div><small>Zona</small><b>{capitalizar(zona)}</b></div>
                <div><small>Mesa</small><b>{mesa?.numero}</b></div>
              </div>
            </section>
          </div>
          {casillas}
          {error && <p className="rsv-error" role="alert">{error}</p>}
          <button type="button" className="rsv-btn rsv-btn--negro rsv-btn--ancho" disabled={!datosValidos || enviando} onClick={confirmar}>
            {enviando ? 'Confirmando…' : 'CONFIRMAR RESERVA'}
          </button>
        </main>
        {ventanaDocumento}
      </div>
    );
  }

  return (
    <div className="rsv">
      <header className="rsv-top">
        <img className="rsv-logo" src="/logo-oscuro.png" alt={nombreRestaurante} />
      </header>
      <Pasos personas={personas} fecha={fecha} hora={hora} zona={zona} mesa={mesa} />
      <main className="rsv-fondo">
        {error && <p className="rsv-error" role="alert">{error}</p>}
        <div className="rsv-paneles">
          <section className="rsv-panel">
            <h2>Personas</h2>
            <p>Selecciona el número de personas</p>
            <div className="rsv-personas">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" className={personas === n && !masPersonas ? 'is-activo' : ''} onClick={() => { setPersonas(n); setMasPersonas(false); }}>{n}</button>
              ))}
              <button type="button" className={masPersonas ? 'is-activo' : ''} aria-label="Más personas" onClick={() => { setMasPersonas(true); setPersonas((p) => Math.max(p, 10)); }}>+</button>
            </div>
            {masPersonas && (
              <input className="rsv-input rsv-input--centro" type="number" min={10} max={100} value={personas}
                onChange={(e) => setPersonas(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} aria-label="Número de personas" />
            )}
          </section>
          <section className="rsv-panel">
            <h2>Fecha</h2>
            <p>Selecciona la fecha para tu reserva</p>
            {info && <Calendario fecha={fecha} onElegir={elegirFecha} diasAnticipacion={info.diasAnticipacion} />}
          </section>
          <section className="rsv-panel">
            <h2>Hora</h2>
            <p>Selecciona una hora disponible</p>
            <div className="rsv-hora-dia">
              <button type="button" aria-label="Día anterior" disabled={fecha <= hoyColombia()} onClick={() => elegirFecha(sumarDias(fecha, -1))}>‹</button>
              <span>{fechaLarga(fecha)}</span>
              <button type="button" aria-label="Día siguiente" disabled={!info || sumarDias(fecha, 1) > sumarDias(hoyColombia(), info.diasAnticipacion)} onClick={() => elegirFecha(sumarDias(fecha, 1))}>›</button>
            </div>
            <div className="rsv-horas">
              {cargandoTurnos ? <p>Consultando disponibilidad…</p> : turnos.map((t) => (
                <button key={t.hora} type="button" disabled={!t.disponible} className={hora === t.hora ? 'is-activo' : ''} onClick={() => elegirHora(t.hora)}>
                  {hora12(t.hora)}
                </button>
              ))}
            </div>
            <div className="rsv-leyenda"><span><i className="rsv-leyenda__libre" /> Disponibles</span><span><i className="rsv-leyenda__no" /> No disponibles</span></div>
          </section>
        </div>
        <button type="button" className="rsv-btn rsv-btn--negro rsv-btn--ancho" disabled={!mesa} onClick={() => setModal('datos')}>CONTINUAR</button>
      </main>

      {modal === 'zona' && (
        <div className="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="rsv-zona-titulo">
          <div className="rsv-modal__caja">
            <button type="button" className="rsv-modal__cerrar" aria-label="Cerrar" onClick={() => setModal('')}>×</button>
            <h2 id="rsv-zona-titulo">Seleccione una zona</h2>
            <div className="rsv-zonas">
              {(info?.zonas || []).map((z) => (
                <button key={z} type="button" className={zona === z ? 'is-activo' : ''} onClick={() => setZona(z)}>{capitalizar(z)}</button>
              ))}
            </div>
            {zona && (
              <>
                <h3>Elige tu mesa</h3>
                <div className="rsv-mesas">
                  {mesasOrdenadas.map((m) => (
                    <button key={m.id} type="button" disabled={!m.disponible} className={mesa?.id === m.id ? 'is-activo' : ''} onClick={() => { setMesa(m); setModal(''); }}>
                      <strong>Mesa {m.numero}</strong><small>{m.disponible ? `${m.capacidad} puestos` : 'Reservada'}</small>
                    </button>
                  ))}
                </div>
                {mesasOrdenadas.every((m) => !m.disponible) && <p className="rsv-error">No quedan mesas para esta hora. Elige otra hora.</p>}
              </>
            )}
            <button type="button" className="rsv-btn rsv-btn--negro" disabled={!mesa} onClick={() => setModal('')}>Continuar</button>
          </div>
        </div>
      )}

      {modal === 'datos' && (
        <div className="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="rsv-datos-titulo">
          <div className="rsv-modal__caja">
            <button type="button" className="rsv-modal__cerrar" aria-label="Cerrar" onClick={() => setModal('')}>×</button>
            <h2 id="rsv-datos-titulo">Ingresa tus datos</h2>
            {camposCliente}
            {casillas}
            <button type="button" className="rsv-btn rsv-btn--negro" disabled={!datosValidos} onClick={() => { setModal(''); setEtapa('confirmar'); }}>Continuar</button>
          </div>
        </div>
      )}
      {ventanaDocumento}
    </div>
  );
}
