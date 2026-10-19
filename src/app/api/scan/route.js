import { NextResponse } from 'next/server';
import { performScan, getMultiCachedScans } from '@/lib/scanner';

export async function POST(request) {
    try {
        const { ip, ips, force } = await request.json();
        
        if (ips && Array.isArray(ips)) {
            // Batch scan
            const results = {};
            // Limit concurrency naturally or via Promise.all
            // Since scanner.js has its own MAX_CONCURRENT_PINGS, we can just map
            await Promise.all(ips.map(async (targetIp) => {
                try {
                    results[targetIp] = await performScan(targetIp, force);
                } catch (e) {
                    results[targetIp] = { error: e.message, status: 'Error' };
                }
            }));
            return NextResponse.json(results);
        }

        if (!ip) return NextResponse.json({ error: 'IP is required' }, { status: 400 });

        const result = await performScan(ip, force);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: error.message === 'Server busy' ? 503 : 500 });
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const ips = searchParams.get('ips')?.split(',') || [];
    const results = getMultiCachedScans(ips);
    return NextResponse.json(results);
}
