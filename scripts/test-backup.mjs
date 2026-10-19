/**
 * Script de teste — gera .xlsx e envia por e-mail.
 * Uso: node --env-file=.env.local scripts/test-backup.mjs
 */
import fs from 'fs';
import path from 'path';
import { createTransport } from 'nodemailer';
import ExcelJS from 'exceljs';

const CWD = process.cwd();

// ── Helpers ──────────────────────────────────────────────────────
function ipToInt(ip) {
    if (!ip || typeof ip !== 'string' || !ip.includes('.')) return 0;
    try { return ip.trim().split('.').reduce((a, o) => (a << 8) + parseInt(o, 10), 0) >>> 0; }
    catch { return 0; }
}
function isIpInRange(ip, s, e) {
    const t = ipToInt(ip), si = ipToInt(s), ei = ipToInt(e);
    return si !== 0 && ei !== 0 && t >= si && t <= ei;
}

// ── 1. E-mails ───────────────────────────────────────────────────
const emails = fs.readFileSync(path.join(CWD, 'emails.txt'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && l.includes('@'));
if (!emails.length) { console.error('Nenhum e-mail válido.'); process.exit(1); }
console.log(`[TESTE] Destinatários: ${emails.join(', ')}`);

// ── 2. VLANs do Jira ────────────────────────────────────────────
let vlans = [];
const JIRA_URL = process.env.JIRA_URL, JIRA_TOKEN = process.env.JIRA_TOKEN;
if (JIRA_URL && JIRA_TOKEN) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const headers = { 'Authorization': `Bearer ${JIRA_TOKEN}`, 'Content-Type': 'application/json' };
    const IQL = `objectType = "${process.env.JIRA_VLAN_TYPE || 'VLAN'}"`;
    console.log('[TESTE] Buscando VLANs...');
    try {
        const res = await fetch(`${JIRA_URL}/rest/insight/1.0/iql/objects?iql=${encodeURIComponent(IQL)}&resultPerPage=1000`, { headers });
        if (res.ok) {
            const entries = (await res.json()).objectEntries || [];
            const allFull = [];
            for (let i = 0; i < entries.length; i += 50) {
                const batch = entries.slice(i, i + 50);
                const details = await Promise.all(batch.map(async e => {
                    try { const r = await fetch(`${JIRA_URL}/rest/insight/1.0/object/${e.id}`, { headers }); return r.ok ? await r.json() : null; }
                    catch { return null; }
                }));
                allFull.push(...details.filter(Boolean));
                await new Promise(r => setTimeout(r, 200));
            }
            const getAttr = (entry, terms) => {
                const arr = Array.isArray(terms) ? terms : [terms];
                const attr = (entry.attributes || []).find(a => arr.some(t => (a.objectTypeAttribute?.name || '').toLowerCase().includes(t.toLowerCase())));
                return attr?.objectAttributeValues?.[0]?.displayValue || attr?.objectAttributeValues?.[0]?.value || '';
            };
            vlans = allFull.map(e => ({ name: e.label, initialIp: getAttr(e, ['IP inicial', 'Inicial']), finalIp: getAttr(e, ['IP final', 'Final']), securityZone: getAttr(e, ['Zona', 'Segurança', 'Seguranca']) }));
            console.log(`[TESTE] ${vlans.length} VLANs carregadas.`);
        }
    } catch (e) { console.warn('[TESTE] Erro VLANs:', e.message); }
}

// ── 3. XLSX de IPs ───────────────────────────────────────────────
const ipWb = new ExcelJS.Workbook();
const ipWs = ipWb.addWorksheet('IPs');
ipWs.columns = [
    { header: 'IP', key: 'ip', width: 18 },
    { header: 'VLAN', key: 'vlan', width: 25 },
    { header: 'Zona de Segurança', key: 'zona', width: 20 },
    { header: 'Hostname', key: 'hostname', width: 35 },
    { header: 'Status', key: 'status', width: 15 },
];
ipWs.getColumn('ip').numFmt = '@'; // Formato texto

