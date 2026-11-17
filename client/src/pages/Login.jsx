import { useEffect, useRef, useState } from 'react';
import { api, setTenantActual } from '../api.js';
import { Icon } from '../icons.jsx';
import { estadoHuella, activarHuella, leerHuella, quitarHuella, motivoHuella } from '../huella.js';

export default function Login({ onLogin }) {
  const [restaurantes, setRestaurantes] = useState([]);
  const [restauranteId, setRestauranteId] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [huella, setHuella] = useState({ disponible: false, activada: false });
  const huellaIntentada = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const lista = await api.get('/plataforma/restaurantes/publico');
        setRestaurantes(lista);
        // Si solo hay un restaurante (o ninguno seleccionado aun), lo preselecciona
        if (!restauranteId && lista.length > 0) setRestauranteId(lista[0].id);
      } catch {
        // La plataforma multi-restaurante puede no estar disponible; se sigue con login normal.
      }
    })();
  }, []);

  const iniciarSesion = async (usuarioLogin, clave, restaurante) => {
    setTenantActual(restaurante || null);
    return api.post('/usuarios/login', { usuario: usuarioLogin, password: clave });
  };

  const entrarConHuella = async () => {
    setError('');
    let credenciales;
    try {
      credenciales = await leerHuella();
    } catch (err) {
      const motivo = motivoHuella(err);
      if (motivo.includes('INVALIDADA')) {
        setHuella((actual) => ({ ...actual, activada: false }));
        setError('Cambiaron las huellas del teléfono. Ingresa con tu clave y vuelve a activar la huella.');
      } else if (!motivo.includes('CANCELADO')) {
        setError('No se pudo leer la huella. Ingresa con tu usuario y clave.');
      }
      return;
    }
    setCargando(true);
    try {
      const user = await iniciarSesion(credenciales.usuario, credenciales.password, credenciales.restauranteId);
      onLogin(user);
    } catch (err) {
      await quitarHuella().catch(() => {});
      setHuella((actual) => ({ ...actual, activada: false }));
      setError(`${err.message}. Ingresa con tu clave para activar la huella de nuevo.`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    (async () => {
      const estado = await estadoHuella();
      setHuella(estado);
      if (estado.disponible && estado.activada && !huellaIntentada.current) {
        huellaIntentada.current = true;
        entrarConHuella();
      }
    })();
  }, []);

  const quitar = async () => {
    await quitarHuella().catch(() => {});
    setHuella((actual) => ({ ...actual, activada: false }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    const usuarioNormalizado = String(new FormData(e.currentTarget).get('usuario') || usuario).toUpperCase();
    setUsuario(usuarioNormalizado);
    setError('');
    setCargando(true);
    try {
      const user = await iniciarSesion(usuarioNormalizado, password, restauranteId);
      if (huella.disponible && !huella.activada && window.confirm('¿Activar el ingreso con huella en este teléfono?')) {
        try {
          await activarHuella({ usuario: usuarioNormalizado, password, restauranteId: restauranteId || null });
        } catch {
          // Si se cancela o falla, se entra igual y se puede activar en el próximo ingreso.
        }
      }
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-split">
      <aside className="login-hero">
        <div className="login-hero__overlay" />
        <div className="login-hero__content">
          <img src="/logo-claro.png" alt="Asados Santacruz" className="login-hero__logo" />
          <h2 className="login-hero__tagline">Sistema de punto de venta</h2>
          <p className="login-hero__text">Gestiona pedidos, mesas, facturación y caja en un solo lugar.</p>
        </div>
      </aside>

      <main className="login-form-side">
        <form className="login-form" onSubmit={enviar}>
          <div className="login-form__head">
            <span className="login-form__eyebrow">Asados Santacruz</span>
            <h1 className="login-form__title">POS</h1>
            <p className="login-form__subtitle">Inicia sesión para continuar</p>
          </div>
          {restaurantes.length > 0 && (
            <div className="field">
              <label>Restaurante</label>
              <select value={restauranteId} onChange={(e) => setRestauranteId(e.target.value)} required>
                {restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Usuario</label>
            <input name="usuario" autoCapitalize="characters" style={{ textTransform: 'uppercase' }} value={usuario} onChange={(e) => setUsuario(e.target.value.toUpperCase())} autoFocus required placeholder="Tu usuario" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Contraseña</label>
            <div className="login-password">
              <input id="login-password" type={mostrarPassword ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
              <button
                type="button"
                className="login-password__toggle"
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={mostrarPassword}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setMostrarPassword((visible) => !visible)}
              >
                <Icon name={mostrarPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          {huella.disponible && huella.activada && (
            <button type="button" className="btn" style={{ width: '100%', marginTop: 4 }} disabled={cargando} onClick={entrarConHuella}>
              Ingresar con huella
            </button>
          )}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
          {huella.disponible && huella.activada && (
            <button type="button" style={{ width: '100%', marginTop: 8, fontSize: 13, background: 'none', border: 0, color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer' }} onClick={quitar}>
              Quitar el ingreso con huella
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
