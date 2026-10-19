const globalVlanCache = global._vlanCache || {
    data: null,
    lastFetch: 0,
    TTL: 1000 * 60 * 30, // 30 minutes
};
if (!global._vlanCache) global._vlanCache = globalVlanCache;

// Opcional: aceitar certificados autoassinados (ex.: Jira interno com CA própria)
if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function fetchVlans(force = false) {
    const now = Date.now();

    if (!force && globalVlanCache.data && (now - globalVlanCache.lastFetch < globalVlanCache.TTL)) {
        return { vlans: globalVlanCache.data, cached: true };
    }

    const JIRA_URL = process.env.JIRA_URL;
    const JIRA_TOKEN = process.env.JIRA_TOKEN;
    const VLAN_TYPE = process.env.JIRA_VLAN_TYPE || 'VLAN';
    const IQL = `objectType = "${VLAN_TYPE}"`;

    const headers = {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Node.js/Gerenciador-IPs',
    };

    const vlanUrl = `${JIRA_URL}/rest/insight/1.0/iql/objects?iql=${encodeURIComponent(IQL)}&resultPerPage=1000`;
    console.log(`[JIRA] Fetching VLANs from: ${vlanUrl}`);
    
    let vlanData;
    try {
        const vlanResponse = await fetch(vlanUrl, { headers, cache: 'no-store' });
        if (!vlanResponse.ok) {
            const errorText = await vlanResponse.text();
            throw new Error(`Jira returned ${vlanResponse.status}: ${errorText.substring(0, 100)}`);
        }
        vlanData = await vlanResponse.json();
    } catch (err) {
        console.error(`[JIRA] VLAN Fetch Error: ${err.message}`);
        throw err;
    }

    const entries = vlanData.objectEntries || [];
    console.log(`[JIRA] Found ${entries.length} VLAN entries.`);

    const allFullObjects = [];
    const batchSize = 50;
    const workList = entries.slice(0, 500); // Limiting to 500 VLANs for performance

    for (let i = 0; i < workList.length; i += batchSize) {
        const batch = workList.slice(i, i + batchSize);
        const details = await Promise.all(batch.map(async (e) => {
            try {
                const res = await fetch(`${JIRA_URL}/rest/insight/1.0/object/${e.id}`, { headers });
                return res.ok ? await res.json() : null;
            } catch (err) {
                console.error(`[JIRA] Failed to fetch VLAN object ${e.id}:`, err.message);
                return null;
            }
        }));
        allFullObjects.push(...details.filter(d => d !== null));
        // Small delay to prevent network exhaustion
        await new Promise(r => setTimeout(r, 200));
    }

    const getAttrFull = (entry, searchTerms) => {
        if (!entry.attributes) return '-';
        const terms = Array.isArray(searchTerms) ? searchTerms : [searchTerms];
        const attr = entry.attributes.find(a => {
            const name = (a.objectTypeAttribute?.name || a.objectTypeAttributeName || '').toLowerCase();
            return terms.some(t => name.includes(t.toLowerCase().trim()));
        });
        return attr?.objectAttributeValues?.[0]?.displayValue || attr?.objectAttributeValues?.[0]?.value || '-';
    };

    const vlans = allFullObjects.map(entry => ({
        id: entry.id,
        name: entry.label,
        range: getAttrFull(entry, 'Identificador'),
        securityZone: getAttrFull(entry, ['Zona', 'Segurança', 'Seguranca']),
        gateway: getAttrFull(entry, 'Gateway'),
        initialIp: getAttrFull(entry, ['IP inicial', 'Inicial']),
        finalIp: getAttrFull(entry, ['IP final', 'Final']),
        description: getAttrFull(entry, ['Descrição', 'Descricao', 'Description']),
        key: entry.objectKey
    }));

    globalVlanCache.data = vlans;
    globalVlanCache.lastFetch = now;

    console.log(`[JIRA] VLAN cache updated with ${vlans.length} records.`);
    return { vlans, cached: false };
}
