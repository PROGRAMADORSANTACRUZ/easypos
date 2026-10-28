const fs = require('node:fs');
const path = require('node:path');

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const desktopWeb = path.join(__dirname, 'web');

if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('No se encontro client/dist. Ejecuta primero: npm run build:client');
  process.exit(1);
}

fs.rmSync(desktopWeb, { recursive: true, force: true });
fs.cpSync(clientDist, desktopWeb, { recursive: true });
console.log('Frontend copiado a desktop/web');
