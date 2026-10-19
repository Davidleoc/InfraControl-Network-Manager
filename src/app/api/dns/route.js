import { NextResponse } from 'next/server';
import dns from 'dns/promises';

export async function POST(request) {
    try {
        const { ips } = await request.json();

        if (!ips || !Array.isArray(ips)) {
            return NextResponse.json({ error: 'Invalid IPs list' }, { status: 400 });
        }

        const results = await Promise.all(ips.map(async (ip) => {
            try {
                const hostnames = await dns.reverse(ip);
                return { ip, dns: hostnames[0] || '-' };
            } catch (err) {
                return { ip, dns: '-' };
            }
        }));

        return NextResponse.json(results);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
