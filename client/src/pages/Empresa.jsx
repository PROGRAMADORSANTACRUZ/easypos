import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { LoadingState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = {
  nit: '', razonSocial: '', nombreComercial: '', direccion: '', telefono: '', correo: '',
  softwareId: '', ambienteDIAN: 'PRUEBAS',
  formatoFactura: 'TICKET_80', formatoFacturaVenta: 'TICKET_80', formatoComanda: 'TICKET_80',
  formatoCortesia: 'TICKET_80', formatoPrefactura: 'TICKET_80',
};

// Formatos de impresion disponibles por tipo de documento (ancho del ticket/hoja).
const FORMATOS = [
  { valor: 'TICKET_80', label: 'Ticket 80mm (térmica estándar)' },
  { valor: 'TICKET_58', label: 'Ticket 58mm (térmica angosta)' },
  { valor: 'A5', label: 'Media carta A5 (impresora normal)' },
];

// Lee un archivo (certificado .p12/.pfx) y devuelve su contenido en base64.
const leerBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Dígito de verificación del NIT (DIAN, módulo 11). Devuelve el DV esperado (0-9).
const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
const digitoVerificacionNit = (numero) => {
  const digitos = String(numero).replace(/\D/g, '').split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (PESOS_NIT[i] || 0), 0);
  const mod = suma % 11;
  return mod > 1 ? 11 - mod : mod;
};

// Valida un NIT con formato "numero-dv"; si no trae dv solo exige dígitos.
const validarNit = (raw) => {
  const v = String(raw).trim();
  if (!v) return { ok: true };
  const partes = v.split('-');
  const numero = partes[0].replace(/\./g, '');
  if (!/^\d+$/.test(numero)) return { ok: false, msg: 'El NIT solo debe contener números (y opcionalmente -dígito de verificación).' };
  if (partes.length === 2) {
    const dv = partes[1].trim();
    if (!/^\d$/.test(dv)) return { ok: false, msg: 'El dígito de verificación debe ser un solo número.' };
    const esperado = digitoVerificacionNit(numero);
    if (Number(dv) !== esperado) return { ok: false, msg: `Dígito de verificación inválido (debería ser ${esperado}).` };
  }
  return { ok: true };
};

