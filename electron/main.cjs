const { app, BrowserWindow, protocol, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
let window;
app.whenReady().then(() => {
  const root = path.resolve(__dirname, '../dist');
  const secureProfilesFile = path.join(app.getPath('userData'), 'ai-profiles.enc');
  const assertTrustedRenderer = event => {
    if (!event.senderFrame?.url.startsWith('app://dt/')) throw new Error('Untrusted application window.');
  };
  ipcMain.handle('dt:load-ai-profiles', async event => {
    assertTrustedRenderer(event);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Kho mã hóa của hệ điều hành chưa sẵn sàng.');
    try { return JSON.parse(safeStorage.decryptString(await fs.readFile(secureProfilesFile))); }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Không giải mã được kho API desktop.'); }
  });
  ipcMain.handle('dt:save-ai-profiles', async (event, profiles) => {
    assertTrustedRenderer(event);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Kho mã hóa của hệ điều hành chưa sẵn sàng.');
    if (!Array.isArray(profiles) || profiles.length > 20 || JSON.stringify(profiles).length > 160_000) throw new Error('Danh sách API không hợp lệ hoặc vượt dung lượng cho phép.');
    for (const profile of profiles) {
      if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string' || typeof profile.provider !== 'string' || typeof profile.apiKey !== 'string' || profile.apiKey.length > 4096 || typeof profile.model !== 'string') throw new Error('Thông tin API không hợp lệ.');
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(profiles));
    const temporary = `${secureProfilesFile}.tmp`;
    await fs.writeFile(temporary, encrypted);
    await fs.rename(temporary, secureProfilesFile);
  });
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
    window = new BrowserWindow({ width: 1520, height: 980, minWidth: 900, minHeight: 700, title: 'DT App', backgroundColor: '#f7f8f5', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://dt/')) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    window.loadURL('app://dt/');
  };
  open();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) open(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
