const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Garante que a pasta de dados existe (especialmente para Docker)
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Inicialização das tabelas
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'IP' ou 'HOSTNAME'
            identifier TEXT NOT NULL, -- O IP ou a Chave do CMDB
            oldStatus TEXT,
            newStatus TEXT NOT NULL,
            updatedBy TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        )
    `);
});

/**
 * Adiciona um registro ao histórico global e limpa registros antigos (> 3 meses)
 */
function addHistoryEntry({ type, identifier, oldStatus, newStatus, updatedBy, details = '' }) {
    return new Promise((resolve, reject) => {
        // Purge records older than 3 months (90 days)
        db.run(`DELETE FROM history WHERE updatedAt < date('now', '-90 days')`, (err) => {
            if (err) console.error('Failed to purge old history:', err);
        });

        const stmt = db.prepare(`
            INSERT INTO history (type, identifier, oldStatus, newStatus, updatedBy, updatedAt, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(type, identifier, oldStatus, newStatus, updatedBy, new Date().toISOString(), details, function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
        stmt.finalize();
    });
}

/**
 * Busca o histórico com filtros
 */
function getHistory({ limit = 100, type, status, timeRange } = {}) {
    return new Promise((resolve, reject) => {
        let query = `SELECT * FROM history WHERE 1=1`;
        const params = [];

        if (type && type !== 'todos') {
            query += ` AND type = ?`;
            params.push(type.toUpperCase());
        }

        if (status && status !== 'todos') {
            query += ` AND newStatus LIKE ?`;
            params.push(`%${status}%`);
        }

        if (timeRange) {
            if (timeRange === 'today') {
                query += ` AND updatedAt >= date('now', 'start of day')`;
            } else if (timeRange === 'week') {
                query += ` AND updatedAt >= date('now', '-7 days')`;
            } else if (timeRange === 'month') {
                query += ` AND updatedAt >= date('now', '-30 days')`;
            } else if (timeRange === '3months' || timeRange === 'all') {
                query += ` AND updatedAt >= date('now', '-90 days')`;
            }
        }

        query += ` ORDER BY updatedAt DESC LIMIT ?`;
        params.push(limit);

        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    addHistoryEntry,
    getHistory
};