export default function Empresa() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeEditar = puede(user, 'empresa.editar');

  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState({ tieneCertificado: false, tienePasswordCertificado: false, tieneSoftwarePin: false });
  const [certificadoB64, setCertificadoB64] = useState(undefined); // undefined = sin cambios
  const [certNombre, setCertNombre] = useState('');
  const [passwordCertificado, setPasswordCertificado] = useState('');
  const [softwarePin, setSoftwarePin] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const e = await api.get('/empresa');
      if (e) {
        setForm({
          nit: e.nit || '', razonSocial: e.razonSocial || '', nombreComercial: e.nombreComercial || '',
          direccion: e.direccion || '', telefono: e.telefono || '', correo: e.correo || '',
          softwareId: e.softwareId || '', ambienteDIAN: e.ambienteDIAN || 'PRUEBAS',
          formatoFactura: e.formatoFactura || 'TICKET_80',
          formatoFacturaVenta: e.formatoFacturaVenta || 'TICKET_80',
          formatoComanda: e.formatoComanda || 'TICKET_80',
          formatoCortesia: e.formatoCortesia || 'TICKET_80',
          formatoPrefactura: e.formatoPrefactura || 'TICKET_80',
        });
        setEstado({
          tieneCertificado: !!e.tieneCertificado,
          tienePasswordCertificado: !!e.tienePasswordCertificado,
          tieneSoftwarePin: !!e.tieneSoftwarePin,
        });
      }
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const elegirCertificado = async (file) => {
    if (!file) { setCertificadoB64(undefined); setCertNombre(''); return; }
    try {
      setCertificadoB64(await leerBase64(file));
      setCertNombre(file.name);
    } catch {
      notify('No se pudo leer el certificado', 'err');
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    const nitCheck = validarNit(form.nit);
    if (!nitCheck.ok) return notify(nitCheck.msg, 'err');
    if (form.correo.trim() && !emailValido(form.correo.trim())) return notify('El correo no tiene un formato válido.', 'err');
    const payload = {
      nit: form.nit.trim() || null,
      razonSocial: form.razonSocial.trim() || null,
      nombreComercial: form.nombreComercial.trim() || null,
      direccion: form.direccion.trim() || null,
      telefono: form.telefono.trim() || null,
      correo: form.correo.trim() || null,
      softwareId: form.softwareId.trim() || null,
      ambienteDIAN: form.ambienteDIAN || null,
      formatoFactura: form.formatoFactura,
      formatoFacturaVenta: form.formatoFacturaVenta,
      formatoComanda: form.formatoComanda,
      formatoCortesia: form.formatoCortesia,
      formatoPrefactura: form.formatoPrefactura,
      // Campos sensibles: solo se envian si el usuario los tocó.
      ...(certificadoB64 !== undefined && { certificadoDigital: certificadoB64 }),
      ...(passwordCertificado !== '' && { passwordCertificado }),
      ...(softwarePin !== '' && { softwarePin }),
    };
    setGuardando(true);
    try {
      await api.put('/empresa', payload);
      notify('Datos de la empresa guardados');
      setCertificadoB64(undefined); setCertNombre('');
      setPasswordCertificado(''); setSoftwarePin('');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div><h1>Empresa / Configuración DIAN</h1><LoadingState /></div>;

  const badge = (ok) => (
    <span className="mini" style={{ color: ok ? 'var(--green)' : 'var(--muted)' }}>
      {ok ? <><Icon name="check" size={13} /> cargado</> : '— sin cargar'}
    </span>
  );

  return (
    <div>
      <h1>Empresa / Configuración DIAN</h1>
      <p className="subtitle">Datos del emisor para la facturación electrónica.</p>

      <form onSubmit={guardar} className="card" style={{ maxWidth: 760 }}>
        <h3 style={{ marginTop: 0 }}>Datos generales</h3>
        <div className="grid form-2col">
          <div className="field">
            <label>NIT</label>
            <input value={form.nit} onChange={(e) => set('nit', e.target.value)} maxLength={20} disabled={!puedeEditar} placeholder="900123456-7" />
            {form.nit.trim() && !form.nit.includes('-') && /^\d+$/.test(form.nit.replace(/\./g, '')) && (
              <span className="mini" style={{ color: 'var(--muted)' }}>
                Dígito de verificación sugerido: {digitoVerificacionNit(form.nit)}
              </span>
            )}
          </div>
          <div className="field">
            <label>Razón social</label>
            <input value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} maxLength={250} disabled={!puedeEditar} />
          </div>
          <div className="field">
            <label>Nombre comercial</label>
            <input value={form.nombreComercial} onChange={(e) => set('nombreComercial', e.target.value)} maxLength={250} disabled={!puedeEditar} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} maxLength={50} disabled={!puedeEditar} />
          </div>
          <div className="field">
            <label>Correo</label>
            <input type="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} maxLength={150} disabled={!puedeEditar} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Dirección</label>
            <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} disabled={!puedeEditar} />
          </div>
        </div>

        <h3>Facturación electrónica</h3>
        <div className="grid form-2col">
          <div className="field">
            <label>Software ID</label>
            <input value={form.softwareId} onChange={(e) => set('softwareId', e.target.value)} maxLength={100} disabled={!puedeEditar} />
          </div>
          <div className="field">
            <label>Ambiente DIAN</label>
            <select value={form.ambienteDIAN} onChange={(e) => set('ambienteDIAN', e.target.value)} disabled={!puedeEditar}>
              <option value="PRUEBAS">Pruebas (habilitación)</option>
              <option value="PRODUCCION">Producción</option>
            </select>
          </div>
          <div className="field">
            <label>Software PIN {badge(estado.tieneSoftwarePin)}</label>
            <input
              type="password" autoComplete="new-password" placeholder={estado.tieneSoftwarePin ? '•••• (dejar en blanco para no cambiar)' : ''}
              value={softwarePin} onChange={(e) => setSoftwarePin(e.target.value)} maxLength={100} disabled={!puedeEditar}
            />
          </div>
        </div>

        <h3>Certificado digital</h3>
        <div className="grid form-2col">
          <div className="field">
            <label>Certificado (.p12 / .pfx) {badge(estado.tieneCertificado)}</label>
            <input type="file" accept=".p12,.pfx" onChange={(e) => elegirCertificado(e.target.files?.[0] || null)} disabled={!puedeEditar} />
            {certNombre && <span className="mini" style={{ color: 'var(--muted)' }}>Nuevo: {certNombre}</span>}
          </div>
          <div className="field">
            <label>Contraseña del certificado {badge(estado.tienePasswordCertificado)}</label>
            <input
              type="password" autoComplete="new-password" placeholder={estado.tienePasswordCertificado ? '•••• (dejar en blanco para no cambiar)' : ''}
              value={passwordCertificado} onChange={(e) => setPasswordCertificado(e.target.value)} maxLength={200} disabled={!puedeEditar}
            />
          </div>
        </div>

        <h3>Formatos de impresión</h3>
        <p className="mini" style={{ color: 'var(--muted)', marginTop: -8 }}>
          Elige el ancho de papel para cada tipo de documento (impresoras térmicas angostas, estándar, o impresoras normales con media carta).
        </p>
        <div className="grid form-2col">
          <div className="field">
            <label>Factura electrónica</label>
            <select value={form.formatoFactura} onChange={(e) => set('formatoFactura', e.target.value)} disabled={!puedeEditar}>
              {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Factura de venta (no electrónica)</label>
            <select value={form.formatoFacturaVenta} onChange={(e) => set('formatoFacturaVenta', e.target.value)} disabled={!puedeEditar}>
              {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Comanda de cocina</label>
            <select value={form.formatoComanda} onChange={(e) => set('formatoComanda', e.target.value)} disabled={!puedeEditar}>
              {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cortesía</label>
            <select value={form.formatoCortesia} onChange={(e) => set('formatoCortesia', e.target.value)} disabled={!puedeEditar}>
              {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Pre-cuenta (prefactura)</label>
            <select value={form.formatoPrefactura} onChange={(e) => set('formatoPrefactura', e.target.value)} disabled={!puedeEditar}>
              {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {puedeEditar && (
          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
        {!puedeEditar && <p className="nota mini" style={{ color: 'var(--muted)' }}>Solo lectura: no tienes permiso para editar la empresa.</p>}
      </form>
    </div>
  );
}
