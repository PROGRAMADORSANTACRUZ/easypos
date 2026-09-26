import { Router } from 'express';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { platformPrisma } from '../platformPrisma.js';
import { getTenantPrisma, construirDbUrl, crearBaseDeDatos } from '../tenantManager.js';
import { sembrarRolesYPermisos } from '../tenantSeed.js';
import { requireAuth, permisoPorMetodo } from '../middleware/auth.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..', '..'); // carpeta server/

const limpiar = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const slugify = (s) => String(s || '')
  .toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// Nunca exponer la cadena de conexion completa (trae la contraseña de la base).
const aVista = (r) => (r && {
  id: r.id,
  slug: r.slug,
  nombre: r.nombre,
  nit: r.nit,
  nombreComercial: r.nombreComercial,
  direccion: r.direccion,
  telefono: r.telefono,
  correo: r.correo,
  dbNombre: r.dbNombre,
  estado: r.estado,
  plan: r.plan,
  createdAt: r.createdAt,
});

// La empresa es un registro unico por restaurante (igual que en /api/empresa).
const aVistaEmpresa = (e) => {
  if (!e) return null;
  const { certificadoDigital, passwordCertificado, softwarePin, ...resto } = e;
  return {
    ...resto,
    tieneCertificado: certificadoDigital != null,
    tienePasswordCertificado: passwordCertificado != null,
    tieneSoftwarePin: softwarePin != null,
  };
};

const serializarResolucion = (r) => (r && {
  ...r,
  rangoInicial: r.rangoInicial == null ? null : Number(r.rangoInicial),
  rangoFinal: r.rangoFinal == null ? null : Number(r.rangoFinal),
  siguienteNumero: r.siguienteNumero == null ? null : Number(r.siguienteNumero),
});
const toBig = (v) => (v === undefined || v === null || v === '' ? null : BigInt(Math.trunc(Number(v))));
const toDate = (v) => (v === undefined || v === null || v === '' ? null : new Date(v));

// Lista publica y minima para el selector de restaurante en el login (sin datos sensibles).
// Debe quedar SIEMPRE antes de router.use(requireAuth): es la unica ruta accesible sin sesion.
router.get('/publico', wrap(async (_req, res) => {
  const lista = await platformPrisma.restaurante.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, slug: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(lista);
}));

// De aqui en adelante, gestion de restaurantes: requiere sesion y el permiso
// "empresa.*" (mismo permiso con el que el frontend habilita esta pantalla).
router.use(requireAuth);
router.use(permisoPorMetodo('empresa'));

// Lista los restaurantes registrados en la plataforma
router.get('/', wrap(async (_req, res) => {
  const lista = await platformPrisma.restaurante.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(lista.map(aVista));
}));

// Aplica el esquema principal (prisma/schema.prisma) a la base recien creada del restaurante
function aplicarEsquema(dbUrl) {
  execFileSync('npx', ['prisma', 'db', 'push', '--schema=prisma/schema.prisma', '--skip-generate', '--accept-data-loss'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
    shell: true,
  });
}

// Registra un nuevo restaurante: crea su base de datos propia, aplica el esquema,
// siembra roles/permisos + usuario administrador, y guarda la info de facturacion (Empresa).
// body: { slug?, nombre, nit, nombreComercial, direccion, telefono, correo, ambienteDIAN,
//         adminUsuario?, adminPassword? }
router.post('/', wrap(async (req, res) => {
  const nombre = limpiar(req.body?.nombre);
  if (!nombre) return res.status(400).json({ error: 'El nombre del restaurante es obligatorio' });

  let slug = slugify(req.body?.slug || nombre);
  if (!slug) return res.status(400).json({ error: 'No se pudo generar un identificador para el restaurante' });
  if (await platformPrisma.restaurante.findUnique({ where: { slug } })) {
    return res.status(409).json({ error: `Ya existe un restaurante con el identificador "${slug}"` });
  }

  const dbNombre = `easypos_${slug.replace(/-/g, '_')}`;
  const dbUrl = construirDbUrl(process.env.DATABASE_URL, dbNombre);

  try {
    await crearBaseDeDatos(process.env.DATABASE_URL, dbNombre);
    aplicarEsquema(dbUrl);
  } catch (e) {
    return res.status(500).json({ error: `No se pudo crear la base de datos del restaurante: ${e.message}` });
  }

  const tenantPrisma = getTenantPrisma(dbUrl);

  const rolAdminId = await sembrarRolesYPermisos(tenantPrisma);

  const adminUsuario = limpiar(req.body?.adminUsuario) || 'admin';
  const adminPassword = limpiar(req.body?.adminPassword) || 'admin123';
  const usuario = await tenantPrisma.usuario.upsert({
    where: { usuario: adminUsuario },
    update: {},
    create: {
      usuario: adminUsuario,
      nombre: 'Administrador',
      correo: limpiar(req.body?.correo),
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    },
  });
  await tenantPrisma.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolAdminId } },
    update: {},
    create: { usuarioId: usuario.id, rolId: rolAdminId },
  });

  const empresa = await tenantPrisma.empresa.create({
    data: {
      nit: limpiar(req.body?.nit),
      razonSocial: nombre,
      nombreComercial: limpiar(req.body?.nombreComercial),
      direccion: limpiar(req.body?.direccion),
      telefono: limpiar(req.body?.telefono),
      correo: limpiar(req.body?.correo),
      ambienteDIAN: limpiar(req.body?.ambienteDIAN) || 'PRUEBAS',
    },
  });

  const restaurante = await platformPrisma.restaurante.create({
    data: {
      slug,
      nombre,
      nit: limpiar(req.body?.nit),
      nombreComercial: limpiar(req.body?.nombreComercial),
      direccion: limpiar(req.body?.direccion),
      telefono: limpiar(req.body?.telefono),
      correo: limpiar(req.body?.correo),
      dbNombre,
      dbUrl,
    },
  });

  res.status(201).json({
    restaurante: aVista(restaurante),
    empresa: aVistaEmpresa(empresa),
    credencialesAdmin: { usuario: adminUsuario, password: adminPassword },
  });
}));

