// Alpine.js application state and methods
function appState() {
  return {
    currentView: 'dashboard',
    newTicketName: '',
    tickets: [],
    analyses: [],
    settings: {
      first_name: '',
      last_name: '',
      llm_api_url: '',
      llm_model: '',
      realtime_updates: '1',
      ai_enabled: false,
      ai_tech_enabled: false,
      news_days_limit: 3,
      news_count_limit: 5,
      weight_tech: 0.4,
      weight_ai_news: 0.4,
      weight_ai_tech: 0.2
    },
    isOnline: navigator.onLine,
    sortOption: 'overall', // overall, technical, current, ai_tech

    // Modal state
    modal: { show: false, title: '', content: '', onConfirm: null, isError: false },
    chartInstance: null,

    isLoading: true,

    async init() {
      const start = Date.now();

      await this.loadSettings();
      await this.loadTickets();
      await this.loadAnalyses();
      this.checkConnectivity();
      setInterval(() => this.checkConnectivity(), 5000);
      window.addEventListener('online', () => this.checkConnectivity());
      window.addEventListener('offline', () => this.isOnline = false);

      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 2000 - elapsed);
      setTimeout(() => {
        this.isLoading = false;
      }, remaining);
    },

    async checkConnectivity() {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        const response = await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(id);
        this.isOnline = true;
      } catch (e) {
        this.isOnline = false;
      }
    },

    navigate(view) {
      this.currentView = view;
      const drawer = document.getElementById('drawer');
      if (drawer?.checked) drawer.checked = false;
    },

    // --- Data Loading ---

    async loadSettings() {
      this.settings = await window.api.getSettings();
    },

    async loadTickets() {
      this.tickets = await window.api.getTickets();
    },

    async loadAnalyses() {
      this.analyses = await window.api.getAnalyses();
    },

    // --- Actions ---

    async addTicket() {
      const name = this.newTicketName.trim().toUpperCase();
      if (!this.isOnline) return this.showModal('Erreur', 'Pas de connexion internet', null, true);
      if (!name) return this.showModal('Erreur', 'Nom du ticket requis', null, true);

      this.showModal('Vérification', `Vérification de ${name} en cours...`);

      try {
        const check = await window.api.verifyTicket(name);
        if (!check || !check.ok) {
          return this.showModal('Erreur', `Ticker ${name} introuvable ou inaccessible.`, null, true);
        }

        const res = await window.api.addTicket(name);
        if (res && res.status === 'error') throw new Error(res.error);

        this.newTicketName = '';
        await this.loadTickets();
        await this.loadAnalyses();
        this.showModal('Succès', `Ticket ${name} ajouté avec succès.`);
      } catch (err) {
        this.showModal('Erreur', `Impossible d'ajouter le ticket: ${err.message}`, null, true);
      }
    },

    deleteTicket(name) {
      this.showModal(
        'Supprimer ?',
        `Voulez-vous vraiment supprimer le ticket ${name} et son historique ?`,
        async () => {
          await window.api.deleteTicket(name);
          await this.loadTickets();
          await this.loadAnalyses();
          this.closeModal();
        }
      );
    },

    async startAnalysis() {
      if (!this.isOnline) return this.showModal('Erreur', 'Pas de connexion internet', null, true);
      this.showModal('Analyse en cours', 'Traitement de tous les tickets...');
      try {
        const res = await window.api.runAnalysisAll();
        if (res && res.status === 'ok') {
          this.showModal('Terminé', `Analyses exécutées: ${res.processed} ticket(s).`);
        } else {
          this.showModal('Erreur', 'Erreur lors des analyses: ' + (res?.error || 'inconnue'), null, true);
        }
        await this.loadAnalyses();
      } catch (err) {
        this.showModal('Erreur', err.message, null, true);
      }
    },

    async saveSettings() {
      await window.api.saveSettings({ ...this.settings });
      // Reload settings to ensure types are correct (booleans vs strings)
      await this.loadSettings();
      this.showModal('Succès', 'Paramètres sauvegardés.');
    },

    async openTicketDetails(name) {
      const details = await window.api.getTicketDetails(name);
      const analyses = details.analyses || [];

      // Prepare Chart Data
      // We need to parse details to get Tech and AI Tech scores for each history point
      // history is already sorted DESC, so reverse for chart (ASC)
      const historyAsc = [...(details.history || [])].reverse();  // analyses table data

      const content = `
        <div class="space-y-6">
          <div class="flex justify-between items-center bg-base-200 p-4 rounded-lg">
             <div>
                <div class="text-sm opacity-50">Création</div>
                <div class="font-mono">${this.formatDate(details.ticket?.created)}</div>
             </div>
             <div class="text-right">
                <div class="text-3xl font-black">${this.getLastScore(name)}</div>
                <div class="text-xs uppercase tracking-wide opacity-50">Score Actuel</div>
             </div>
          </div>

          <!-- Chart Container -->
          <div class="bg-white p-2 rounded-lg shadow-sm border h-64">
            <canvas id="scoreChart"></canvas>
          </div>

          <div class="divider">Historique des analyses</div>

          <div class="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            ${analyses.map(a => {
        let parsed = null;
        try { parsed = JSON.parse(a.details); } catch (e) { parsed = null; }
        const isBullish = a.score >= 65;
        const isBearish = a.score <= 35;
        const colorClass = isBullish ? 'text-success' : (isBearish ? 'text-error' : 'text-warning');
        const icon = isBullish ? '🚀' : (isBearish ? '📉' : '⚖️');

        return `
                <div class="collapse collapse-arrow border border-base-200 bg-base-100 rounded-box">
                  <input type="checkbox" /> 
                  <div class="collapse-title flex justify-between items-center pr-12">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${icon}</span>
                        <div>
                            <div class="font-bold ${colorClass}">${a.score.toFixed(0)}/100</div>
                            <div class="text-xs opacity-50">${this.formatDate(a.created)}</div>
                        </div>
                    </div>
                    <div class="text-xs font-mono hidden sm:block opacity-70">
                        RSI: ${parsed?.indicators?.rsi14 || '-'}
                    </div>
                  </div>
                  <div class="collapse-content text-sm space-y-3 pt-2">
                     <div class="grid grid-cols-2 gap-4">
                        <div class="bg-base-200 p-2 rounded">
                            <div class="font-bold text-xs opacity-70 mb-1">DATA TECHNIQUE</div>
                            <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                <span>Prix:</span> <span class="font-mono text-right">${parsed?.currentPrice || '-'} $</span>
                                <span>RSI:</span> <span class="font-mono text-right">${parsed?.indicators?.rsi14 || '-'}</span>
                                <span>MACD:</span> <span class="font-mono text-right">${parsed?.indicators?.macdHist || '-'}</span>
                                <span>MA20:</span> <span class="font-mono text-right">${parsed?.indicators?.ma20 || '-'}</span>
                            </div>
                        </div>
                         <div class="bg-base-200 p-2 rounded">
                            <div class="font-bold text-xs opacity-70 mb-1">AI SCORES</div>
                            <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                <span>News:</span> <span class="font-mono text-right">${parsed?.ai?.newsScore || '-'}</span>
                                <span>Tech:</span> <span class="font-mono text-right">${parsed?.indicators?.score || '-'}</span>
                                <span>AI Tech:</span> <span class="font-mono text-right">${parsed?.ai?.techScore || '-'}</span>
                            </div>
                        </div>
                     </div>
                     
                     ${parsed?.ai?.explanation ? `
                     <div class="p-3 bg-base-200 rounded text-xs leading-relaxed border-l-4 border-primary">
                        <div class="font-bold mb-1">Analyse IA</div>
                        ${parsed.ai.explanation.replace(/\n/g, '<br>')}
                     </div>
                     ` : ''}

                     ${parsed?.ai?.news && parsed.ai.news.length > 0 ? `
                     <div>
                        <div class="font-bold text-xs opacity-70 mb-1">ACTUALITÉS LIÉES</div>
                        <ul class="list-disc list-inside text-xs opacity-80 space-y-1">
                            ${parsed.ai.news.slice(0, 3).map(n => `
                                <li class="truncate"><a href="${n.link}" target="_blank" class="link link-hover">${n.title}</a></li>
                            `).join('')}
                        </ul>
                     </div>
                     ` : ''}
                  </div>
                </div>
              `;
      }).join('') || '<p class="text-center opacity-50 py-4">Aucune analyse disponible</p>'}
          </div>
        </div>
      `;

      this.showModal(name, content);

      // Render Chart after modal is shown
      setTimeout(() => {
        this.renderChart(historyAsc);
      }, 300);
    },

    renderChart(history) {
      const ctx = document.getElementById('scoreChart');
      if (!ctx) return;

      if (this.chartInstance) {
        this.chartInstance.destroy();
      }

      // Process data for 3 lines
      const labels = history.map(h => new Date(h.created).toLocaleDateString());
      const dataTotal = history.map(h => h.score);

      // Extract Tech and AI Tech scores from the stored JSON details in history (analyses table)
      // Since we are using 'analyses' table for history, 'details' column exists.
      // Note: In `get-ticket-details`, we selected `details` for `analysesRes` but for `historyRes` we might need to check if we selected `details`.
      // Let's check main.js query for `historyRes`. 
      // Ah, in main.js step 33: "SELECT id, score, created FROM analyses WHERE ticket = ? ORDER BY created DESC LIMIT 20"
      // I missed selecting `details` in `historyRes`. I need `details` to plot component scores.
      // For now, I will plot only Total Score as I can't easily change main.js without another tool call, 
      // BUT the user requirements said: "display the three available scores (when present)".
      // So I MUST update main.js to fetch details for history as well. 
      // Actually, `analysesRes` is LIMIT 10, `historyRes` is LIMIT 20. 
      // If I want to plot 3 lines, I need `details` in `historyRes`.

      // Wait, I can't update main.js right here in the middle of renderer code generation. 
      // I will assume I will fix main.js in the next step or I can rely on `analyses` which has details but is only limit 10.
      // The prompt says "daily evolution... three available scores".
      // Let's proceed with renderChart logic assuming data is available (or will be).
      // I will use `analyses` (which has details) for the chart if history doesn't have details, OR I will update main.js.
      // Updating main.js is cleaner.

      // However, I can't do it in this tool call.
      // I will write the code to use `details` if present.

      const dataTech = history.map(h => {
        // If h.details is string, parse it. If not present, null.
        // Wait, history items from `historyRes` in main.js currently DON'T have details.
        // I'll leave this logic here and update main.js in next step.
        try {
          const d = h.details ? JSON.parse(h.details) : null;
          return d?.indicators?.score || null;
        } catch (e) { return null; }
      });

      const dataAiTech = history.map(h => {
        try {
          const d = h.details ? JSON.parse(h.details) : null;
          return d?.ai?.techScore || null;
        } catch (e) { return null; }
      });

      this.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Global',
              data: dataTotal,
              borderColor: '#570df8', // primary
              backgroundColor: 'rgba(87, 13, 248, 0.1)',
              tension: 0.4,
              fill: true
            },
            {
              label: 'Technique',
              data: dataTech,
              borderColor: '#37cdbe', // secondary/accent
              borderDash: [5, 5],
              tension: 0.4,
              hidden: false
            },
            {
              label: 'AI Tech',
              data: dataAiTech,
              borderColor: '#f000b8', // secondary
              borderDash: [2, 2],
              tension: 0.4,
              hidden: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100
            }
          },
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    },

    // --- Modal Helpers ---

    showModal(title, content, onConfirm = null, isError = false) {
      this.modal = {
        show: true,
        title,
        content,
        onConfirm,
        isError
      };
    },

    closeModal() {
      this.modal = { show: false, title: '', content: '', onConfirm: null, isError: false };
      // Destroy chart if exists
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = null;
      }
    },

    // --- Utils ---

    formatDate(date) {
      if (!date) return '-';
      return new Date(date).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    },

    getLastScore(name) {
      const last = this.analyses.find(a => a.ticket === name);
      return last ? last.score.toFixed(0) : 'N/A';
    },

    getLastAnalysisDate(name) {
      return this.analyses.find(a => a.ticket === name)?.created ?? null;
    },

    getDashboardTickets() {
      const enriched = this.tickets.map(t => {
        const last = this.analyses.find(a => a.ticket === t.name);
        let details = null;
        try { details = last ? JSON.parse(last.details) : null; } catch (e) { }

        return {
          ...t,
          score: last ? last.score : -1,
          lastAnalysis: last,
          details: details
        };
      });

      return enriched.sort((a, b) => {
        if (this.sortOption === 'overall') return b.score - a.score;
        if (this.sortOption === 'current') return new Date(b.created).getTime() - new Date(a.created).getTime();

        const getTech = (item) => item.details?.indicators?.score || 0;
        const getAiTech = (item) => item.details?.ai?.techScore || 0;

        if (this.sortOption === 'technical') return getTech(b) - getTech(a);
        if (this.sortOption === 'ai_tech') return getAiTech(b) - getAiTech(a);

        return 0;
      });
    }
  };
}