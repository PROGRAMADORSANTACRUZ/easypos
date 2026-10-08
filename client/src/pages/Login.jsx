import { useEffect, useState } from 'react';
import { api, setTenantActual } from '../api.js';

export default function Login({ onLogin }) {
  const [restaurantes, setRestaurantes] = useState([]);
  const [restauranteId, setRestauranteId] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

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

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    setTenantActual(restauranteId || null);
    try {
      const user = await api.post('/usuarios/login', { usuario, password });
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
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required placeholder="Tu usuario" />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </main>
    </div>
  );
}
