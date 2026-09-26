import { createContext, useContext, useState, useCallback, useEffect, Fragment } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Mesas from './pages/Mesas.jsx';
import Cocina from './pages/Cocina.jsx';
import Pedidos from './pages/Pedidos.jsx';
import Repartidor from './pages/Repartidor.jsx';
import TomarPedido from './pages/TomarPedido.jsx';
import Inventario from './pages/Inventario.jsx';
import Bodegas from './pages/Bodegas.jsx';
import Movimientos from './pages/Movimientos.jsx';
import Caja from './pages/Caja.jsx';
import Resoluciones from './pages/Resoluciones.jsx';
import NotasCredito from './pages/NotasCredito.jsx';
import NotasDebito from './pages/NotasDebito.jsx';
import Retenciones from './pages/Retenciones.jsx';
import Compras from './pages/Compras.jsx';
import Proveedores from './pages/Proveedores.jsx';
import Empresa from './pages/Empresa.jsx';
import AsignacionCajas from './pages/AsignacionCajas.jsx';
import TiposDocumento from './pages/TiposDocumento.jsx';
import Categorias from './pages/Categorias.jsx';
import MediosPago from './pages/MediosPago.jsx';
import Restaurantes from './pages/Restaurantes.jsx';
import ListasPrecios from './pages/ListasPrecios.jsx';
import CrudPage from './components/CrudPage.jsx';
import { CRUD_ENTIDADES } from './crudConfig.js';
import Productos from './pages/Productos.jsx';
import Kits from './pages/Kits.jsx';
import Facturas from './pages/Facturas.jsx';
import Cotizaciones from './pages/Cotizaciones.jsx';
import Cortesias from './pages/Cortesias.jsx';
import Cuentas from './pages/Cuentas.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Roles from './pages/Roles.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Reportes from './pages/Reportes.jsx';
import Clientes from './pages/Clientes.jsx';
import Login from './pages/Login.jsx';
import { Icon } from './icons.jsx';
import { Logo } from './components/ui/index.jsx';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// TEMPORAL: bypass de login para previsualizar el diseño sin base de datos.
// Poner en false (o borrar) para restaurar el login normal.
export const DEV_BYPASS = false;
const DEV_USER = { id: 0, nombre: 'Vista previa', roles: ['Dev'], permisos: [], __dev: true };

// Devuelve true si el usuario tiene el permiso indicado (ej: 'facturas.ver')
const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);

// Primera ruta permitida, usada como destino tras login y como "/"
const ORDEN_INICIO = [
  ['pedidos.ver', '/pedidos'], ['mesas.ver', '/mesas'], ['cocina.ver', '/cocina'], ['facturas.ver', '/facturas'],
  ['cuentas.ver', '/cuentas'], ['productos.ver', '/productos'], ['inventario.ver', '/inventario'],
  ['bodegas.ver', '/bodegas'], ['movimientos.ver', '/movimientos'], ['caja.ver', '/caja'], ['resoluciones.ver', '/resoluciones'], ['notas_credito.ver', '/notas-credito'], ['notas_debito.ver', '/notas-debito'], ['retenciones.ver', '/retenciones'], ['compras.ver', '/compras'], ['proveedores.ver', '/proveedores'], ['clientes.ver', '/clientes'], ['reportes.ver', '/reportes'], ['usuarios.ver', '/usuarios'],
  ['roles.ver', '/roles'], ['auditoria.ver', '/auditoria'],
];
const rutaInicial = (user) => {
  // El primer paso de un cajero es abrir la caja: si puede abrirla, aterriza en Caja.
  if (puede(user, 'caja.abrir')) return '/caja';
  return (ORDEN_INICIO.find(([p]) => puede(user, p)) || [null, '/pedidos'])[1];
};

