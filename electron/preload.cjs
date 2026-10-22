const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dtPosterSecureStore', {
  loadAIProfiles: () => ipcRenderer.invoke('dt:load-ai-profiles'),
  saveAIProfiles: profiles => ipcRenderer.invoke('dt:save-ai-profiles', profiles),
  openOAuthURL: url => ipcRenderer.invoke('dt:open-oauth', url),
  onOAuthCallback: callback => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on('dt:oauth-callback', listener);
    return () => ipcRenderer.removeListener('dt:oauth-callback', listener);
  },
});
