import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.delete(process.env.COOKIE_NAME);
    return response;
}
