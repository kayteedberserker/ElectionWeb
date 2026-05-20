import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request) {
    try {
        const cookieStore = await cookies();

        // 1. Verify creator session authorization context safely using standard SSR client
        const userClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'UNAUTHORIZED ACCESS: VALID SESSION REQUIRED.' }, { status: 403 });
        }

        // 2. Create an administrative client to bypass RLS restrictions safely
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

        // Fetch the creator's tracking metadata to cascade structural alignment parameters
        const { data: creatorProfile, error: profileError } = await adminDbClient
            .from('profiles')
            .select('role, assigned_state, candidate_id, creator_id, id')
            .eq('id', user.id)
            .single();

        if (profileError || !creatorProfile) {
            return NextResponse.json({ error: 'FAILED TO AUTHENTICATE OPERATIONAL SUPERVISOR PROFILE.' }, { status: 403 });
        }

        const body = await request.json();
        const {
            fullName,
            phoneNumber,
            accessToken,
            role,
            assignedState,
            assignedWards,
            assignedPUs,
            useExistingAgent
        } = body;

        // Validation guards
        if (!accessToken || !assignedPUs || assignedPUs.length === 0) {
            return NextResponse.json(
                { error: 'MISSING REQUIRED TERMINAL OPERATIONAL PARAMETERS.' },
                { status: 400 }
            );
        }

        // Derive structural reporting layout dynamically based on creator role profile context
        const currentCreatorId = creatorProfile.id;
        const DerivedCandidateId = creatorProfile.candidate_id || creatorProfile.creator_id || null;

        // Correctly distribute reporting bindings depending on whether an LGA or WARD controller is deploying the agent
        const wardSupervisorId = creatorProfile.role === 'WARD_SUPERVISOR' ? currentCreatorId : null;
        const lgaSupervisorId = creatorProfile.role === 'LGA_SUPERVISOR' ? currentCreatorId : (creatorProfile.creator_id || null);

        // 3. Logic Stream: Handle Existing Agent Profile updates
        if (useExistingAgent) {
            const { data: currentProfile, error: fetchError } = await adminDbClient
                .from('profiles')
                .select('assigned_pus, assigned_wards')
                .eq('access_token', accessToken)
                .single();

            if (fetchError || !currentProfile) {
                return NextResponse.json(
                    { error: 'EXISTING AGENT RECORD MATCHING THIS TOKEN WAS NOT FOUND.' },
                    { status: 404 }
                );
            }

            // Keep array layouts completely flat, unified and unique
            const baselinePUs = Array.isArray(currentProfile.assigned_pus) ? currentProfile.assigned_pus : [];
            const updatedPUs = Array.from(new Set([...baselinePUs, ...assignedPUs]));

            const baselineWards = Array.isArray(currentProfile.assigned_wards) ? currentProfile.assigned_wards : [];
            const updatedWards = Array.from(new Set([...baselineWards, ...(assignedWards || [])]));

            const { error: updateError } = await adminDbClient
                .from('profiles')
                .update({
                    assigned_wards: updatedWards,
                    assigned_pus: updatedPUs,
                    status: 'ACTIVE'
                })
                .eq('access_token', accessToken);

            if (updateError) throw updateError;

            return NextResponse.json({
                success: true,
                isExistingUser: true,
                message: 'EXTENDED POLLING UNIT BINDINGS ASSIGNED SUCCESSFULLY TO OPERATOR.'
            });
        }

        // 4. Logic Stream: Provision a Brand New Passwordless Token Profile
        const { data: conflictCheck } = await adminDbClient
            .from('profiles')
            .select('id')
            .or(`access_token.eq.${accessToken},phone.eq.${phoneNumber}`)
            .maybeSingle();

        if (conflictCheck) {
            return NextResponse.json(
                { error: 'CONFLICT DETECTED: PHONE NUMBER OR ACCESS TOKEN IS ALREADY REGISTERED.' },
                { status: 409 }
            );
        }

        // Generate clean structural UUID key for passwordless profile allocation
        const generatedProfileUuid = crypto.randomUUID();

        // Direct database injection mapping exactly to system schema definitions
        const { error: insertError } = await adminDbClient
            .from('profiles')
            .insert([{
                id: generatedProfileUuid,
                full_name: fullName,
                phone: phoneNumber, // Synchronized cleanly with database column and schema definition
                access_token: accessToken,
                role: role || 'POLLING_UNIT_AGENT',
                assigned_state: assignedState || creatorProfile.assigned_state || 'OSUN',
                assigned_lgas: [],
                assigned_wards: assignedWards || [],
                assigned_pus: assignedPUs,

                // Cascade Reporting Matrix Hierarchy Parameters
                creator_id: currentCreatorId,
                candidate_id: DerivedCandidateId,
                lga_supervisor_id: lgaSupervisorId,
                ward_supervisor_id: wardSupervisorId,

                status: 'ACTIVE',
                created_at: new Date().toISOString()
            }]);

        if (insertError) throw insertError;

        return NextResponse.json({
            success: true,
            isExistingUser: false,
            message: 'FIELD AGENT PROFILE MATRIX DEPLOYED SUCCESSFULLY WITH RECOGNIZED CREDENTIALS.'
        });

    } catch (error) {
        console.error('CRITICAL FIELD AGENT PROVISIONING ERROR:', error);
        return NextResponse.json(
            { error: error.message || 'INTERNAL ROUTE RUNTIME PROCESSING EXCEPTION.' },
            { status: 500 }
        );
    }
}