// Sub-reportes que se despliegan en cascada bajo "Reportes"
const REPORTES_NAV = [
  { id: 'totales', nombre: 'Ventas totales' },
  { id: 'dia', nombre: 'Ventas netas por día' },
  { id: 'semana', nombre: 'Ventas netas por semana' },
  { id: 'mes', nombre: 'Ventas netas por mes' },
  { id: 'prod-dia', nombre: 'Ventas por producto por día' },
  { id: 'prod-semana', nombre: 'Ventas por producto por semana' },
  { id: 'prod-mes', nombre: 'Ventas por producto por mes' },
  { id: 'categoria', nombre: 'Ventas por categoría' },
  { id: 'mesera', nombre: 'Ventas por mesera' },
  { id: 'mesa', nombre: 'Ventas por mesa' },
  { id: 'formapago', nombre: 'Ventas por forma de pago' },
  { id: 'facturas', nombre: 'Detalle de facturas' },
  { id: 'gastos', nombre: 'Gastos de insumos (por producto)' },
  { id: 'insumos', nombre: 'Consumo de insumos' },
  { id: 'pedidos-mesa', nombre: 'Pedidos por mesa' },
  { id: 'cocina', nombre: 'Preparación de cocina' },
];

// Módulos agrupados por categoría para un navbar compacto tipo acordeón
const NAV_GRUPOS = [
  {
    id: 'ventas', label: 'Ventas', icon: 'facturas',
    items: [
      { permiso: 'mesas.ver', ruta: '/mesas', label: 'Mesas', icon: 'mesas' },
      { permiso: 'cocina.ver', ruta: '/cocina', label: 'Cocina', icon: 'cocina' },
      { permiso: 'facturas.ver', ruta: '/facturas', label: 'Facturas', icon: 'facturas' },
      { permiso: 'facturas.ver', ruta: '/cotizaciones', label: 'Factura de venta', icon: 'facturas' },
      { permiso: 'cortesias.ver', ruta: '/cortesias', label: 'Cortesías', icon: 'cortesias' },
      { permiso: 'pedidos.ver', ruta: '/pedidos', label: 'Domicilios', icon: 'pedidos' },
      { permiso: 'pedidos.ver', ruta: '/repartidor', label: 'Repartidor / Entregas', icon: 'remisiones' },
      { permiso: 'cuentas.ver', ruta: '/cuentas', label: 'Cuentas por cobrar', icon: 'cuentas' },
      { permiso: 'clientes.ver', ruta: '/clientes', label: 'Clientes', icon: 'clientes' },
      { permiso: 'caja.ver', ruta: '/caja', label: 'Caja', icon: 'caja' },
    ],
  },
  {
    id: 'inventario', label: 'Inventario y Compras', icon: 'inventario',
    items: [
      { permiso: 'productos.ver', ruta: '/productos', label: 'Productos', icon: 'productos' },
      { permiso: 'productos.ver', ruta: '/kits', label: 'Kits', icon: 'kits' },
      { permiso: 'inventario.ver', ruta: '/inventario', label: 'Inventario', icon: 'inventario' },
      { permiso: 'bodegas.ver', ruta: '/bodegas', label: 'Bodegas', icon: 'bodegas' },
      { permiso: 'movimientos.ver', ruta: '/movimientos', label: 'Movimientos', icon: 'movimientos' },
      { permiso: 'compras.ver', ruta: '/compras', label: 'Compras', icon: 'compras' },
      { permiso: 'proveedores.ver', ruta: '/proveedores', label: 'Proveedores', icon: 'proveedores' },
    ],
  },
  {
    id: 'dian', label: 'Facturación DIAN', icon: 'resoluciones',
    items: [
      { permiso: 'resoluciones.ver', ruta: '/resoluciones', label: 'Resoluciones', icon: 'resoluciones' },
      { permiso: 'notas_credito.ver', ruta: '/notas-credito', label: 'Notas crédito', icon: 'notas_credito' },
      { permiso: 'notas_debito.ver', ruta: '/notas-debito', label: 'Notas débito', icon: 'notas_debito' },
      { permiso: 'retenciones.ver', ruta: '/retenciones', label: 'Retenciones', icon: 'retenciones' },
    ],
  },
  {
    id: 'parametros', label: 'Parámetros', icon: 'empresa',
    items: [
      { permiso: 'empresa.ver', ruta: '/parametros/categorias', label: 'Categorías', icon: 'tags' },
      { permiso: 'empresa.ver', ruta: '/parametros/asignacion-cajas', label: 'Asignación de cajas', icon: 'caja' },
      { permiso: 'empresa.ver', ruta: '/parametros/tipos-documentos', label: 'Tipos de documentos', icon: 'resoluciones' },
      { permiso: 'empresa.ver', ruta: '/plataforma/restaurantes', label: 'Restaurantes', icon: 'empresa' },
    ],
  },
  {
    id: 'admin', label: 'Administración', icon: 'usuarios',
    items: [
      { permiso: 'usuarios.ver', ruta: '/usuarios', label: 'Usuarios', icon: 'usuarios' },
      { permiso: 'roles.ver', ruta: '/roles', label: 'Roles y permisos', icon: 'roles' },
      { permiso: 'empresa.ver', ruta: '/empresa', label: 'Empresa', icon: 'empresa' },
      { permiso: 'auditoria.ver', ruta: '/auditoria', label: 'Auditoría', icon: 'auditoria' },
    ],
  },
];

