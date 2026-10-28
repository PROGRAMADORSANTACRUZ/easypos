const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { crearServidorEstatico } = require('../static-server.js');

test('installer goes directly to progress for all users and has a white launch label', () => {
  const desktopDir = path.resolve(__dirname, '..');
  const { build } = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
  const installer = fs.readFileSync(path.join(desktopDir, 'build', 'installer.nsh'), 'utf8');
  assert.equal(build.nsis.perMachine, true);
  assert.equal(build.nsis.oneClick, false);
  assert.notEqual(build.nsis.allowToChangeInstallationDirectory, true);
  assert.doesNotMatch(installer, /MUI_PAGE_WELCOME|MUI_PAGE_DIRECTORY|PAGE_INSTALL_MODE/);
  assert.match(installer, /!define MUI_PAGE_CUSTOMFUNCTION_SHOW PosFinishShow/);
  assert.match(installer, /SetCtlColors \$mui\.FinishPage\.Run FFFFFF 1E1B18/);
  assert.match(installer, /StdUtils\.ExecShellAsUser/);
});

test('installer uses native DPI rendering and high-resolution artwork', () => {
  const buildDir = path.resolve(__dirname, '..', 'build');
  const installer = fs.readFileSync(path.join(buildDir, 'installer.nsh'), 'utf8');
  assert.match(installer, /^ManifestDPIAware true$/m);
  for (const [file, width, height] of [['sidebar.bmp', 656, 1256], ['header.bmp', 600, 228]]) {
    const bitmap = fs.readFileSync(path.join(buildDir, file));
    assert.equal(bitmap.toString('ascii', 0, 2), 'BM');
    assert.equal(bitmap.readInt32LE(18), width, `${file} width`);
    assert.equal(bitmap.readInt32LE(22), height, `${file} height`);
  }
});

test('packaged window has only native overlay controls and the POS icon', async () => {
  let ready;
  let windowOptions;
  let applicationMenu;
  let appId;
  let serverOptions;
  const app = {
    isPackaged: true,
    whenReady: () => ({ then: (callback) => { ready = callback; } }),
    on: () => {},
    setAppUserModelId: (value) => { appId = value; },
  };
  class BrowserWindow {
    constructor(options) {
      windowOptions = options;
      this.webContents = { setWindowOpenHandler: () => {} };
    }
    once() {}
    loadURL() {}
  }
  const desktopDir = path.resolve(__dirname, '..');
  const context = {
    __dirname: desktopDir,
    process: { env: {}, platform: 'win32' },
    console,
    require: (name) => {
      if (name === 'electron') {
        return { app, BrowserWindow, Menu: { setApplicationMenu: (menu) => { applicationMenu = menu; } } };
      }
      if (name === './static-server.js') {
        return { crearServidorEstatico: async (options) => { serverOptions = options; return { close() {} }; } };
      }
      if (name === 'node:child_process') {
        return { spawn: () => { throw new Error('Packaged app must not launch a local backend'); } };
      }
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(desktopDir, 'main.js'), 'utf8'), context);
  await ready();
  assert.equal(applicationMenu, null);
  assert.equal(appId, 'com.gruposantacruz.easypos');
  assert.equal(windowOptions.titleBarStyle, 'hidden');
  assert.equal(windowOptions.titleBarOverlay.height, 32);
  assert.equal(windowOptions.titleBarOverlay.color, '#1E1B18');
  assert.equal(windowOptions.icon, path.join(desktopDir, 'build', 'icon.ico'));
  assert.equal(windowOptions.webPreferences.nodeIntegration, false);
  assert.equal(windowOptions.webPreferences.contextIsolation, true);
  assert.equal(serverOptions.clientDist, path.join(desktopDir, 'web'));
});

test('desktop shell injection preserves frontend routing and API cookie proxy', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easypos-desktop-'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<html><head></head><body>POS</body></html>');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const upstream = http.createServer((req, res) => {
    res.setHeader('Set-Cookie', 'session=test; HttpOnly; SameSite=Lax');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: req.url, cookie: req.headers.cookie }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const server = await crearServidorEstatico({
    clientDist: directory,
    apiUrl: '/api',
    apiProxyUrl: `http://127.0.0.1:${upstream.address().port}`,
    port: 0,
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/mesas`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /window.EASYPOS_DESKTOP = true/);
  assert.match(html, /classList.add\('desktop-app'\)/);
  assert.match(html, /window.EASYPOS_API_URL = "\/api"/);
  const api = await fetch(`${base}/api/health?desktop=1`, { headers: { cookie: 'session=current' } });
  assert.equal(api.status, 200);
  assert.match(api.headers.get('set-cookie'), /session=test; HttpOnly/);
  assert.deepEqual(await api.json(), { url: '/api/health?desktop=1', cookie: 'session=current' });
});
