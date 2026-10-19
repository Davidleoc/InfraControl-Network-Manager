import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { fetchHostnames } from './hostname-service.js';
import { fetchVlans } from './jira-service.js';
import { isIpInRange } from '../utils/ip-utils.js';

export async function sendBackupEmail() {
    console.log('[MAILER] Iniciando envio de backup...');
    
    // Ler arquivo de emails
    const emailsPath = path.join(process.cwd(), 'emails.txt');
    if (!fs.existsSync(emailsPath)) {
        console.warn('[MAILER] Arquivo emails.txt não encontrado. Nenhum email será enviado.');
        return;
    }
    
    const emailsRaw = fs.readFileSync(emailsPath, 'utf8');
    const emails = emailsRaw.split('\n').map(e => e.trim()).filter(e => e && e.includes('@'));
    
    if (emails.length === 0) {
        console.warn('[MAILER] Nenhum email válido encontrado em emails.txt.');
        return;
    }

    // Ler cache de IPs
    const scanCachePath = path.join(process.cwd(), 'data', 'last_scan_cache.json');
    let scanCache = {};
    if (fs.existsSync(scanCachePath)) {
        try {
            scanCache = JSON.parse(fs.readFileSync(scanCachePath, 'utf8'));
        } catch (e) {
            console.error('[MAILER] Erro ao ler last_scan_cache.json:', e);
        }
    }

    // Buscar VLANs para cruzar com os IPs
    let vlans = [];
    try {
        const vlanResult = await fetchVlans();
        vlans = vlanResult.vlans || [];
    } catch (e) {
        console.warn('[MAILER] Não foi possível buscar VLANs para o relatório:', e.message);
    }

    // ── Gerar XLSX de IPs ────────────────────────────────────────
    const ipWb = new ExcelJS.Workbook();
    const ipWs = ipWb.addWorksheet('IPs');
    ipWs.columns = [
        { header: 'IP', key: 'ip', width: 18 },
        { header: 'VLAN', key: 'vlan', width: 25 },
        { header: 'Zona de Segurança', key: 'zona', width: 20 },
        { header: 'Hostname', key: 'hostname', width: 35 },
        { header: 'Status', key: 'status', width: 15 },
    ];
    // Formatar coluna IP como texto
    ipWs.getColumn('ip').numFmt = '@';

    for (const [ipKey, entry] of Object.entries(scanCache)) {
        const info = entry.data || {};
        const ip = info.ip || ipKey;
        const vlan = vlans.find(v => isIpInRange(ip, v.initialIp, v.finalIp));
        const row = ipWs.addRow({
            ip: ip,
            vlan: vlan ? vlan.name : '',
            zona: vlan ? vlan.securityZone : '',
            hostname: info.dns || '',
            status: info.status || '',
        });
        // Forçar célula do IP como texto explícito
        const ipCell = row.getCell('ip');
        ipCell.value = String(ip);
        ipCell.numFmt = '@';
        ipCell.alignment = { horizontal: 'left' };
    }
    // Estilizar cabeçalho (apenas as células com dados)
    ipWs.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    });

    const ipBuffer = await ipWb.xlsx.writeBuffer();

    // ── Gerar XLSX de Ativos ─────────────────────────────────────
    const assetWb = new ExcelJS.Workbook();
    const assetWs = assetWb.addWorksheet('Ativos');
    assetWs.columns = [
        { header: 'Chave', key: 'chave', width: 15 },
        { header: 'Nome', key: 'nome', width: 35 },
        { header: 'Situação', key: 'situacao', width: 15 },
        { header: 'País', key: 'pais', width: 12 },
        { header: 'Descrição', key: 'descricao', width: 40 },
    ];

    try {
        const { hostnames } = await fetchHostnames();
        if (hostnames) {
            for (const h of hostnames) {
                const desc = (h.descricao || '').replace(/\n/g, ' ').replace(/\r/g, '');
                assetWs.addRow({
                    chave: h.key,
                    nome: h.name || '',
                    situacao: h.situacao || '',
                    pais: h.pais || '',
                    descricao: desc,
                });
            }
        }
    } catch (e) {
        console.error('[MAILER] Erro ao buscar hostnames:', e);
    }
    assetWs.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    });

    const assetBuffer = await assetWb.xlsx.writeBuffer();

    // ── Enviar e-mail ────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_TRANSPORT_DEFAULT_HOST,
        port: Number(process.env.EMAIL_TRANSPORT_DEFAULT_PORT) || 587,
        secure: false,
        requireTLS: process.env.EMAIL_TRANSPORT_DEFAULT_TLS === 'true',
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    // Obter a data real do último scan realizado
    let backupDate = new Date();
    const scanStatusPath = path.join(process.cwd(), 'data', 'scan-status.json');
    if (fs.existsSync(scanStatusPath)) {
        try {
            const statusData = JSON.parse(fs.readFileSync(scanStatusPath, 'utf8'));
            if (statusData && statusData.lastScanTime) {
                backupDate = new Date(statusData.lastScanTime);
            }
        } catch (e) {
            console.error('[MAILER] Erro ao ler a data do último scan:', e);
        }
    }
    const dateStr = backupDate.toISOString().split('T')[0];

    const mailOptions = {
        from: process.env.EMAIL_DEFAULT_FROM_MAIL || process.env.EMAIL_USERNAME,
        to: emails.join(', '),
        subject: `Backup Estrutura de rede ${process.env.NEXT_PUBLIC_COMPANY_NAME || 'Minha Empresa'} - ${dateStr}`,
        text: 'Seguem em anexo os relatórios diários de backup:\n1. Relatório de IPs\n2. Relatório de Nomes de Ativos',
        attachments: [
            {
                filename: `backup_ips_${dateStr}.xlsx`,
                content: Buffer.from(ipBuffer),
            },
            {
                filename: `backup_ativos_${dateStr}.xlsx`,
                content: Buffer.from(assetBuffer),
            }
        ]
    };

    try {
        if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_TRANSPORT_DEFAULT_HOST) {
             console.warn('[MAILER] Aviso: Variaveis de ambiente SMTP (EMAIL_*) nao configuradas corretamente.');
        }
        await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Backup enviado com sucesso para: ${emails.join(', ')}`);
    } catch (error) {
        console.error('[MAILER] Erro ao enviar email de backup:', error);
        throw error; // Relança para que o chamador saiba que falhou
    }
}
