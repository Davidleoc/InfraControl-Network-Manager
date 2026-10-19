import { NextResponse } from 'next/server';
import { authenticateLDAP } from '@/lib/ldap';
import { SignJWT } from 'jose';

export async function POST(request) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 });
        }

        const userData = await authenticateLDAP(username, password);

        if (!userData) {
            return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
        }

        // Create JWT
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const token = await new SignJWT(userData)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);

        const response = NextResponse.json({ success: true, user: userData });

        // Set Cookie
        response.cookies.set(process.env.COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        return response;
    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json({ error: 'Erro interno ao realizar login' }, { status: 500 });
    }
}
