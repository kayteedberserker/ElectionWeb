// app/api/candidate/create-supervisor/route.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY, // Bypass normal RLS boundaries for secure structural provisioning
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                },
            }
        );

        // 1. Verify client session authorization context
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized infrastructure access' }, { status: 403 });
        }

        const candidateRole = user.user_metadata?.role || '';
        if (candidateRole !== 'candidate') {
            return NextResponse.json({ error: 'Access denied: Requires candidate clearance level' }, { status: 403 });
        }

        const candidateState = user.user_metadata?.assigned_state;
        const candidateId = user.id; // The logged-in candidate is the ultimate parent root node

        const body = await request.json();
        const { email, password, fullName, role, targetUnit } = body;

        if (!email || !fullName || !role || !targetUnit) {
            return NextResponse.json({ error: 'Missing mandatory registration variables' }, { status: 400 });
        }

        const cleanEmail = email.toLowerCase().trim();
        let supervisorId = null;
        let isExistingUser = false;
        let wasAuthUserCreatedThisTurn = false; // Transaction tracking state for rollback execution
        let finalLgasArray = [];
        let finalWardsArray = [];
        let assignedLgaSupervisorId = null;

        // 2. Hierarchical Dependency Lookup:
        // If we are creating a WARD_SUPERVISOR, let's find the LGA_SUPERVISOR who owns the LGA this ward belongs to
        if (role === 'WARD_SUPERVISOR') {
            let matchedLgaContainer = "";
            try {
                const locRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/locations?state=${encodeURIComponent(candidateState)}`);
                if (locRes.ok) {
                    const locData = await locRes.json();
                    // Scan the structure to see which LGA lists this ward name inside its array
                    const foundLgaMatch = (locData.lgas || []).find(lga =>
                        (lga.wards || []).some(w => w.name?.toUpperCase() === targetUnit.toUpperCase())
                    );
                    if (foundLgaMatch) {
                        matchedLgaContainer = foundLgaMatch.name;
                    }
                }
            } catch (err) {
                console.error("Non-blocking error resolving ward's parent LGA boundaries:", err);
            }

            // If we successfully traced the parent LGA container, look up the LGA Supervisor profile assigned to it under this candidate
            if (matchedLgaContainer) {
                const { data: matchedLgaSup } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('candidate_id', candidateId)
                    .eq('role', 'LGA_SUPERVISOR')
                    .contains('assigned_lgas', [matchedLgaContainer])
                    .maybeSingle();

                if (matchedLgaSup) {
                    assignedLgaSupervisorId = matchedLgaSup.id;
                }
            }
        }

        // 3. Fetch or provision account infrastructure records
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, assigned_lgas, assigned_wards, lga_supervisor_id')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (existingProfile) {
            supervisorId = existingProfile.id;
            isExistingUser = true;
            finalLgasArray = existingProfile.assigned_lgas || [];
            finalWardsArray = existingProfile.assigned_wards || [];
            // Preserve an existing supervisor connection if already established, otherwise link newly found parent
            assignedLgaSupervisorId = existingProfile.lga_supervisor_id || assignedLgaSupervisorId;
        } else {
            if (!password) {
                return NextResponse.json({ error: 'Password configuration is mandatory for deployment of new nodes.' }, { status: 400 });
            }

            // Provision new Supabase Auth entity node
            const { data: newAuthUser, error: provisionError } = await supabase.auth.admin.createUser({
                email: cleanEmail,
                password: password,
                email_confirm: true,
                user_metadata: {
                    role: role.toLowerCase(),
                    full_name: fullName,
                    creator_id: candidateId
                }
            });

            if (provisionError) {
                console.error("Supabase Auth Provisioning System Error:", provisionError);
                return NextResponse.json({ error: provisionError.message }, { status: 500 });
            }

            supervisorId = newAuthUser.user.id;
            wasAuthUserCreatedThisTurn = true; // Flagged active for downstream error cleanup
        }

        // 4. Update the localized array parameters for assigned geographical areas
        if (role === 'WARD_SUPERVISOR') {
            if (!finalWardsArray.includes(targetUnit)) {
                finalWardsArray.push(targetUnit);
            }
        } else {
            if (!finalLgasArray.includes(targetUnit)) {
                finalLgasArray.push(targetUnit);
            }
        }

        // 5. Build dynamic architectural record assignment payload 
        const profilePayload = {
            id: supervisorId,
            email: cleanEmail,
            full_name: fullName,
            role: role,
            assigned_state: candidateState,
            assigned_lgas: finalLgasArray,
            assigned_wards: finalWardsArray,
            creator_id: candidateId,      // Legacy support column 
            candidate_id: candidateId,    // Core top-level root candidate tie-in
            status: 'ACTIVE'
        };

        if (assignedLgaSupervisorId) {
            profilePayload.lga_supervisor_id = assignedLgaSupervisorId;
        }

        // 6. Write record map updates straight to your data tier using upsert
        const { error: dbError } = await supabase
            .from('profiles')
            .upsert(profilePayload, { onConflict: 'id' });

        if (dbError) {
            console.error("Public Database Profiles Hierarchy Sync Failure:", dbError);

            // AUTO-ROLLBACK MECHANISM DETECTED
            // If the database write fails and we just minted a brand new user record in step 3, erase it instantly
            if (wasAuthUserCreatedThisTurn && supervisorId) {
                console.warn(`[ROLLBACK TRIGGERED] Removing dangling authentication identity node (ID: ${supervisorId}) due to database save error.`);
                try {
                    await supabase.auth.admin.deleteUser(supervisorId);
                    console.log(`[ROLLBACK SUCCESSFUL] Dangling auth node ${supervisorId} successfully deleted.`);
                } catch (rollbackError) {
                    console.error("[CRITICAL] Rollback sequence failed to clear user auth node:", rollbackError);
                }
            }

            return NextResponse.json({ error: `Relational sync database error: ${dbError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            isExistingUser,
            message: isExistingUser
                ? `Supervisor scope matrix updated with relational lineage context for: ${targetUnit}`
                : `Supervisor profile created and tied perfectly to candidate tree lineage for ${targetUnit}`,
            supervisorId: supervisorId
        });

    } catch (error) {
        console.error("Agent Hierarchy Creator Endpoint Crash Failure:", error);
        return NextResponse.json({ error: 'Internal server network processing failure' }, { status: 500 });
    }
}