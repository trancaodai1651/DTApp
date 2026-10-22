const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dtPosterSecureStore', {
  loadAIProfiles: () => ipcRenderer.invoke('dt:load-ai-profiles'),
  saveAIProfiles: profiles => ipcRenderer.invoke('dt:save-ai-profiles', profiles),
});
