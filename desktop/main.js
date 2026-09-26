// App de escritorio de EASYPOS.
// El backend (API JSON pura) y el frontend (estático) corren en procesos/puertos
// separados: si el backend falla, la interfaz sigue sirviéndose y puede avisarle al
// usuario en vez de dejar la ventana en blanco.
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const { crearServidorEstatico } = require('./static-server.js');

const API_PORT = process.env.PORT || 4010;
const API_URL = `http://localhost:${API_PORT}`;
const CLIENT_PORT = process.env.CLIENT_PORT || 4011;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const serverDir = path.join(__dirname, '..', 'server');
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');

let serverProcess = null;
let staticServer = null;
let mainWindow = null;

function startServer() {
  serverProcess = spawn(process.execPath, [path.join(serverDir, 'src', 'index.js')], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(API_PORT) },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    console.log(`[EASYPOS] backend finalizado (code ${code})`);
  });
}

function waitForServer(url, { retries = 60, delay = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(url + '/api/health', (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry(left);
      });
      req.on('error', () => retry(left));
      req.setTimeout(2000, () => {
        req.destroy();
        retry(left);
      });
    };
    const retry = (left) => {
      if (left <= 0) return reject(new Error('El servidor no respondio a tiempo'));
      setTimeout(() => attempt(left - 1), delay);
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: 'EASYPOS',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Las ventanas internas (impresion de tickets con window.open) se abren dentro de la app;
  // solo los enlaces http(s) externos se abren en el navegador del sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const esInterno = url === 'about:blank' || url.startsWith('about:') || url.startsWith(CLIENT_URL);
    if (esInterno) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(CLIENT_URL);
}

app.whenReady().then(async () => {
  startServer();
  staticServer = await crearServidorEstatico({ clientDist, apiUrl: `${API_URL}/api`, port: CLIENT_PORT });
  try {
    await waitForServer(API_URL);
  } catch (err) {
    console.error('[EASYPOS]', err.message);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  if (staticServer) staticServer.close();
});
