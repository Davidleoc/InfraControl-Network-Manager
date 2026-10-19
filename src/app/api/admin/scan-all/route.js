import { NextResponse } from 'next/server';
import { runAutoScan } from '@/lib/auto-scan';

export async function POST(request) {
    try {
        console.log('[API/ADMIN/SCAN-ALL] Recebida solicitação de varredura global...');
        // Dispara a varredura em segundo plano sem esperar a conclusão
        runAutoScan().catch(err => console.error('[API/ADMIN/SCAN-ALL] Erro na varredura:', err));

        return NextResponse.json({
            message: 'Varredura global iniciada em segundo plano.',
            status: 'started'
        });
    } catch (error) {
        console.error('[API/ADMIN/SCAN-ALL] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
