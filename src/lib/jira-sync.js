/**
 * Utility to synchronize status changes to Jira CMDB (Insight).
 * Uses service account token for API write permission. User identity is preserved locally.
 */
export async function syncStatusToJira(objectId, objectTypeId, status, username, attributeId = parseInt(process.env.JIRA_STATUS_ATTR_ID || '0')) {
    const JIRA_URL = process.env.JIRA_URL;
    const JIRA_TOKEN = process.env.JIRA_TOKEN;

    if (!JIRA_URL || !JIRA_TOKEN) {
        console.error('[JIRA-SYNC] JIRA_URL or JIRA_TOKEN not configured');
        return { success: false, error: 'Configuração do Jira ausente' };
    }

    if (!attributeId) {
        console.error('[JIRA-SYNC] Status attribute ID not found (set JIRA_STATUS_ATTR_ID)');
        return { success: false, error: 'ID do atributo de status do Jira não configurado' };
    }

    try {
        console.log(`[JIRA-SYNC] Syncing object ID ${objectId} (type ${objectTypeId}) to status "${status}" (attr ${attributeId}) on behalf of ${username}`);

        // Status IDs of the CMDB schema (status attribute of "Status" type requires IDs, not labels).
        // Configure via env; if not set, the label itself is sent.
        const available = process.env.JIRA_STATUS_ID_AVAILABLE;
        const reserved = process.env.JIRA_STATUS_ID_RESERVED;
        const inUse = process.env.JIRA_STATUS_ID_IN_USE;
        const STATUS_MAPPING = {
            'Disponível': available,
            'Livre': available,
            'Reservado': reserved,
            'Em uso': inUse,
            'Em Uso': inUse
        };

        let finalValue = status;
        if (STATUS_MAPPING[status]) {
            finalValue = STATUS_MAPPING[status].toString();
            console.log(`[JIRA-SYNC] Mapped status "${status}" to ID "${finalValue}" for attribute ${attributeId}`);
        }

        // Use service account token - AD users may not have REST write permission on Insight
        const authHeader = `Bearer ${JIRA_TOKEN}`;

        const url = `${JIRA_URL}/rest/insight/1.0/object/${objectId}`;

        const payload = {
            objectTypeId: objectTypeId,
            attributes: [
                {
                    objectTypeAttributeId: attributeId,
                    objectAttributeValues: [
                        { value: finalValue }
                    ]
                }
            ]
        };

        console.log(`[JIRA-SYNC] PUT ${url} | payload:`, JSON.stringify(payload));

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorMsg = await response.text();
            console.error(`[JIRA-SYNC] Jira update failed for ID ${objectId}: ${response.status}`, errorMsg);
            return { success: false, error: `Erro Jira (${response.status}): ${errorMsg}` };
        }

        console.log(`[JIRA-SYNC] Successfully updated object ${objectId} in Jira.`);
        return { success: true };
    } catch (error) {
        console.error('[JIRA-SYNC] Exception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Finds a Jira Insight object by its IP Address attribute using the service account.
 */
export async function findObjectByIp(ip) {
    const JIRA_URL = process.env.JIRA_URL;
    const JIRA_TOKEN = process.env.JIRA_TOKEN;
    const ATTRIBUTE_NAME_IP = process.env.JIRA_IP_ATTRIBUTE_NAME || 'Endereço IP';

    if (!JIRA_URL || !JIRA_TOKEN) return null;

    try {
        const authHeader = `Bearer ${JIRA_TOKEN}`;
        const iql = `"${ATTRIBUTE_NAME_IP}" = "${ip}"`;
        const url = `${JIRA_URL}/rest/insight/1.0/iql/objects?iql=${encodeURIComponent(iql)}&resultPerPage=1`;

        const response = await fetch(url, {
            headers: { 'Authorization': authHeader }
        });

        if (!response.ok) return null;

        const data = await response.json();
        const object = data.objectEntries?.[0];

        if (!object) return null;

        // Find the 'Situação' attribute ID in the returned object
        const situacaoAttr = object.attributes?.find(a =>
            (a.objectTypeAttribute?.name || a.objectTypeAttributeName || '').toLowerCase().includes('situação')
        );

        return {
            id: object.id,
            key: object.objectKey,
            name: object.label,
            objectTypeId: object.objectType?.id || null,
            situacaoAttrId: situacaoAttr?.objectTypeAttributeId || parseInt(process.env.JIRA_STATUS_ATTR_ID || '0')
        };
    } catch (error) {
        console.error('[JIRA-SYNC] findObjectByIp Error:', error);
        return null;
    }
}
