import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'last_hostname_cache.json');

const globalHostnameCache = global._hostnameCache_v4 || {
    data: null,
    lastFetch: 0,
    TTL: 1000 * 60 * 60 * 25, // 25 hours
};

if (!global._hostnameCache_v4) {
    global._hostnameCache_v4 = globalHostnameCache;
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const fileData = fs.readFileSync(CACHE_FILE, 'utf8');
            globalHostnameCache.data = JSON.parse(fileData);
            globalHostnameCache.lastFetch = Date.now(); // Marca como válido agora
            console.log(`[HOSTNAMES] Cache inicializado com ${globalHostnameCache.data?.length || 0} hostnames do disco.`);
        }
    } catch (e) {
        console.warn(`[HOSTNAMES] Falha ao carregar cache do disco:`, e.message);
    }
}

// Opcional: aceitar certificados autoassinados (ex.: Jira interno com CA própria)
if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function fetchHostnames(force = false) {
    const now = Date.now();

    if (!force && globalHostnameCache.data && (now - globalHostnameCache.lastFetch < globalHostnameCache.TTL)) {
        return { hostnames: globalHostnameCache.data, cached: true };
    }

    const JIRA_URL = process.env.JIRA_URL;
    const JIRA_TOKEN = process.env.JIRA_TOKEN;
    const headers = {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Node.js/Gerenciador-IPs',
    };

    const HOSTNAME_TYPE = process.env.JIRA_HOSTNAME_TYPE || 'Nome de ativo';
    const IQL = `objectType = "${HOSTNAME_TYPE}"`;
    let allEntries = [];
    let page = 1;
    const pageSize = 500;

    // Paginate through all entries
    while (true) {
        const url = `${JIRA_URL}/rest/insight/1.0/iql/objects?iql=${encodeURIComponent(IQL)}&resultPerPage=${pageSize}&page=${page}`;
        console.log(`[HOSTNAMES] Fetching page ${page} from: ${url}`);
        try {
            const res = await fetch(url, { headers, cache: 'no-store' });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Jira returned ${res.status}: ${text.substring(0, 100)}`);
            }
            const data = await res.json();
            const entries = data.objectEntries || [];
            if (entries.length === 0) break;
            allEntries = allEntries.concat(entries);
            if (allEntries.length >= (data.totalFilterCount || 0)) break;
            page++;
        } catch (err) {
            console.error(`[HOSTNAMES] Page ${page} Fetch Error: ${err.message}`);
            throw err;
        }
    }

    console.log(`[HOSTNAMES] Found ${allEntries.length} total entries. Building dynamic ID map...`);

    // Attribute IDs are discovered dynamically from a sample object below
    let attrMap = {};

    if (allEntries.length > 0) {
        try {
            const sampleRes = await fetch(`${JIRA_URL}/rest/insight/1.0/object/${allEntries[0].id}`, { headers });
            if (sampleRes.ok) {
                const sample = await sampleRes.json();
                (sample.attributes || []).forEach(a => {
                    const name = a.objectTypeAttribute?.name;
                    if (name) attrMap[name] = a.objectTypeAttributeId;
                });
                console.log('[HOSTNAMES] Dynamic ID map built successfully.');
            }
        } catch (mapErr) {
            console.error('[HOSTNAMES] Could not build dynamic map, using defaults:', mapErr.message);
        }
    }

    const getAttr = (entry, name) => {
        const id = attrMap[name];
        if (!id) return '-';
        const attr = (entry.attributes || []).find(a => a.objectTypeAttributeId === id);
        if (!attr) return '-';
        return attr.objectAttributeValues?.[0]?.displayValue || attr.objectAttributeValues?.[0]?.value || '-';
    };

    const hostnames = allEntries.map(entry => ({
        id: entry.id,
        key: entry.objectKey,
        name: entry.label,
        descricao: getAttr(entry, 'Descrição') || getAttr(entry, 'Descricao'),
        situacao: getAttr(entry, 'Situação') || getAttr(entry, 'Status'),
        pais: getAttr(entry, 'País') || getAttr(entry, 'Pais'),
        padronizacao: getAttr(entry, 'Padronização') || getAttr(entry, 'Padronizacao'),
        objectTypeId: entry.objectType?.id || null,
        situacaoAttrId: attrMap['Situação'] || attrMap['Status'] || null,
        hardware: { label: '-' } 
    }));

    globalHostnameCache.data = hostnames;
    globalHostnameCache.lastFetch = now;

    try {
        if (!fs.existsSync(path.dirname(CACHE_FILE))) fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(hostnames, null, 2));
    } catch (e) {
        console.warn('[HOSTNAMES] Failed to secure disk cache:', e.message);
    }

    console.log(`[HOSTNAMES] Cache updated with ${hostnames.length} items and saved to disk.`);
    return { hostnames, cached: false };
}
