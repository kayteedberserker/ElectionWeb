// app/api/auth/agent-login/route.js
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const { accessToken, phoneNumber } = body;

        if (!accessToken) {
            return NextResponse.json({ error: 'ACCESS TOKEN IS REQUIRED FOR AGENT VERIFICATION.' }, { status: 400 });
        }

        // Initialize administrative client to query profiles safely
        const adminDbClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        // Build precise match criteria against your profiles table columns
        let query = adminDbClient
            .from('profiles')
            .select('id, full_name, phone, access_token, role, assigned_state, assigned_wards, assigned_pus, status')
            .eq('access_token', accessToken)
            .eq('status', 'ACTIVE');

        if (phoneNumber) {
            query = query.eq('phone', phoneNumber);
        }

        const { data: profile, error: profileError } = await query.maybeSingle();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'INVALID CREDENTIALS OR INACTIVE AGENT TARGET SECTOR.' }, { status: 401 });
        }

        // Return the exact profile details. 
        // The profile's own access_token is saved locally as the session key.
        return NextResponse.json({
            success: true,
            token: profile.access_token,
            profile: {
                id: profile.id,
                fullName: profile.full_name,
                phone: profile.phone,
                role: profile.role,
                assignedState: profile.assigned_state,
                assignedWards: profile.assigned_wards,
                assignedPus: profile.assigned_pus
            }
        }, { status: 200 });

    } catch (error) {
        console.error('SERVER AUTHENTICATION ERROR:', error);
        return NextResponse.json({ error: 'INTERNAL SERVER AGENT LOGIN EXCEPTION.' }, { status: 500 });
    }
}