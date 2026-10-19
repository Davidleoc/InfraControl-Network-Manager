import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns/promises';
import { getManualStatus, getAllManualStatuses, setManualStatus } from './status-store.js';

const execPromise = promisify(exec);

const CACHE_FILE = path.join(process.cwd(), 'data', 'last_scan_cache.json');

// GLOBAL SINGLETON CACHE
const globalScanCache = global._scanCache || new Map();
if (!global._scanCache) {
    global._scanCache = globalScanCache;
    // Tenta carregar do disco ao inicializar para ter disponibilidade instantânea
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const fileData = fs.readFileSync(CACHE_FILE, 'utf8');
            const parsed = JSON.parse(fileData);
            for (const [k, v] of Object.entries(parsed)) {
                globalScanCache.set(k, v);
            }
            console.log(`[SCANNER] Cache inicializado com ${globalScanCache.size} registros carregados do disco.`);
        }
    } catch (e) {
        console.warn(`[SCANNER] Aviso: Falha ao carregar cache prévio: ${e.message}`);
    }
}

export function saveScanCache() {
    try {
        const obj = Object.fromEntries(globalScanCache.entries());
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
        console.log(`[SCANNER] Cache de ${globalScanCache.size} registros salvo em disco com sucesso.`);
    } catch (e) {
        console.error(`[SCANNER] Falha ao salvar cache no disco: ${e.message}`);
    }
}

const SCAN_TTL = 1000 * 60 * 60 * 25; // 25 hours cache to bridge the daily 4AM scans without expiring
let activeScans = 0;
const MAX_CONCURRENT_PINGS = 100; // Meio termo: rápido o suficiente, mas sem travar o sistema

export async function performScan(ip, force = false) {
    const now = Date.now();

    // 1. Check Cache
    if (!force && globalScanCache.has(ip)) {
        const cached = globalScanCache.get(ip);
        if (now - cached.timestamp < SCAN_TTL) {
            // Check manual status even for cached
            const manual = getManualStatus(ip);
            const dataWithManual = { ...cached.data };
            if (manual) {
                dataWithManual.status = manual.status;
                dataWithManual.manual = manual;
            }
            return { ...dataWithManual, cached: true };
        }
    }

    // 2. Concurrency Control with Priority
    // Manual scans (force=true usually) get higher priority
    const limit = force ? MAX_CONCURRENT_PINGS : Math.floor(MAX_CONCURRENT_PINGS * 0.7);
    
    if (activeScans >= limit) {
        if (!force) throw new Error('Server busy');
        // If it's a forced/manual scan, we let it through up to the hard limit
        if (activeScans >= MAX_CONCURRENT_PINGS) throw new Error('Server capacity reached');
    }

    activeScans++;
    try {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? `ping -n 1 -w 500 ${ip}` : `ping -c 1 -W 1 ${ip}`;

        let online = false;
        let hostname = '-';

        const results = await Promise.allSettled([
            execPromise(command),
            dns.reverse(ip)
        ]);

        if (results[0].status === 'fulfilled') online = true;
        if (results[1].status === 'fulfilled') {
            hostname = results[1].value[0] || '-';
        }

        let manual = getManualStatus(ip);
        let status = (online || hostname !== '-') ? 'Em Uso' : 'Disponível';

        if (manual) {
            const mText = (manual.status || '').toLowerCase();
            const realStatusIsBusy = (online || hostname !== '-');

            if (mText === 'in use' || mText === 'em uso' || mText === 'ocupado') {
                if (manual.updatedBy === 'System (Exception)') {
                    // Do nothing, enforce exception
                    status = manual.status;
                } else if (!realStatusIsBusy) {
                    // Se o scan diz que está livre, mas estava manual 'In Use', corrige para Livre
                    manual = setManualStatus(ip, 'Disponível', 'System Scan');
                    status = 'Disponível';
                } else {
                    status = manual.status;
                }
            } else if (mText === 'reservado' || mText === 'reserved') {
                // Mantém reservado até que o CMDB reporte 'Em Uso' (via reload dos dados Jira)
                // O scanner local NÃO deve mudar de Reservado para Em Uso automaticamente por ping
                status = manual.status;
            } else if (mText === 'free' || mText === 'livre' || mText === 'disponível' || mText === 'available') {
                // Se estava marcado como livre mas o scan detectou uso, corrige para In Use
                if (realStatusIsBusy) {
                    manual = setManualStatus(ip, 'Em Uso', 'System Scan');
                    status = 'Em Uso';
                } else {
                    status = manual.status;
                }
            } else {
                // Outros status manuais são preservados
                status = manual.status;
            }
        }

        const scanResult = {
            ip,
            status,
            online,
            dns: hostname,
            manual: manual || undefined
        };

        console.log(`[SCANNER] Result for ${ip}: ${status} (Ping: ${online}, DNS: ${hostname !== '-'})`);

        globalScanCache.set(ip, {
            timestamp: now,
            data: scanResult
        });

        return scanResult;
    } finally {
        activeScans--;
    }
}

export function getCachedScan(ip) {
    const cached = globalScanCache.get(ip);
    if (cached && (Date.now() - cached.timestamp < SCAN_TTL)) {
        const manual = getManualStatus(ip);
        const data = { ...cached.data };
        if (manual) {
            data.status = manual.status;
            data.manual = manual;
        }
        return data;
    }
    return null;
}

export function getMultiCachedScans(ips) {
    const results = {};
    const manualAll = getAllManualStatuses();

    ips.forEach(ip => {
        const cached = getCachedScan(ip);
        if (cached) {
            results[ip] = cached;
        } else if (manualAll[ip]) {
            // Even if not cached, if it has a manual status, show it
            results[ip] = {
                ip,
                status: manualAll[ip].status,
                online: false,
                dns: '-',
                manual: manualAll[ip]
            };
        }
    });
    return results;
}
export async function performHostnameScan(hostname) {
    if (!hostname || hostname === '-') return { online: false };

    try {
        const isWindows = process.platform === 'win32';

        // 1. Resolve to IP first
        let ip = null;
        try {
            const addresses = await dns.resolve4(hostname);
            ip = addresses[0];
        } catch (e) {
            // DNS resolution failed, but maybe it's pingable by name?
        }

        const target = ip || hostname;
        const command = isWindows ? `ping -n 1 -w 500 ${target}` : `ping -c 1 -W 1 ${target}`;

        try {
            await execPromise(command);
            return { online: true, ip };
        } catch (e) {
            return { online: false, ip };
        }
    } catch (error) {
        return { online: false };
    }
}
