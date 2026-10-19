import { NextResponse } from 'next/server';
import { fetchHostnames } from '@/lib/hostname-service';
import { syncManualHostnamesWithReality } from '@/lib/auto-scan-utils';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    try {
        const result = await fetchHostnames(force);

        if (force) {
            try {
                // Sincronização resiliente: não deve falhar o GET principal
                await syncManualHostnamesWithReality(result.hostnames);
            } catch (err) {
                console.error('[API/HOSTNAMES] Sincronização falhou (não bloqueante):', err);
            }
        }
        return NextResponse.json(result);
    } catch (error) {
        const fs = require('fs');
        fs.writeFileSync('debug_api.txt', error.stack || error.message);
        console.error('[API/HOSTNAMES] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
