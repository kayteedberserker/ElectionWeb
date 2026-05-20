// app/api/auth/update-profile/route.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const cookieStore = await cookies();

        // Initialize the standard Supabase server client
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY, // Service role bypasses user RLS restrictions to modify internal properties
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
                            // Suppress mutations if called during dynamic response redirect sequences
                        }
                    },
                },
            }
        );

        // Extract the target authentication user session token context
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Session unauthorized or missing' }, { status: 401 });
        }

        // Parse incoming candidate configuration properties
        const body = await request.json();
        const {
            fullName,
            contestedSeat,
            selectedState,
            selectedDistrict,
            selectedConstituency,
            selectedLga,
            selectedWard
        } = body;

        // Formulate clean, centralized metadata payloads based on election tier parameters
        const updatedMetadata = {
            ...user.user_metadata,
            full_name: fullName,
            contested_seat: contestedSeat,
            // Prune unneeded subordinate properties dynamically to keep tokens optimized
            assigned_state: contestedSeat !== 'president' ? selectedState : null,
            assigned_district: contestedSeat === 'senate' ? selectedDistrict : null,
            assigned_constituency: contestedSeat === 'house_of_rep' ? selectedConstituency : null,
            assigned_lga: ['chairman', 'councilor'].includes(contestedSeat) ? selectedLga : null,
            assigned_ward: contestedSeat === 'councilor' ? selectedWard : null,
        };

        // Write the consolidated updates directly to the Supabase User Authentication record
        const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
            user.id,
            { user_metadata: updatedMetadata }
        );

        if (updateError) {
            console.error("Supabase Metadata Update Error:", updateError);
            return NextResponse.json({ error: 'Failed to write metadata changes to identity record' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'User authentication matrix updated cleanly',
            user: updatedUser.user
        });

    } catch (error) {
        console.error("Profile Endpoint Crash Error:", error);
        return NextResponse.json({ error: 'Internal runtime server processing failure' }, { status: 500 });
    }
}