import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request) {
    const token = request.cookies.get(process.env.COOKIE_NAME)?.value;
    const { pathname } = request.nextUrl;

    // Allow internal auth API requests
    if (pathname.startsWith('/api/auth')) {
        return NextResponse.next();
    }

    // Handle access to the login page
    if (pathname === '/login') {
        if (token) {
            try {
                const secret = new TextEncoder().encode(process.env.JWT_SECRET);
                await jwtVerify(token, secret);
                // Token is valid, redirect to main page without showing login
                return NextResponse.redirect(new URL('/', request.url));
            } catch (error) {
                // Invalid or expired token: allow them to see the login screen
                return NextResponse.next();
            }
        }
        // No token: allow them to see the login screen
        return NextResponse.next();
    }

    // For all other routes (protected area)
    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        await jwtVerify(token, secret);
        return NextResponse.next();
    } catch (error) {
        // Token invalid: redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - icon.png (custom icon)
         */
        '/((?!_next/static|_next/image|favicon.ico|icon.png).*)',
    ],
};
