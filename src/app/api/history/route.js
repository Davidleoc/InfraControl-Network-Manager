import { NextResponse } from 'next/server';
const { getHistory } = require('@/lib/history-store');
const { verify } = require('jose');
const { cookies } = require('next/headers');

export async function GET(request) {
    try {
        // Verificar autenticação básico (opcional, dependendo de como você quer proteger)
        // const cookieStore = cookies();
        // const token = cookieStore.get('infracontrol_auth_token')?.value;
        // if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'todos';
        const status = searchParams.get('status') || 'todos';
        const timeRange = searchParams.get('timeRange') || 'all';
        const limit = parseInt(searchParams.get('limit') || '100');

        const history = await getHistory({ limit, type, status, timeRange });

        return NextResponse.json(history);
    } catch (error) {
        console.error('Erro na API de Histórico:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
