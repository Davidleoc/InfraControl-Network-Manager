import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        appName: process.env.NEXT_PUBLIC_APP_NAME || 'Gerenciador de IPs e DNS',
        appSubtitle: process.env.NEXT_PUBLIC_APP_SUBTITLE || 'Gestão Integrada de IPs, DNS e Inventário CMDB',
        companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Minha Empresa'
    });
}
