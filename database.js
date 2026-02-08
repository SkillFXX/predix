const fs = require('fs');
const initSqlJs = require('sql.js');

class DatabaseService {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    async init() {
        const SQL = await initSqlJs();
        if (fs.existsSync(this.dbPath)) {
            const fileBuffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(fileBuffer);
        } else {
            this.db = new SQL.Database();
            this.createSchema();
            this.seed();
            this.save();
        }
    }

    createSchema() {
        this.db.run("CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT, updated TEXT)");
        this.db.run("CREATE TABLE IF NOT EXISTS tickets (name TEXT PRIMARY KEY, created TEXT)");
        this.db.run("CREATE TABLE IF NOT EXISTS analyses (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket TEXT, score REAL, created TEXT, details TEXT)");

    }

    seed() {
        const now = new Date().toISOString();
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('realtime_updates', '1', ?)", [now]);

        // AI Settings
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('ai_enabled', '0', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('ai_tech_enabled', '0', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('llm_api_url', 'http://127.0.0.1:11434', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('llm_model', 'mistral', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('news_days_limit', '3', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('news_count_limit', '5', ?)", [now]);

        // Weights
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('weight_tech', '0.4', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('weight_ai_news', '0.4', ?)", [now]);
        this.run("INSERT OR IGNORE INTO settings (name, value, updated) VALUES ('weight_ai_tech', '0.2', ?)", [now]);

        // Default tickets
        this.run("INSERT OR IGNORE INTO tickets (name, created) VALUES ('BTC', ?)", [now]);
        this.run("INSERT OR IGNORE INTO tickets (name, created) VALUES ('ETH', ?)", [now]);
        this.run("INSERT OR IGNORE INTO tickets (name, created) VALUES ('AAPL', ?)", [now]);
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    run(sql, params = []) {
        this.db.run(sql, params);
        // Auto-save on modification could be an option, but explicit save is safer for batch ops
    }

    exec(sql, params = []) {
        const res = this.db.exec(sql, params);
        if (res.length > 0) {
            return res[0].values.map(row => {
                const obj = {};
                res[0].columns.forEach((col, i) => {
                    obj[col] = row[i];
                });
                return obj;
            });
        }
        return [];
    }

    // Specific Helpers

    async addTicket(name) {
        const now = new Date().toISOString();
        this.run("INSERT INTO tickets (name, created) VALUES (?, ?)", [name, now]);
        this.save();
    }

    async deleteTicket(name) {
        this.run("DELETE FROM tickets WHERE name = ?", [name]);
        this.run("DELETE FROM analyses WHERE ticket = ?", [name]);

        this.save();
    }

    addAnalysis(ticket, result) {
        const now = new Date().toISOString();
        const details = JSON.stringify(result);
        this.run("INSERT INTO analyses (ticket, score, created, details) VALUES (?, ?, ?, ?)", [ticket, result.score, now, details]);

        this.save();
    }

    getTickets() {
        return this.exec("SELECT name, created FROM tickets ORDER BY created DESC");
    }

    getAnalyses(ticket = null) {
        let sql = "SELECT id, ticket, score, created, details FROM analyses ";
        let params = [];
        if (ticket) {
            sql += "WHERE ticket = ? ";
            params.push(ticket);
        }
        sql += "ORDER BY created DESC";
        return this.exec(sql, params);
    }

    getSettings() {
        const rows = this.exec("SELECT name, value FROM settings");
        const settings = {};
        rows.forEach(r => settings[r.name] = r.value);
        return settings;
    }

    saveSettings(settings) {
        const now = new Date().toISOString();
        for (const [name, value] of Object.entries(settings)) {
            this.run("INSERT INTO settings (name, value, updated) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated=excluded.updated", [name, value, now]);
        }
        this.save();
    }
}

module.exports = DatabaseService;
