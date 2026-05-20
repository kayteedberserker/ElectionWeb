// app/auth/signout/route.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const cookieStore = await cookies();

        // Initialize Supabase SSR client to manage cookie states
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Suppress errors if mutated during a redirect phase
                        }
                    },
                },
            }
        );

        // Check if a session actively exists before attempting destruction
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            // Terminate authentication session globally on Supabase servers
            await supabase.auth.signOut();
        }

        // Generate a clear absolute routing URL pointing directly to your login page
        const loginUrl = new URL('/login', request.url);

        // Return a fresh response, forcing the browser to clear layout states
        return NextResponse.redirect(loginUrl, { status: 303 });
    } catch (error) {
        // Fallback error containment logic to prevent breaking operational pipelines
        return NextResponse.redirect(new URL('/login?error=signout_failure', request.url), { status: 303 });
    }
}