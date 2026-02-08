const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getTickets: () => ipcRenderer.invoke('get-tickets'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    addTicket: (name) => ipcRenderer.invoke('add-ticket', name),
    deleteTicket: (name) => ipcRenderer.invoke('delete-ticket', name),
    getAnalyses: (ticket) => ipcRenderer.invoke('get-analyses', ticket),
    addAnalysis: (ticket, score, details) => ipcRenderer.invoke('add-analysis', ticket, score, details),
    getTicketDetails: (ticket) => ipcRenderer.invoke('get-ticket-details', ticket)
    ,verifyTicket: (name) => ipcRenderer.invoke('verify-ticket', name)
    ,runAnalysis: (name) => ipcRenderer.invoke('run-analysis', name)
    ,runAnalysisAll: () => ipcRenderer.invoke('run-analysis-all')
});