// Detalle de un restaurante: su info de facturacion (Empresa) + resoluciones DIAN
router.get('/:id/detalle', wrap(async (req, res) => {
  const restaurante = await platformPrisma.restaurante.findUnique({ where: { id: req.params.id } });
  if (!restaurante) return res.status(404).json({ error: 'Restaurante no encontrado' });

  const tenantPrisma = getTenantPrisma(restaurante.dbUrl);
  const [empresa, resoluciones, tiposDocumento] = await Promise.all([
    tenantPrisma.empresa.findFirst({ orderBy: { createdAt: 'asc' } }),
    tenantPrisma.resolucionFacturacion.findMany({ orderBy: { fechaInicio: 'desc' } }),
    tenantPrisma.tipoDocumento.findMany({ orderBy: { clase: 'asc' } }),
  ]);

  res.json({
    restaurante: aVista(restaurante),
    empresa: aVistaEmpresa(empresa),
    resoluciones: resoluciones.map(serializarResolucion),
    tiposDocumento,
  });
}));

// Crea o actualiza la info de facturacion (Empresa) del restaurante: nombre, NIT, etc.
router.put('/:id/empresa', wrap(async (req, res) => {
  const restaurante = await platformPrisma.restaurante.findUnique({ where: { id: req.params.id } });
  if (!restaurante) return res.status(404).json({ error: 'Restaurante no encontrado' });
  const tenantPrisma = getTenantPrisma(restaurante.dbUrl);

  const { nit, razonSocial, nombreComercial, direccion, telefono, correo, ambienteDIAN } = req.body;
  const data = {
    ...(nit !== undefined && { nit: limpiar(nit) }),
    ...(razonSocial !== undefined && { razonSocial: limpiar(razonSocial) }),
    ...(nombreComercial !== undefined && { nombreComercial: limpiar(nombreComercial) }),
    ...(direccion !== undefined && { direccion: limpiar(direccion) }),
    ...(telefono !== undefined && { telefono: limpiar(telefono) }),
    ...(correo !== undefined && { correo: limpiar(correo) }),
    ...(ambienteDIAN !== undefined && { ambienteDIAN: limpiar(ambienteDIAN) }),
  };

  const existente = await tenantPrisma.empresa.findFirst({ orderBy: { createdAt: 'asc' } });
  const empresa = existente
    ? await tenantPrisma.empresa.update({ where: { id: existente.id }, data })
    : await tenantPrisma.empresa.create({ data });

  // Refleja el nombre/nit tambien en el directorio de la plataforma
  await platformPrisma.restaurante.update({
    where: { id: restaurante.id },
    data: {
      ...(razonSocial !== undefined && { nombre: limpiar(razonSocial) || restaurante.nombre }),
      ...(nit !== undefined && { nit: limpiar(nit) }),
      ...(nombreComercial !== undefined && { nombreComercial: limpiar(nombreComercial) }),
      ...(direccion !== undefined && { direccion: limpiar(direccion) }),
      ...(telefono !== undefined && { telefono: limpiar(telefono) }),
      ...(correo !== undefined && { correo: limpiar(correo) }),
    },
  });

  res.json(aVistaEmpresa(empresa));
}));

// Lista/crea resoluciones de facturacion (documentos DIAN) del restaurante
router.get('/:id/resoluciones', wrap(async (req, res) => {
  const restaurante = await platformPrisma.restaurante.findUnique({ where: { id: req.params.id } });
  if (!restaurante) return res.status(404).json({ error: 'Restaurante no encontrado' });
  const tenantPrisma = getTenantPrisma(restaurante.dbUrl);
  const resoluciones = await tenantPrisma.resolucionFacturacion.findMany({ orderBy: { fechaInicio: 'desc' } });
  res.json(resoluciones.map(serializarResolucion));
}));

router.post('/:id/resoluciones', wrap(async (req, res) => {
  const restaurante = await platformPrisma.restaurante.findUnique({ where: { id: req.params.id } });
  if (!restaurante) return res.status(404).json({ error: 'Restaurante no encontrado' });
  const tenantPrisma = getTenantPrisma(restaurante.dbUrl);

  const { prefijo, numeroResolucion, rangoInicial, rangoFinal, siguienteNumero, fechaInicio, fechaFin } = req.body;
  const r = await tenantPrisma.resolucionFacturacion.create({
    data: {
      prefijo: prefijo ? String(prefijo) : null,
      numeroResolucion: numeroResolucion ? String(numeroResolucion) : null,
      rangoInicial: toBig(rangoInicial),
      rangoFinal: toBig(rangoFinal),
      siguienteNumero: siguienteNumero !== undefined ? toBig(siguienteNumero) : toBig(rangoInicial),
      fechaInicio: toDate(fechaInicio),
      fechaFin: toDate(fechaFin),
    },
  });
  res.status(201).json(serializarResolucion(r));
}));

// Activa/suspende un restaurante (no borra su base de datos)
router.put('/:id/estado', wrap(async (req, res) => {
  const estado = limpiar(req.body?.estado);
  if (!['ACTIVO', 'SUSPENDIDO'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido (ACTIVO o SUSPENDIDO)' });
  }
  const restaurante = await platformPrisma.restaurante.update({ where: { id: req.params.id }, data: { estado } });
  res.json(aVista(restaurante));
}));

export default router;
