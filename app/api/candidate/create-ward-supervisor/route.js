// app/api/supervisor/create-ward-supervisor/route.js
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js'; // Import direct client to bypass cookie context
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const cookieStore = await cookies();

        // 1. Verify client session authorization context using standard SSR client
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
            return NextResponse.json({ error: 'Unauthorized access.' }, { status: 403 });
        }

        // 2. Create a PURE administrative client that has absolutely no awareness of cookies/user tokens
        // This guarantees Postgres sees this request strictly as the 'service_role' system user
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

        // Fetch creator profile using the absolute admin client to ensure visibility
        const { data: creatorProfile, error: profileError } = await adminDbClient
            .from('profiles')
            .select('role, assigned_state, candidate_id, creator_id, id')
            .eq('id', user.id)
            .single();

        if (profileError || !creatorProfile) {
            return NextResponse.json({ error: 'Failed to authenticate supervisor credentials.' }, { status: 403 });
        }

        // Enforce that only an LGA Supervisor can execute this creation route
        if (creatorProfile.role !== 'LGA_SUPERVISOR') {
            return NextResponse.json({ error: 'Access denied: Requires LGA Supervisor credentials.' }, { status: 403 });
        }

        const supervisorState = creatorProfile.assigned_state;
        const lgaSupervisorId = creatorProfile.id;
        const candidateId = creatorProfile.candidate_id || creatorProfile.creator_id;

        const body = await request.json();
        const { email, password, fullName, role, targetUnit } = body;

        // Validation safeguards
        if (!email || !fullName || !role || !targetUnit) {
            return NextResponse.json({ error: 'Missing required registration parameters.' }, { status: 400 });
        }

        if (role !== 'WARD_SUPERVISOR') {
            return NextResponse.json({ error: 'Invalid operation: This endpoint only constructs Ward Supervisors.' }, { status: 400 });
        }

        const cleanEmail = email.toLowerCase().trim();
        let wardSupervisorId = null;
        let isExistingUser = false;
        let wasAuthUserCreatedThisTurn = false;
        let finalWardsArray = [];

        // 3. Fetch or provision account profile records
        const { data: existingProfile } = await adminDbClient
            .from('profiles')
            .select('id, assigned_wards')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (existingProfile) {
            wardSupervisorId = existingProfile.id;
            isExistingUser = true;
            finalWardsArray = existingProfile.assigned_wards || [];
        } else {
            if (!password) {
                return NextResponse.json({ error: 'Password configuration is required for new supervisor registration.' }, { status: 400 });
            }

            // Provision new Supabase Auth account using the pure admin client
            const { data: newAuthUser, error: provisionError } = await adminDbClient.auth.admin.createUser({
                email: cleanEmail,
                password: password,
                email_confirm: true,
                user_metadata: {
                    role: role.toLowerCase(),
                    full_name: fullName,
                    creator_id: lgaSupervisorId
                }
            });

            if (provisionError) {
                console.error("Supabase Auth Provisioning Error:", provisionError);
                return NextResponse.json({ error: provisionError.message }, { status: 500 });
            }

            wardSupervisorId = newAuthUser.user.id;
            wasAuthUserCreatedThisTurn = true;
        }

        // 4. Update localized array parameters for geographical assignment mapping
        if (!finalWardsArray.includes(targetUnit)) {
            finalWardsArray.push(targetUnit);
        }

        // 5. Build operational assignment record profile payload mapped exactly to your columns
        const profilePayload = {
            id: wardSupervisorId,
            full_name: fullName,
            role: 'WARD_SUPERVISOR',
            assigned_state: supervisorState,
            assigned_lgas: [],
            assigned_wards: finalWardsArray,
            creator_id: lgaSupervisorId,
            candidate_id: candidateId,
            lga_supervisor_id: lgaSupervisorId,
            ward_supervisor_id: null,
            email: cleanEmail,
            status: 'ACTIVE',
            assigned_pus: []
        };

        // 6. Write record updates using pure adminDbClient
        // This completely forces PostgreSQL to match your "Allow service_role full management" policy!
        const { error: dbError } = await adminDbClient
            .from('profiles')
            .upsert(profilePayload, { onConflict: 'id' });

        if (dbError) {
            console.error("Database Profile Synchronization Failure:", dbError);

            // AUTOMATIC ROLLBACK MECHANISM
            if (wasAuthUserCreatedThisTurn && wardSupervisorId) {
                console.warn(`[ROLLBACK] Removing unlinked authentication account (ID: ${wardSupervisorId}) due to profile saving error.`);
                try {
                    await adminDbClient.auth.admin.deleteUser(wardSupervisorId);
                    console.log(`[ROLLBACK SUCCESSFUL] Authentication entry ${wardSupervisorId} successfully deleted.`);
                } catch (rollbackError) {
                    console.error("[CRITICAL] Rollback sequence failed to clear user auth configuration:", rollbackError);
                }
            }

            return NextResponse.json({ error: `Database sync error: ${dbError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            isExistingUser,
            message: isExistingUser
                ? `Supervisor operational scope updated successfully for ward: ${targetUnit}`
                : `Ward supervisor profile created and assigned to ward: ${targetUnit}`,
            supervisorId: wardSupervisorId
        });

    } catch (error) {
        console.error("Ward Supervisor Creation Endpoint Crash Failure:", error);
        return NextResponse.json({ error: 'Internal server processing error' }, { status: 500 });
    }
}