// App de escritorio POS.
// El backend (API JSON pura) y el frontend (estático) corren en procesos/puertos
// separados: si el backend falla, la interfaz sigue sirviéndose y puede avisarle al
// usuario en vez de dejar la ventana en blanco.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const { enviarPulsoCajon } = require('./cash-drawer.js');
const { crearServidorEstatico } = require('./static-server.js');
const { iniciarActualizaciones } = require('./updater.js');

const API_PORT = process.env.PORT || 4010;
const API_ORIGIN = app.isPackaged
  ? (process.env.POS_API_URL || 'https://pos.grupo-santacruz.com').replace(/\/+$/, '')
  : `http://localhost:${API_PORT}`;
const CLIENT_PORT = process.env.CLIENT_PORT || 4011;
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
const serverDir = path.join(__dirname, '..', 'server');
const clientDist = process.env.CLIENT_DIST || (
  app.isPackaged ? path.join(__dirname, 'web') : path.join(__dirname, '..', 'client', 'dist')
);

let serverProcess = null;
let staticServer = null;
let mainWindow = null;

function exigirVentanaPrincipal(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Solicitud no autorizada');
  }
  if (new URL(event.senderFrame.url).origin !== new URL(CLIENT_URL).origin) {
    throw new Error('Solicitud no autorizada');
  }
}

async function autorizarAperturaCajon({ usuario, password }) {
  const cookies = await mainWindow.webContents.session.cookies.get({ url: `${CLIENT_URL}/api` });
  const sessionCookie = cookies.find((cookie) => cookie.name === 'pos_session');
  if (!sessionCookie) throw new Error('Inicia sesión en el POS antes de abrir el cajón.');

  const response = await fetch(`${CLIENT_URL}/api/aperturas/autorizar-cajon`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
    },
    body: JSON.stringify({ usuario, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'No se pudo validar al supervisor.');
  return body?.ticket;
}

function registrarCanalesCajon() {
  ipcMain.handle('pos:app-version', (event) => {
    exigirVentanaPrincipal(event);
    return app.getVersion();
  });
  ipcMain.handle('pos:cash-drawer:list-printers', async (event) => {
    exigirVentanaPrincipal(event);
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(({ name, displayName }) => ({ name, displayName: displayName || name }));
  });

  ipcMain.handle('pos:cash-drawer:open', async (event, request = {}) => {
    exigirVentanaPrincipal(event);
    const printerName = String(request.printerName || '').trim();
    const usuario = String(request.usuario || '').trim();
    const password = request.password;
    if (!printerName || !usuario || typeof password !== 'string' || !password) {
      throw new Error('Selecciona la impresora e ingresa las credenciales del supervisor.');
    }

    const printers = await mainWindow.webContents.getPrintersAsync();
    if (!printers.some((printer) => printer.name === printerName)) {
      throw new Error('La impresora seleccionada ya no está disponible.');
    }

    const ticket = await autorizarAperturaCajon({ usuario, password });
    if (!ticket) throw new Error('No se recibió la autorización del supervisor.');

    const response = await fetch(`${CLIENT_URL}/api/aperturas/consumir-cajon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'La autorización del supervisor expiró.');

    await enviarPulsoCajon(printerName);
    return { ok: true };
  });
}

function startServer() {
  serverProcess = spawn(process.env.POS_NODE || 'node', [path.join(serverDir, 'src', 'index.js')], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(API_PORT) },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    console.log(`[POS] backend finalizado (code ${code})`);
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
    title: 'POS',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#141210',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1E1B18',
      symbolColor: '#EDDFCA',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.gruposantacruz.pos');
  registrarCanalesCajon();
  if (!app.isPackaged) startServer();
  staticServer = await crearServidorEstatico({
    clientDist,
    apiUrl: `${CLIENT_URL}/api`,
    apiProxyUrl: API_ORIGIN,
    port: CLIENT_PORT,
  });
  if (!app.isPackaged) {
    try {
      await waitForServer(API_ORIGIN);
    } catch (err) {
      console.error('[POS]', err.message);
    }
  }
  createWindow();

  if (app.isPackaged) {
    const { autoUpdater } = require('electron-updater');
    iniciarActualizaciones({ autoUpdater, dialog, getWindow: () => mainWindow });
  }

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
