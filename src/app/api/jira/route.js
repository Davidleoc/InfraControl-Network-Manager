import { NextResponse } from 'next/server';
import { fetchVlans } from '@/lib/jira-service';
import { initAutoScan } from '@/lib/auto-scan';

// Iniciar o worker de varredura se ainda não estiver rodando
initAutoScan();

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    try {
        const result = await fetchVlans(force);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Batch Fetch Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
