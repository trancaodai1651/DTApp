const { app, BrowserWindow, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
let window;
app.whenReady().then(() => {
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'dt') return new Response('Not found', { status: 404 });
    let target;
    try { target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return new Response('Bad request', { status: 400 }); }
    if (!target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      return new Response(await fs.readFile(target), { headers: {
        'Content-Type': types[path.extname(target)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'self'; form-action 'none'",
      } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const open = () => {
    window = new BrowserWindow({ width: 1520, height: 980, minWidth: 900, minHeight: 700, title: 'DT Poster Studio', backgroundColor: '#f7f8f5', autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://dt/')) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    window.loadURL('app://dt/');
  };
  open();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) open(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
