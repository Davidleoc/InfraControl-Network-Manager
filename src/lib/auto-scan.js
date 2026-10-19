import fs from 'fs';
import path from 'path';

import { dataDir, scanStatusPath, debugLogPath } from './scan-config';

// Funções utilitárias para agendamento
function getMsUntil4AM() {
    const now = new Date();
    const target = new Date();
    target.setHours(4, 0, 0, 0);
    if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
}

let nextScanTimeout = null;

function getScanStatus() {
    if (!fs.existsSync(scanStatusPath)) return { isRunning: false };
    try {
        return JSON.parse(fs.readFileSync(scanStatusPath, 'utf8'));
    } catch (e) {
        return { isRunning: false };
    }
}

function setScanStatus(data) {
    try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const current = getScanStatus();
        const updated = { ...current, ...data };
        fs.writeFileSync(scanStatusPath, JSON.stringify(updated, null, 2));
    } catch (e) {
        console.error('[AUTO-SCAN] Erro ao gravar status:', e.message);
    }
}

export function updateStatusFile(data) {
    setScanStatus(data);
    if (data.status) {
        try { fs.appendFileSync(debugLogPath, `[${new Date().toLocaleString('pt-BR')}] ${data.status}\n`); } catch (e) { }
    }
}

// --- CONTROLE PERSISTENTE DO ENVIO DE BACKUP SEMANAL ---
const lastBackupSentPath = path.join(dataDir, 'last_backup_sent.json');

function getLastBackupSentInfo() {
    if (!fs.existsSync(lastBackupSentPath)) return { lastSentTime: null, lastSentDate: null };
    try {
        return JSON.parse(fs.readFileSync(lastBackupSentPath, 'utf8'));
    } catch (e) {
        return { lastSentTime: null, lastSentDate: null };
    }
}

function setLastBackupSentInfo(data) {
    try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(lastBackupSentPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[AUTO-SCAN] Erro ao gravar controle de envio do backup:', e.message);
    }
}

// --- AGORA SIM, IMPORTAR MÓDULOS DE LÓGICA ---
import { fetchVlans } from './jira-service';
import { performScan, saveScanCache } from './scanner';
import { generateIpRange } from '../utils/ip-utils';
import { fetchHostnames } from './hostname-service';
import { syncManualHostnamesWithReality } from './auto-scan-utils';
import { sendBackupEmail } from './mailer';


// Opcional: aceitar certificados autoassinados (ex.: Jira interno com CA própria)
if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function scheduleNextScan(delay = null) {
    if (nextScanTimeout) clearTimeout(nextScanTimeout);
    
    const actualDelay = delay !== null ? delay : getMsUntil4AM();
    const nextDate = new Date(Date.now() + actualDelay);
    
    console.log(`[AUTO-SCAN] Próxima varredura agendada para: ${nextDate.toLocaleString('pt-BR')}`);
    nextScanTimeout = setTimeout(runAutoScan, actualDelay);
}

