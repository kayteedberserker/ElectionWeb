'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers'; // Added headers here

// Helper function to initialize the Supabase client inside Server Actions
async function getSupabaseClient() {
    const cookieStore = await cookies();

    return createServerClient(
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
                        // The `setAll` method can be ignored if the execution context
                        // is a Server Action that performs a redirect later.
                    }
                },
            },
        }
    );
}

/**
 * Handles secure user authentication
 */
export async function signIn(email, password) {
    try {
        const supabase = await getSupabaseClient();

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { success: false, message: error.message };
        }

        const role = data.user?.user_metadata?.role || 'candidate';
        let redirectPath = '/dashboard/candidate';

        if (role === 'lga_supervisor') redirectPath = '/dashboard/lga';
        if (role === 'ward_supervisor') redirectPath = '/dashboard/ward';

        return { success: true, redirectPath };
    } catch (err) {
        return { success: false, message: 'An unexpected connection error occurred.' };
    }
}

/**
 * Handles public self-registration for Candidates only
 */
export async function signUpCandidate({ email, password, fullName, contestedSeat }) {
    try {
        const supabase = await getSupabaseClient();

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    role: 'candidate',
                    full_name: fullName,
                    contested_seat: contestedSeat,
                },
            },
        });

        if (error) {
            return { success: false, message: error.message };
        }

        if (data.session === null) {
            return {
                success: true,
                requiresConfirmation: true,
                message: 'Registration successful! Please check your email inbox to confirm your account.'
            };
        }

        return { success: true, redirectPath: '/dashboard/candidate/profile' };
    } catch (err) {
        return { success: false, message: 'An error occurred during account creation.' };
    }
}

/**
 * Initiates a password reset flow
 */
export async function resetPassword(email) {
    try {
        const supabase = await getSupabaseClient();

        // Await the headers() function
        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
        });

        if (error) {
            return { success: false, message: error.message };
        }

        return { success: true };
    } catch (err) {
        return { success: false, message: 'An error occurred while trying to send the reset link.' };
    }
}

/**
 * Resends a sign-up confirmation link
 */
export async function resendConfirmationEmail(email) {
    try {
        const supabase = await getSupabaseClient();

        // Await the headers() function
        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: `${origin}/auth/callback`,
            },
        });

        if (error) {
            return { success: false, message: error.message };
        }

        return { success: true };
    } catch (err) {
        return { success: false, message: 'An error occurred while trying to resend the confirmation email.' };
    }
}