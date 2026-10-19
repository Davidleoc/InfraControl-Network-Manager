import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { setHostnameManualStatus, getAllHostnameManualStatuses, getHostnameHistory } from '@/lib/status-store';
import { syncStatusToJira } from '@/lib/jira-sync';
import { fetchHostnames } from '@/lib/hostname-service';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (key) {
            const history = getHostnameHistory(key);
            return NextResponse.json(history);
        }

        const statuses = getAllHostnameManualStatuses();
        return NextResponse.json(statuses);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const token = request.cookies.get(process.env.COOKIE_NAME)?.value;
        if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        const { key, status } = await request.json();

        if (!key || !status) {
            return NextResponse.json({ error: 'Nome de ativo e status são obrigatórios' }, { status: 400 });
        }

        // 1. Sync to Jira with SERVICE ACCOUNT (user AD has no write API permission)
        // Declare hostObj before the try block so it's accessible after
        let hostObj = null;
        try {
            // Mapping application labels to Jira-friendly labels
            let jiraStatus = status;
            if (status === 'Livre') jiraStatus = 'Disponível';

            const JIRA_OBJECT_TYPE_ID = parseInt(process.env.JIRA_HOSTNAME_TYPE_ID || '0');
            const { hostnames } = await fetchHostnames();
            hostObj = hostnames.find(h => h.key === key) || null;

            if (hostObj && hostObj.id) {
                const jiraResult = await syncStatusToJira(hostObj.id, JIRA_OBJECT_TYPE_ID || hostObj.objectTypeId, jiraStatus, payload.username, hostObj.situacaoAttrId || undefined);
                if (!jiraResult.success) {
                    return NextResponse.json({ error: `Falha na sincronização CMDB: ${jiraResult.error}` }, { status: 500 });
                }
            } else {
                console.warn(`[API/HOSTNAME-STATUS] Could not find internal ID for ${key}. Sync skipped.`);
            }
        } catch (syncErr) {
            console.error('[API/HOSTNAME-STATUS] Jira sync exception:', syncErr);
            return NextResponse.json({ error: `Erro de comunicação com CMDB: ${syncErr.message}` }, { status: 500 });
        }

        const hostName = hostObj ? hostObj.name : key;
        const result = setHostnameManualStatus(key, status, payload.name || payload.username, hostName);
        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error('Hostname Status API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
