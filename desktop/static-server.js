// Servidor estatico minimo para el cliente (React) empaquetado en la app de escritorio.
// Corre en un proceso/puerto separado del backend (API), para que un fallo del backend
// nunca deje sin servir la interfaz: el shell de la app sigue cargando y puede mostrar
// un aviso de "servidor no disponible" en vez de una pantalla en blanco.
const http = require('node:http');
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
    `<head>\n    <script>window.EASYPOS_API_URL = ${JSON.stringify(apiUrl)};</script>`,
  );
  res.writeHead(200, { 'Content-Type': MIME['.html'] });
  res.end(inyectado);
}

function crearServidorEstatico({ clientDist, apiUrl, port }) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(clientDist, urlPath);

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
    server.listen(port, () => resolve(server));
  });
}

module.exports = { crearServidorEstatico };