const scanCachePath = path.join(CWD, 'data', 'last_scan_cache.json');
if (fs.existsSync(scanCachePath)) {
    const cache = JSON.parse(fs.readFileSync(scanCachePath, 'utf8'));
    let count = 0;
    for (const [ipKey, entry] of Object.entries(cache)) {
        const info = entry.data || {};
        const ip = info.ip || ipKey;
        const vlan = vlans.find(v => isIpInRange(ip, v.initialIp, v.finalIp));
        const row = ipWs.addRow({ ip, vlan: vlan?.name || '', zona: vlan?.securityZone || '', hostname: info.dns || '', status: info.status || '' });
        // Forçar texto
        const cell = row.getCell('ip');
        cell.value = String(ip);
        cell.numFmt = '@';
        cell.alignment = { horizontal: 'left' };
        count++;
    }
    console.log(`[TESTE] IPs: ${count} registros.`);
}
ipWs.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
});
const ipBuffer = await ipWb.xlsx.writeBuffer();

// ── 4. XLSX de Ativos ────────────────────────────────────────────
const assetWb = new ExcelJS.Workbook();
const assetWs = assetWb.addWorksheet('Ativos');
assetWs.columns = [
    { header: 'Chave', key: 'chave', width: 15 },
    { header: 'Nome', key: 'nome', width: 35 },
    { header: 'Situação', key: 'situacao', width: 15 },
    { header: 'País', key: 'pais', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 40 },
];
const hostCachePath = path.join(CWD, 'data', 'last_hostname_cache.json');
if (fs.existsSync(hostCachePath)) {
    const hostnames = JSON.parse(fs.readFileSync(hostCachePath, 'utf8'));
    for (const h of hostnames) {
        assetWs.addRow({ chave: h.key, nome: h.name || '', situacao: h.situacao || '', pais: h.pais || '', descricao: (h.descricao || '').replace(/\n/g, ' ') });
    }
    console.log(`[TESTE] Ativos: ${hostnames.length} registros.`);
}
assetWs.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
});
const assetBuffer = await assetWb.xlsx.writeBuffer();

// ── 5. Enviar ────────────────────────────────────────────────────
const transporter = createTransport({
    host: process.env.EMAIL_TRANSPORT_DEFAULT_HOST,
    port: Number(process.env.EMAIL_TRANSPORT_DEFAULT_PORT) || 587,
    secure: false,
    requireTLS: process.env.EMAIL_TRANSPORT_DEFAULT_TLS === 'true',
    auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD },
});

// Obter a data real do último scan realizado
let backupDate = new Date();
const scanStatusPath = path.join(CWD, 'data', 'scan-status.json');
if (fs.existsSync(scanStatusPath)) {
    try {
        const statusData = JSON.parse(fs.readFileSync(scanStatusPath, 'utf8'));
        if (statusData && statusData.lastScanTime) {
            backupDate = new Date(statusData.lastScanTime);
        }
    } catch (e) {
        console.error('[TESTE] Erro ao ler a data do último scan:', e);
    }
}
const dateStr = backupDate.toISOString().split('T')[0];
try {
    console.log('[TESTE] Enviando...');
    await transporter.sendMail({
        from: process.env.EMAIL_DEFAULT_FROM_MAIL || process.env.EMAIL_USERNAME,
        to: emails.join(', '),
        subject: `Backup Estrutura de rede ${process.env.NEXT_PUBLIC_COMPANY_NAME || 'Minha Empresa'} - ${dateStr}`,
        text: 'E-mail de TESTE com relatórios em anexo.',
        attachments: [
            { filename: `backup_ips_${dateStr}.xlsx`, content: Buffer.from(ipBuffer) },
            { filename: `backup_ativos_${dateStr}.xlsx`, content: Buffer.from(assetBuffer) },
        ],
    });
    console.log(`\n✅ Enviado para: ${emails.join(', ')}`);
} catch (e) {
    console.error(`\n❌ Falha: ${e.message}`);
}