export async function runAutoScan() {
    const info = getScanStatus();
    const now = Date.now();

    // Check for "Hanged" process: if isRunning is true but last update was > 2 hours ago, force release
    const lastUpdate = info.lastAttemptTime || 0;
    const isHanging = info.isRunning && (now - lastUpdate > 1000 * 60 * 60 * 2);

    if (info.isRunning && !isHanging) {
        console.log('[AUTO-SCAN] Varredura já em curso. Pulando ciclo automático.');
        return;
    }

    if (isHanging) {
        console.warn('[AUTO-SCAN] Varredura anterior parece estar travada (>2h). Forçando reinício.');
    }

    setScanStatus({ isRunning: true, lastAttemptTime: now, lastAttemptDate: new Date().toLocaleString('pt-BR'), status: 'Iniciando fase automatizada...' });
    console.log('[AUTO-SCAN] Iniciando varredura global programada...');

    try {
        console.log('[AUTO-SCAN] [FASE 1] Verificando Hostnames e IPs...');
        updateStatusFile({ status: 'Sincronizando Hostnames do Jira...' });

        const { hostnames: jiraHostnames } = await fetchHostnames(true);
        console.log(`[AUTO-SCAN] Obtidos ${jiraHostnames?.length || 0} hostnames.`);

        try {
            await syncManualHostnamesWithReality(jiraHostnames);
        } catch (e) {
            console.warn('[AUTO-SCAN] Erro na sync de hostnames:', e.message);
        }

        updateStatusFile({ status: 'Sincronizando VLANs do Jira...' });
        const { vlans } = await fetchVlans(true);
        console.log(`[AUTO-SCAN] Obtidas ${vlans?.length || 0} VLANs.`);

        let totalVlans = vlans.length;
        let processed = 0;
        const parallelVlans = 2; // Meio termo: processar 2 VLANs ao mesmo tempo

        for (let i = 0; i < vlans.length; i += parallelVlans) {
            const currentVlans = vlans.slice(i, i + parallelVlans);

            await Promise.all(currentVlans.map(async (vlan) => {
                processed++;
                updateStatusFile({
                    status: `Varrendo VLANs (${processed}/${vlans.length}): ${vlan.nome || vlan.key}`,
                    lastAttemptTime: Date.now()
                });

                let start = vlan.initialIp;
                let end = vlan.finalIp;
                if (start === '-' && vlan.range && vlan.range.includes('/')) start = vlan.range.split('/')[0];
                if (end === '-') end = start;
                if (!start || start === '-') return;

                const ips = generateIpRange(start, end, 512);
                
                // Throttling equilibrado
                const batchSize = 25; // Meio termo entre 10 e 100
                for (let j = 0; j < ips.length; j += batchSize) {
                    const batch = ips.slice(j, j + batchSize);
                    await Promise.allSettled(batch.map(ip => performScan(ip, true)));
                    await new Promise(resolve => setTimeout(resolve, 50)); // Mantém responsividade
                }
            }));
        }

        updateStatusFile({
            lastScanTime: Date.now(),
            lastScanDate: new Date().toLocaleString('pt-BR'),
            status: 'Sucesso: Varredura Global Completa',
            isRunning: false,
            error: null
        });
        saveScanCache();
        console.log('[AUTO-SCAN] Varredura global concluída com sucesso.');
        console.log('[AUTO-SCAN] Ciclo de varredura global finalizado. Verificando backup semanal...');
    } catch (error) {
        updateStatusFile({
            status: 'Erro na Varredura',
            isRunning: false,
            error: error.message,
            stack: error.stack
        });
    } finally {
        try {
            await checkAndSendWeeklyBackup();
        } catch (mailErr) {
            console.error('[AUTO-SCAN] Erro no fluxo resiliente de e-mail de backup:', mailErr);
        }
        scheduleNextScan();
    }
}

export async function checkAndSendWeeklyBackup(force = false) {
    try {
        const targetDay = parseInt(process.env.EMAIL_BACKUP_DAY || '1', 10); // Segunda-feira = 1
        const now = new Date();
        const currentDay = now.getDay();
        
        // Só tenta enviar se hoje for pelo menos o dia agendado (ou qualquer dia posterior da semana)
        // Por exemplo, se EMAIL_BACKUP_DAY = 1 (Segunda), só envia de Segunda a Sábado.
        if (!force && currentDay < targetDay && currentDay !== 0) {
            console.log(`[AUTO-SCAN] Hoje ainda não é dia de checar backup semanal (Agendado para o dia ${targetDay}, hoje é ${currentDay}).`);
            return;
        }

        // Calcula a segunda-feira (ou dia do backup) da semana atual de referência
        const dayDiff = (now.getDay() - targetDay + 7) % 7;
        const refBackupDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayDiff);
        refBackupDay.setHours(0, 0, 0, 0);
        const refTimestamp = refBackupDay.getTime();

        const backupInfo = getLastBackupSentInfo();
        const lastSentTime = backupInfo.lastSentTime || 0;

        if (force || lastSentTime < refTimestamp) {
            console.log('[AUTO-SCAN] Detectado que o backup semanal ainda não foi enviado. Iniciando envio...');
            await sendBackupEmail();
            setLastBackupSentInfo({
                lastSentTime: Date.now(),
                lastSentDate: new Date().toLocaleString('pt-BR'),
                status: 'Backup enviado com sucesso'
            });
            console.log('[AUTO-SCAN] Controle de envio do backup atualizado com sucesso.');
        } else {
            console.log(`[AUTO-SCAN] Backup desta semana já foi enviado em: ${backupInfo.lastSentDate}`);
        }
    } catch (e) {
        console.error('[AUTO-SCAN] Erro ao processar envio resiliente de backup por e-mail:', e.message);
    }
}

export function getLastScanInfo() {
    const info = getScanStatus();
    return info;
}

export function initAutoScan() {
    if (global._autoScanInitialized) return;
    global._autoScanInitialized = true;
    
    console.log('[AUTO-SCAN] Inicializando agendamento diário (4h da manhã)...');

    // Ao iniciar o sistema, sempre agendamos para a próxima madrugada
    scheduleNextScan();

    // E disparamos em segundo plano uma verificação proativa de backup semanal
    // para enviar imediatamente caso a segunda-feira já tenha passado e o backup correspondente ainda não tenha sido enviado!
    setTimeout(() => {
        console.log('[AUTO-SCAN] Executando verificação proativa de backup semanal na inicialização do sistema...');
        checkAndSendWeeklyBackup().catch(err => {
            console.error('[AUTO-SCAN] Erro na verificação proativa de backup na inicialização:', err);
        });
    }, 5000);
}

