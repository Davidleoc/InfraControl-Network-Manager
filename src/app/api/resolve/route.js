import { NextResponse } from 'next/server';
import dns from 'dns/promises';

export async function POST(request) {
    try {
        const { hostname } = await request.json();

        if (!hostname) {
            return NextResponse.json({ error: 'Hostname is required' }, { status: 400 });
        }

        try {
            const addresses = await dns.resolve4(hostname);
            return NextResponse.json({ hostname, ip: addresses[0] });
        } catch (err) {
            // Fallback to lookup for broader compatibility
            try {
                const { address } = await dns.lookup(hostname);
                return NextResponse.json({ hostname, ip: address });
            } catch (err2) {
                return NextResponse.json({ error: 'Could not resolve hostname', details: err2.message }, { status: 404 });
            }
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
