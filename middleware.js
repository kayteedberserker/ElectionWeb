// middleware.js
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    // 1. Initialize Supabase Client with the ANON KEY (Public Key)
    // NEVER use SUPABASE_SERVICE_ROLE_KEY here.
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                    response = NextResponse.next({
                        request: { headers: request.headers },
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // 2. Fetch the current authenticated user session
    const { data: { user } } = await supabase.auth.getUser();
    const currentUrl = request.nextUrl.pathname;

    // 3. Protection Rule A: If trying to access dashboard without being logged in
    if (currentUrl.startsWith('/dashboard') && !user) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 4. Protection Rule B: Prevent authenticated users from going back to login
    if (currentUrl.startsWith('/login') && user) {
        const role = user.user_metadata?.role || 'candidate';
        return NextResponse.redirect(new URL(`/dashboard/${role === 'lga_supervisor' ? 'lga' : role === 'ward_supervisor' ? 'ward' : 'candidate'}`, request.url));
    }

    // 5. Protection Rule C: Enforce strict cross-role separation
    if (user) {
        const userRole = user.user_metadata?.role;

        if (currentUrl.startsWith('/dashboard/candidate') && userRole !== 'candidate') {
            return NextResponse.redirect(new URL('/login', request.url));
        }
        if (currentUrl.startsWith('/dashboard/lga') && userRole !== 'lga_supervisor') {
            return NextResponse.redirect(new URL('/login', request.url));
        }
        if (currentUrl.startsWith('/dashboard/ward') && userRole !== 'ward_supervisor') {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return response;
}

export const config = {
    matcher: ['/dashboard/:path*', '/login'],
};