const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const DatabaseService = require('./database');
const marketData = require('./market_data');
const aiService = require('./ai_service');

let dbService;
let mainWindow;

// Initialize DB
const dbPath = path.join(app.getPath('userData'), 'database.sqlite');
dbService = new DatabaseService(dbPath);

async function initApp() {
  await dbService.init();
  createWindow();
}



function createWindow() {
  Menu.setApplicationMenu(null);
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'medias/icon.ico'));
  }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(__dirname, 'medias/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(initApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// Settings
ipcMain.handle('get-settings', () => dbService.getSettings());
ipcMain.handle('save-settings', (event, settings) => {
  dbService.saveSettings(settings);
  return { status: 'ok' };
});

// Tickets
ipcMain.handle('get-tickets', () => dbService.getTickets());

ipcMain.handle('verify-ticket', async (event, ticketName) => {
  const ok = await marketData.checkSymbolExists(ticketName);
  return { ok };
});

ipcMain.handle('add-ticket', async (event, ticketName) => {
  try {
    const exists = await marketData.checkSymbolExists(ticketName);
    if (!exists) return { status: 'Error', error: `Le symbole ${ticketName} est introuvable.` };

    await dbService.addTicket(ticketName);

    // Initial Analysis
    const analysis = await marketData.analyze(ticketName);
    if (analysis) {
      dbService.addAnalysis(ticketName, analysis);
    }

    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('delete-ticket', async (event, ticketName) => {
  try {
    await dbService.deleteTicket(ticketName);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

// Analysis
ipcMain.handle('get-analyses', (event, ticket) => dbService.getAnalyses(ticket));

ipcMain.handle('get-ticket-details', (event, ticketName) => {
  const ticketRes = dbService.exec("SELECT name, created FROM tickets WHERE name = ?", [ticketName]);
  const analysesRes = dbService.exec("SELECT id, score, created, details FROM analyses WHERE ticket = ? ORDER BY created DESC LIMIT 10", [ticketName]);
  const historyRes = dbService.exec("SELECT id, score, created, details FROM analyses WHERE ticket = ? ORDER BY created DESC LIMIT 20", [ticketName]);

  const ticket = ticketRes.length ? ticketRes[0] : null;

  return {
    ticket,
    analyses: analysesRes,
    history: historyRes
  };
});

async function performAnalysis(ticketName) {
  // 1. Technical Analysis
  const result = await marketData.analyze(ticketName);
  if (!result) return null;

  // 2. AI Analysis
  const settings = dbService.getSettings();

  if (settings.ai_enabled === '1' || settings.ai_enabled === 1 || settings.ai_enabled === true) {
    const aiTechEnabled = settings.ai_tech_enabled === '1' || settings.ai_tech_enabled === true;

    const wTech = parseFloat(settings.weight_tech || 0.4);
    const wAiNews = parseFloat(settings.weight_ai_news || 0.4);
    const wAiTech = parseFloat(settings.weight_ai_tech || 0.2);

    let aiNewsScore = 50;
    let aiTechScore = 50;
    let explanation = [];

    const newsCount = parseInt(settings.news_count_limit || 5);
    const newsDays = parseInt(settings.news_days_limit || 3);
    const news = await marketData.fetchNews(ticketName, newsCount);

    const newsAnalysis = await aiService.analyzeNews(ticketName, news, settings.llm_model, newsDays);
    aiNewsScore = typeof newsAnalysis.score === 'number' ? newsAnalysis.score : 50;
    if (newsAnalysis.explanation) explanation.push(`News: ${newsAnalysis.explanation}`);

    if (aiTechEnabled) {
      const techAnalysis = await aiService.analyzeTechnical(ticketName, result.indicators, settings.llm_model);
      aiTechScore = typeof techAnalysis.score === 'number' ? techAnalysis.score : 50;
      if (techAnalysis.explanation) explanation.push(`AI Tech: ${techAnalysis.explanation}`);
    }

    let totalWeight = wTech + wAiNews + (aiTechEnabled ? wAiTech : 0);
    if (totalWeight === 0) totalWeight = 1;

    let combinedScore = (result.score * wTech + aiNewsScore * wAiNews + (aiTechEnabled ? aiTechScore * wAiTech : 0)) / totalWeight;

    result.score = Math.round(combinedScore);
    result.ai = {
      newsScore: aiNewsScore,
      techScore: aiTechScore,
      explanation: explanation.join('\n'),
      news: news
    };
  }

  dbService.addAnalysis(ticketName, result);
  return result;
}

ipcMain.handle('run-analysis', async (event, ticketName) => {
  try {
    const result = await performAnalysis(ticketName);
    if (!result) return { status: 'error', error: 'Données insuffisantes' };
    return { status: 'ok', result };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('run-analysis-all', async () => {
  try {
    const tickets = dbService.getTickets();
    if (!tickets.length) return { status: 'ok', processed: 0 };

    let processed = 0;
    for (const t of tickets) {
      const out = await performAnalysis(t.name);
      if (out) processed++;
    }
    return { status: 'ok', processed };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});