// Rutas de los módulos "Maestros / DIAN" (provienen de la configuración CRUD)
const RUTAS_MAESTROS = CRUD_ENTIDADES.map((e) => e.ruta);

// Devuelve el id del grupo al que pertenece una ruta (para abrirlo automáticamente)
const grupoDeRuta = (path) => {
  if (path.startsWith('/reportes')) return 'reportes';
  if (RUTAS_MAESTROS.some((r) => path.startsWith(r))) return 'maestros';
  const g = NAV_GRUPOS.find((grp) => grp.items.some((it) => path.startsWith(it.ruta)));
  return g?.id || null;
};

export default function App() {
  const [toast, setToast] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(() => localStorage.getItem('easypos_sidebar') === 'colapsado');
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('easypos_user'));
      if (u && !Array.isArray(u.permisos)) return null; // sesión antigua sin permisos: forzar login
      if (u) return u;
    } catch { /* sin sesión válida */ }
    return DEV_BYPASS ? DEV_USER : null;
  });
  const [tema, setTema] = useState(() => localStorage.getItem('easypos_tema') || 'dark');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    localStorage.setItem('easypos_tema', tema);
  }, [tema]);

  // Cierra el menú lateral al navegar (relevante en móvil/tablet)
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname, location.search]);

  // Abre automáticamente la categoría que contiene la ruta actual (acordeón)
  useEffect(() => {
    const id = grupoDeRuta(location.pathname);
    if (id) setGrupoAbierto(id);
  }, [location.pathname]);

  const alternarGrupo = (id) => {
    // Si el sidebar está colapsado, primero se expande y abre el grupo elegido.
    if (colapsado) { setColapsado(false); setGrupoAbierto(id); return; }
    setGrupoAbierto((cur) => (cur === id ? null : id));
  };

  const alternarColapso = () => setColapsado((c) => {
    const nuevo = !c;
    localStorage.setItem('easypos_sidebar', nuevo ? 'colapsado' : 'expandido');
    return nuevo;
  });

  // Renderiza una categoría colapsable con sus módulos visibles según permisos
  const renderGrupo = (grupo) => {
    const visibles = grupo.items.filter((it) => puede(user, it.permiso));
    if (visibles.length === 0) return null;
    const abierto = grupoAbierto === grupo.id;
    const activo = grupoDeRuta(location.pathname) === grupo.id;
    return (
      <div key={grupo.id}>
        <button
          type="button"
          className={`nav-link nav-toggle ${activo ? 'active' : ''}`}
          onClick={() => alternarGrupo(grupo.id)}
          title={grupo.label}
        >
          <span className="nav-toggle-label"><Icon name={grupo.icon} /> {grupo.label}</span>
          <span className={`nav-caret ${abierto ? 'open' : ''}`} aria-hidden><Icon name="chevronDown" size={14} /></span>
        </button>
        {abierto && (
          <div className="nav-submenu">
            {visibles.map((it) => (
              <NavLink key={it.ruta} to={it.ruta} className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}>
                <Icon name={it.icon} size={16} /> {it.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  };

  const alternarTema = () => setTema((t) => (t === 'dark' ? 'light' : 'dark'));

  const notify = useCallback((mensaje, tipo = 'ok') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const login = useCallback((u) => {
    localStorage.setItem('easypos_user', JSON.stringify(u));
    setUser(u);
    navigate(rutaInicial(u));
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem('easypos_user');
    setUser(null);
  }, []);

  const enReportes = location.pathname.startsWith('/reportes');
  const repActivo = new URLSearchParams(location.search).get('r') || 'totales';

  const irAReporte = (id) => {
    navigate(`/reportes?r=${id}`);
  };

  if (!user) {
    return (
      <ToastCtx.Provider value={notify}>
        <Login onLogin={login} />
        {toast && <div className={`toast ${toast.tipo === 'err' ? 'err' : 'ok'}`}>{toast.mensaje}</div>}
      </ToastCtx.Provider>
    );
  }

  const rutaInicio = rutaInicial(user);

  return (    <ToastCtx.Provider value={notify}>
      <AuthCtx.Provider value={{ user, logout }}>
        <div className="app">
          <header className="topbar">
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
            >
              <Icon name="menu" size={22} />
            </button>
            <Logo height={28} />
          </header>
          <div
            className={`sidebar-backdrop ${menuAbierto ? 'show' : ''}`}
            onClick={() => setMenuAbierto(false)}
            aria-hidden
          />
          <aside className={`sidebar ${menuAbierto ? 'open' : ''} ${colapsado ? 'collapsed' : ''}`}>
            <div className="sidebar-top">
              <Logo height={38} />
              <button
                type="button"
                className="sidebar-collapse"
                onClick={alternarColapso}
                title={colapsado ? 'Expandir menú' : 'Contraer menú'}
                aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
              >
                <Icon name={colapsado ? 'forward' : 'back'} size={18} />
              </button>
              <button
                type="button"
                className="theme-toggle"
                onClick={alternarTema}
                title={tema === 'dark' ? 'Modo día' : 'Modo noche'}
                aria-label={tema === 'dark' ? 'Activar modo día' : 'Activar modo noche'}
              >
                {tema === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
              </button>
              <button
                type="button"
                className="sidebar-close"
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            {user?.restaurante?.nombre && (
              <div className="mini" style={{ padding: '0 var(--sp-3, 12px) 8px', opacity: .8 }}>
                <Icon name="empresa" size={13} /> {user.restaurante.nombre}
              </div>
            )}
            {NAV_GRUPOS.filter((g) => g.id !== 'admin').map(renderGrupo)}

            {puede(user, 'reportes.ver') && (
              <div>
                <button
                  type="button"
                  className={`nav-link nav-toggle ${enReportes ? 'active' : ''}`}
                  onClick={() => alternarGrupo('reportes')}
                  title="Reportes"
                >
                  <span className="nav-toggle-label"><Icon name="reportes" /> Reportes</span>
                  <span className={`nav-caret ${grupoAbierto === 'reportes' ? 'open' : ''}`} aria-hidden><Icon name="chevronDown" size={14} /></span>
                </button>
                {grupoAbierto === 'reportes' && (
                  <div className="nav-submenu">
                    {REPORTES_NAV.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className={`nav-subitem ${enReportes && repActivo === r.id ? 'active' : ''}`}
                        onClick={() => irAReporte(r.id)}
                      >
                        {r.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {CRUD_ENTIDADES.some((e) => puede(user, `${e.modulo}.ver`)) && (
              <div>
                <button
                  type="button"
                  className={`nav-link nav-toggle ${grupoDeRuta(location.pathname) === 'maestros' ? 'active' : ''}`}
                  onClick={() => alternarGrupo('maestros')}
                  title="Maestros / DIAN"
                >
                  <span className="nav-toggle-label"><Icon name="maestros" /> Maestros / DIAN</span>
                  <span className={`nav-caret ${grupoAbierto === 'maestros' ? 'open' : ''}`} aria-hidden><Icon name="chevronDown" size={14} /></span>
                </button>
                {grupoAbierto === 'maestros' && (
                  <div className="nav-submenu">
                    {CRUD_ENTIDADES.filter((e) => puede(user, `${e.modulo}.ver`)).map((e) => (
                      <Fragment key={e.ruta}>
                        <NavLink to={e.ruta} className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}>
                          <Icon name={e.icon} size={16} /> {e.label}
                        </NavLink>
                        {e.modulo === 'metodos_pago' && puede(user, 'empresa.ver') && (
                          <NavLink to="/parametros/medios-pago" className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}>
                            <Icon name="caja" size={16} /> Medios de pago
                          </NavLink>
                        )}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}

            {NAV_GRUPOS.filter((g) => g.id === 'admin').map(renderGrupo)}

            <div className="nav-user">
              <div className="nav-user-nombre">{user.nombre}</div>
              <div className="nav-user-rol">{(user.roles || []).join(', ') || '—'}</div>
              <button type="button" className="btn btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={logout}>
                Cerrar sesión
              </button>
            </div>
          </aside>
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to={rutaInicio} replace />} />
              {puede(user, 'pedidos.ver') && <Route path="/pedidos" element={<Pedidos />} />}
              {puede(user, 'pedidos.ver') && <Route path="/repartidor" element={<Repartidor />} />}
              {puede(user, 'mesas.ver') && <Route path="/mesas" element={<Mesas />} />}
              {puede(user, 'mesas.ver') && <Route path="/mesas/:mesaId/pedido" element={<TomarPedido />} />}
              {puede(user, 'cocina.ver') && <Route path="/cocina" element={<Cocina />} />}
              {puede(user, 'productos.ver') && <Route path="/productos" element={<Productos />} />}
              {puede(user, 'productos.ver') && <Route path="/kits" element={<Kits />} />}
              {puede(user, 'inventario.ver') && <Route path="/inventario" element={<Inventario />} />}
              {puede(user, 'bodegas.ver') && <Route path="/bodegas" element={<Bodegas />} />}
              {puede(user, 'movimientos.ver') && <Route path="/movimientos" element={<Movimientos />} />}
              {puede(user, 'caja.ver') && <Route path="/caja" element={<Caja />} />}
              {puede(user, 'resoluciones.ver') && <Route path="/resoluciones" element={<Resoluciones />} />}
              {puede(user, 'notas_credito.ver') && <Route path="/notas-credito" element={<NotasCredito />} />}
              {puede(user, 'notas_debito.ver') && <Route path="/notas-debito" element={<NotasDebito />} />}
              {puede(user, 'retenciones.ver') && <Route path="/retenciones" element={<Retenciones />} />}
              {puede(user, 'compras.ver') && <Route path="/compras" element={<Compras />} />}
              {puede(user, 'proveedores.ver') && <Route path="/proveedores" element={<Proveedores />} />}
              {puede(user, 'facturas.ver') && <Route path="/facturas" element={<Facturas />} />}
              {puede(user, 'facturas.ver') && <Route path="/cotizaciones" element={<Cotizaciones />} />}
              {puede(user, 'cortesias.ver') && <Route path="/cortesias" element={<Cortesias />} />}
              {puede(user, 'cuentas.ver') && <Route path="/cuentas" element={<Cuentas />} />}
              {puede(user, 'clientes.ver') && <Route path="/clientes" element={<Clientes />} />}
              {puede(user, 'usuarios.ver') && <Route path="/usuarios" element={<Usuarios />} />}
              {puede(user, 'roles.ver') && <Route path="/roles" element={<Roles />} />}
              {puede(user, 'empresa.ver') && <Route path="/empresa" element={<Empresa />} />}
              {puede(user, 'empresa.ver') && <Route path="/parametros/categorias" element={<Categorias />} />}
              {puede(user, 'empresa.ver') && <Route path="/parametros/asignacion-cajas" element={<AsignacionCajas />} />}
              {puede(user, 'empresa.ver') && <Route path="/parametros/tipos-documentos" element={<TiposDocumento />} />}
              {puede(user, 'empresa.ver') && <Route path="/parametros/medios-pago" element={<MediosPago />} />}
              {puede(user, 'empresa.ver') && <Route path="/plataforma/restaurantes" element={<Restaurantes />} />}
              {CRUD_ENTIDADES.filter((e) => puede(user, `${e.modulo}.ver`)).map((e) => (
                <Route key={e.ruta} path={e.ruta} element={e.ruta === '/listas-precios' ? <ListasPrecios /> : <CrudPage cfg={e.cfg} />} />
              ))}
              {puede(user, 'auditoria.ver') && <Route path="/auditoria" element={<Auditoria />} />}
              {puede(user, 'reportes.ver') && <Route path="/reportes" element={<Reportes />} />}
              <Route path="*" element={<Navigate to={rutaInicio} replace />} />
            </Routes>
          </main>
          {toast && <div className={`toast ${toast.tipo === 'err' ? 'err' : 'ok'}`}>{toast.mensaje}</div>}
        </div>
      </AuthCtx.Provider>
    </ToastCtx.Provider>
  );
}
