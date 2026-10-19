import fs from 'fs';
import path from 'path';
const { addHistoryEntry } = require('./history-store');
// Auto-scan initialization is handled by API routes that need it (like /api/jira or /api/admin/scan-status)
// to avoid circular dependency issues during module evaluation.

const STATUS_FILE = path.join(process.cwd(), 'manual_ip_status.json');
const HISTORY_FILE = path.join(process.cwd(), 'ip_status_history.json');
const HOSTNAME_STATUS_FILE = path.join(process.cwd(), 'manual_hostname_status.json');
const HOSTNAME_HISTORY_FILE = path.join(process.cwd(), 'hostname_history.json');

function ensureFile(file) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({}, null, 2));
    }
}

function normalizeData(data) {
    if (!data || typeof data !== 'object') return { data: {}, changed: false };
    let changed = false;
    for (const key in data) {
        if (!data[key] || typeof data[key].status !== 'string') continue;
        if (data[key].status === 'Free') {
            data[key].status = 'Disponível';
            changed = true;
        } else if (data[key].status === 'In Use') {
            data[key].status = 'Em Uso';
            changed = true;
        }
    }
    return { data, changed };
}

export function getRawManualStatuses() {
    ensureFile(STATUS_FILE);
    try {
        const raw = fs.readFileSync(STATUS_FILE, 'utf8');
        let data = JSON.parse(raw);
        const { data: normalized, changed } = normalizeData(data);
        if (changed) fs.writeFileSync(STATUS_FILE, JSON.stringify(normalized, null, 2));
        return normalized;
    } catch (e) {
        return {};
    }
}

export function getAllManualStatuses() {
    const data = getRawManualStatuses();
    const exceptionsFile = path.join(process.cwd(), 'data', 'ip_exceptions.txt');
    try {
        if (fs.existsSync(exceptionsFile)) {
            const content = fs.readFileSync(exceptionsFile, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                const text = line.split('#')[0].trim();
                if (text) {
                    const ips = text.split(/[\s,]+/);
                    ips.forEach(ip => {
                        if (ip) {
                            data[ip] = {
                                status: 'Em Uso',
                                updatedBy: 'System (Exception)',
                                updatedAt: new Date().toISOString()
                            };
                        }
                    });
                }
            });
        }
    } catch (e) {
        console.error('Error reading exceptions file:', e);
    }
    return data;
}

export function getIpHistory(ip) {
    ensureFile(HISTORY_FILE);
    try {
        const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        return data[ip] || [];
    } catch (e) {
        return [];
    }
}

export function setManualStatus(ip, status, user) {
    ensureFile(STATUS_FILE);
    ensureFile(HISTORY_FILE);

    // Save current status
    const data = getRawManualStatuses();
    const current = data[ip];

    // If status is unchanged, skip update and history to avoid duplicates
    if (current && current.status === status) {
        return current;
    }

    const entry = {
        status,
        updatedBy: user,
        updatedAt: new Date().toISOString()
    };

    if (status === 'Disponível') {
        // We keep it in data for UI as requested "como ja acontece" but maybe with status Free
        data[ip] = entry;
    } else {
        data[ip] = entry;
    }
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));

    // Save history
    const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (!historyData[ip]) historyData[ip] = [];

    const oldStatus = current ? current.status : null;
    historyData[ip].unshift(entry); // Add to beginning
    historyData[ip] = historyData[ip].slice(0, 25); // Keep last 25
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 2));

    // SAVE TO GLOBAL SQLITE HISTORY
    addHistoryEntry({
        type: 'IP',
        identifier: ip,
        oldStatus: oldStatus,
        newStatus: status,
        updatedBy: user
    }).catch(err => console.error('Failed to save to global history:', err));

    return entry;
}

export function getManualStatus(ip) {
    const data = getAllManualStatuses();
    return data[ip] || null;
}

// Hostname Specific Functions
export function getAllHostnameManualStatuses() {
    ensureFile(HOSTNAME_STATUS_FILE);
    try {
        const raw = fs.readFileSync(HOSTNAME_STATUS_FILE, 'utf8');
        let data = JSON.parse(raw);
        const { data: normalized, changed } = normalizeData(data);
        if (changed) fs.writeFileSync(HOSTNAME_STATUS_FILE, JSON.stringify(normalized, null, 2));
        return normalized;
    } catch (e) { return {}; }
}

export function getHostnameHistory(key) {
    ensureFile(HOSTNAME_HISTORY_FILE);
    try {
        const data = JSON.parse(fs.readFileSync(HOSTNAME_HISTORY_FILE, 'utf8'));
        return data[key] || [];
    } catch (e) { return []; }
}

export function setHostnameManualStatus(key, status, user, hostName = null) {
    ensureFile(HOSTNAME_STATUS_FILE);
    ensureFile(HOSTNAME_HISTORY_FILE);

    const data = getAllHostnameManualStatuses();
    const current = data[key];

    // If status is unchanged, skip update and history to avoid duplicates
    if (current && current.status === status) {
        return current;
    }

    const entry = { status, updatedBy: user, updatedAt: new Date().toISOString() };
    data[key] = entry;
    fs.writeFileSync(HOSTNAME_STATUS_FILE, JSON.stringify(data, null, 2));

    // Update History
    const historyData = JSON.parse(fs.readFileSync(HOSTNAME_HISTORY_FILE, 'utf8'));
    if (!historyData[key]) historyData[key] = [];

    const oldStatus = current ? current.status : null;
    historyData[key].unshift(entry);
    historyData[key] = historyData[key].slice(0, 25);
    fs.writeFileSync(HOSTNAME_HISTORY_FILE, JSON.stringify(historyData, null, 2));

    // SAVE TO GLOBAL SQLITE HISTORY
    addHistoryEntry({
        type: 'HOSTNAME',
        identifier: key,
        oldStatus: oldStatus,
        newStatus: status,
        updatedBy: user,
        details: hostName || key
    }).catch(err => console.error('Failed to save to global history:', err));

    return entry;
}
