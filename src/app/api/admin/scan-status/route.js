import { NextResponse } from 'next/server';
import { getLastScanInfo } from '@/lib/auto-scan';

export async function GET() {
    const info = getLastScanInfo();
    return NextResponse.json(info || { status: 'No scan yet' });
}
