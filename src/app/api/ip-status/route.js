import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { setManualStatus, getAllManualStatuses, getIpHistory } from '@/lib/status-store';
import { syncStatusToJira, findObjectByIp } from '@/lib/jira-sync';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const ip = searchParams.get('ip');

        if (ip) {
            const history = getIpHistory(ip);
            return NextResponse.json(history);
        }

        const statuses = getAllManualStatuses();
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

        const { ip, status } = await request.json();

        if (!ip || !status) {
            return NextResponse.json({ error: 'IP e status são obrigatórios' }, { status: 400 });
        }

        // Jira sync removed for IPs as requested. Only local status is maintained.

        const result = setManualStatus(ip, status, payload.name || payload.username);
        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error('IP Status API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
