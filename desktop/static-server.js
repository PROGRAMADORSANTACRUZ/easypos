// Servidor local para el frontend empaquetado; en la app instalada tambien reenvia la API.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Inyecta la URL absoluta de la API en el HTML servido, para que el frontend sepa a
// donde apuntar aunque este cargado desde un origen/puerto distinto al backend.
function servirIndex(res, clientDist, apiUrl) {
  const html = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  const inyectado = html.replace(
    '<head>',
    `<head>\n    <script>window.EASYPOS_API_URL = ${JSON.stringify(apiUrl)}; window.EASYPOS_DESKTOP = true; document.documentElement.classList.add('desktop-app');</script>`,
  );
  res.writeHead(200, { 'Content-Type': MIME['.html'] });
  res.end(inyectado);
}

function proxyApi(req, res, apiProxyUrl) {
  const upstreamUrl = new URL(req.url || '/', apiProxyUrl);
  const requester = upstreamUrl.protocol === 'https:' ? https : http;
  const upstream = requester.request(upstreamUrl, {
    method: req.method,
    headers: { ...req.headers, host: upstreamUrl.host },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    console.error('[EASYPOS] Error al conectar con la API:', error.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No se pudo conectar con el servidor de EASYPOS' }));
    }
  });
  req.pipe(upstream);
}

function crearServidorEstatico({ clientDist, apiUrl, apiProxyUrl, port }) {
  const root = path.resolve(clientDist);
  if (apiProxyUrl) {
    const target = new URL(apiProxyUrl);
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new TypeError('EASYPOS_API_URL debe usar http o https');
    }
  }

  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Solicitud invalida');
      return;
    }

    if (apiProxyUrl && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
      proxyApi(req, res, apiProxyUrl);
      return;
    }

    const filePath = path.resolve(root, `.${urlPath}`);
    const relativePath = path.relative(root, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      res.writeHead(403);
      res.end('Acceso denegado');
      return;
    }

    // Si el archivo existe y no es un directorio, se sirve tal cual (JS, CSS, imagenes...)
    if (urlPath !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Cualquier otra ruta (navegacion de React Router) cae al index.html con el API_URL inyectado
    servirIndex(res, clientDist, apiUrl);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { crearServidorEstatico };
