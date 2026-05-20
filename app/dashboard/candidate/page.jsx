import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';

// Server-side authentication, authorization, and Supabase client initialization
async function getAuthenticatedSession() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
            },
        }
    );

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/login');
    }

    // Security Authorization Check
    const role = user.user_metadata?.role || 'candidate';
    if (role !== 'candidate') {
        if (role === 'lga_supervisor') redirect('/dashboard/lga');
        if (role === 'ward_supervisor') redirect('/dashboard/ward');
        redirect('/login?error=unauthorized');
    }

    return { user, supabase };
}

export default async function CandidateDashboardPage() {
    const { user, supabase } = await getAuthenticatedSession();

    // Extract administrative metadata populated during candidate onboarding
    const fullName = user.user_metadata?.full_name || 'Hon. Candidate';
    const contestedSeat = user.user_metadata?.contesting_seat || '';
    const assignedState = user.user_metadata?.assigned_state || '';
    const assignedLga = user.user_metadata?.assigned_lga || '';
    const assignedWard = user.user_metadata?.assigned_ward || '';

    const senatorialDistrict = user.user_metadata?.senatorial_district || '';
    const federalConstituency = user.user_metadata?.federal_constituency || '';
    const stateConstituency = user.user_metadata?.state_constituency || '';

    // Define strict baseline scope to prevent query execution errors
    const safeState = assignedState || '';

    // Base query assignments tracking active profiles scoped to this candidate id
    // FIXED: We drop direct structural seat filtering on staff. Instead, we scope them strictly to the candidate's team footprint
    let supervisorsQuery = supabase.from('profiles').select('id, assigned_lgas', { count: 'exact' }).eq('role', 'LGA_SUPERVISOR').eq('candidate_id', user.id);
    let coordinatorsQuery = supabase.from('profiles').select('id, assigned_wards', { count: 'exact' }).eq('role', 'WARD_SUPERVISOR').eq('candidate_id', user.id);
    let agentsQuery = supabase.from('profiles').select('id, assigned_pus', { count: 'exact' }).eq('role', 'POLLING_UNIT_AGENT').eq('candidate_id', user.id);

    let performanceMetricsQuery = supabase.from('lga_performance_metrics').select('lga_name, supervisor_status, total_wards, assigned_wards, total_pus, assigned_pus').eq('state_name', safeState);
    let logsQuery = supabase.from('deployment_activity_logs').select('id, event_type, description, created_at').eq('state_name', safeState);

    // Contextual structural routing based on geographical footprints instead of staff meta seats
    if (contestedSeat === 'governor' || contestedSeat === 'president') {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'senate' && senatorialDistrict) {
        // If profiles table tracks their regions directly via text arrays or geographic handles:
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'house_of_reps' && federalConstituency) {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'house_of_assembly' && stateConstituency) {
        // State House of Assembly usually handles sub-LGA boundaries or a specific local government patch
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);

        if (assignedLga) {
            performanceMetricsQuery = performanceMetricsQuery.eq('lga_name', assignedLga);
            logsQuery = logsQuery.eq('lga_name', assignedLga);
        }
    } else if (contestedSeat === 'chairman' && assignedLga) {
        supervisorsQuery = supervisorsQuery.contains('assigned_lgas', [assignedLga]);
        coordinatorsQuery = coordinatorsQuery.contains('assigned_lgas', [assignedLga]);
        agentsQuery = agentsQuery.contains('assigned_lgas', [assignedLga]);

        performanceMetricsQuery = performanceMetricsQuery.eq('lga_name', assignedLga);
        logsQuery = logsQuery.eq('lga_name', assignedLga);
    } else {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    }

    // 1. Concurrent Execution of Data Extraction Queries
    const [
        resSupervisors,
        resCoordinators,
        resAgents,
        resMetrics,
        resLogs
    ] = await Promise.all([
        supervisorsQuery,
        coordinatorsQuery,
        agentsQuery,
        performanceMetricsQuery.order('lga_name', { ascending: true }).limit(50),
        logsQuery.order('created_at', { ascending: false }).limit(5)
    ]);

    const activeSupervisorsList = resSupervisors.data || [];
    const activeCoordinatorsList = resCoordinators.data || [];
    const activeAgentsList = resAgents.data || [];

    // Secondary highly efficient query execution layer to capture document scans based on active agents team
    let activeAuditsList = [];

    if (activeAgentsList.length > 0) {
        const activeAgentIds = activeAgentsList.map(agent => agent.id).filter(Boolean);

        if (activeAgentIds.length > 0) {
            const { data, error } = await supabase
                .from('document_audits')
                .select('pu_id, pu_code, agent_id')
                .filter('agent_id', 'in', `(${activeAgentIds.map(id => `"${id}"`).join(',')})`);

            if (error) {
                console.error("Supabase Query Error:", error);
            } else {
                activeAuditsList = data || [];
            }
        }
    }

    // Extracting unique strings across array definitions using flatMap
    const assignedLgasSet = new Set(
        activeSupervisorsList
            .flatMap(p => p.assigned_lgas || [])
            .map(l => l?.trim().toLowerCase())
            .filter(Boolean)
    );

    const assignedWardsSet = new Set(
        activeCoordinatorsList
            .flatMap(p => p.assigned_wards || [])
            .map(w => w?.trim().toLowerCase())
            .filter(Boolean)
    );

    const assignedPusSet = new Set(
        activeAgentsList
            .flatMap(p => p.assigned_pus || [])
            .map(pu => pu?.trim().toLowerCase())
            .filter(Boolean)
    );

    // Filter incoming scanned units checking both client-side pu_id and AI-evaluated pu_code
    const scannedPusSet = new Set();
    activeAuditsList.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    const structuralLgas = resMetrics.data || [];
    const recentActivityLog = resLogs.data || [];

    // 2. Fetch baseline metadata metrics directly from your internal server API route
    let targets = { totalLgas: 0, totalWards: 0, totalPus: 0 };

    try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const searchParams = new URLSearchParams();
        if (safeState) searchParams.set('state', safeState);
        if (assignedLga) searchParams.set('lga', assignedLga);
        if (assignedWard) searchParams.set('ward', assignedWard);
        if (senatorialDistrict) searchParams.set('senatorial_district', senatorialDistrict);
        if (federalConstituency) searchParams.set('fed_constituency', federalConstituency);
        if (stateConstituency) searchParams.set('state_constituency', stateConstituency);

        const matrixApiResponse = await fetch(`${origin}/api/locations?${searchParams.toString()}`, {
            cache: 'no-store'
        });

        if (matrixApiResponse.ok) {
            const matrixData = await matrixApiResponse.json();

            if (matrixData.pollingUnits) {
                targets = {
                    totalLgas: 0, // Explicitly zero out to identify sub-LGA context models
                    totalWards: 1,
                    totalPus: matrixData.pollingUnits.length || 0
                };
            }
            else if (matrixData.wards && !assignedWard) {
                const calculatedPuTotal = matrixData.wards.reduce((acc, w) => acc + (w.puCount || w.pollingUnitsCount || w.total_pus || 0), 0);
                targets = {
                    totalLgas: 0, // Standard sub-LGA seat boundary rule
                    totalWards: matrixData.wards.length || 0,
                    totalPus: calculatedPuTotal || 0
                };
            }
            else if (matrixData.lgas) {
                const totalLgasCount = matrixData.lgas.length || 0;
                const totalWardsCount = matrixData.lgas.reduce((acc, l) => acc + (l.wardCount || l.total_wards || 0), 0);
                const totalPusCount = matrixData.lgas.reduce((acc, l) => acc + (l.puCount || l.total_pus || 0), 0);

                targets = {
                    totalLgas: totalLgasCount,
                    totalWards: totalWardsCount,
                    totalPus: totalPusCount || structuralLgas.reduce((acc, curr) => acc + (curr.total_pus || 0), 0)
                };
            }
        }
    } catch (apiError) {
        console.error("Failed to query baseline total metrics from internal data endpoint:", apiError);
    }

    // Direct structural safety checks: Handling calculations for macro and sub-LGA layouts gracefully
    const aggregatedPuMetricsCount = structuralLgas.reduce((acc, curr) => acc + (curr.total_pus || 0), 0);

    // FIXED: If the API target yields 0 LGAs (like for a sub-LGA State Assembly seat), we retain 0 to drop UI table layout elements conditionally
    const isSubLgaSeat = contestedSeat === 'house_of_assembly' || targets.totalLgas === 0;

    if (!isSubLgaSeat && targets.totalLgas === 0) targets.totalLgas = structuralLgas.length || 1;
    if (targets.totalWards === 0) targets.totalWards = structuralLgas.reduce((acc, curr) => acc + (curr.total_wards || 0), 0) || 1;

    if (targets.totalPus === 0) {
        targets.totalPus = aggregatedPuMetricsCount || Math.max(assignedPusSet.size, 1);
    }

    // Calculate actual live deployment operational coverage percentages safely based on array items
    const totalSupervisorsFound = assignedLgasSet.size;
    const totalCoordinatorsFound = assignedWardsSet.size;
    const totalAgentsFound = assignedPusSet.size;

    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => assignedPusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, targets.totalPus);

    // Guard values against division by zero errors
    const lgaSaturation = targets.totalLgas > 0 ? Math.min(Math.round((totalSupervisorsFound / targets.totalLgas) * 100), 100) : 0;
    const wardSaturation = Math.min(Math.round((totalCoordinatorsFound / targets.totalWards) * 100), 100) || 0;
    const agentSaturation = Math.min(Math.round((totalAgentsFound / targets.totalPus) * 100), 100) || 0;
    const scanSaturation = Math.min(Math.round((verifiedScannedCount / targets.totalPus) * 100), 100) || 0;

    return (
        <div className="min-h-screen bg-[#FAF6F0] selection:bg-[#9A6749]/20 p-4 sm:p-6 lg:p-8 text-[#291C14]">

            {/* Header Identity Bar */}
            <header className="max-w-7xl mx-auto mb-8 bg-white p-6 rounded-2xl shadow-sm border border-[#8A7968]/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200 hover:border-[#8A7968]/40">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[#8A7968]">Executive Management Portal</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight mt-1 text-[#291C14]">
                        {fullName.toUpperCase()}
                    </h1>
                    <p className="text-xs font-bold text-[#9A6749] uppercase tracking-wider mt-0.5">
                        Target Office: <span className="text-[#291C14] font-black">{contestedSeat?.replace(/_/g, ' ')?.toUpperCase() || 'NOT SPECIFIED'}</span>
                    </p>
                </div>

                <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2.5 rounded-xl text-left sm:text-right min-w-[220px] shadow-inner">
                    <span className="block text-[9px] font-bold uppercase text-[#8A7968] tracking-widest">Assigned Jurisdiction Scope</span>
                    <span className="text-xs font-bold text-[#291C14] uppercase tracking-wide block mt-0.5 leading-relaxed">
                        {assignedState} State
                        {assignedLga && ` — ${assignedLga} LGA`}
                        {assignedWard && ` — ${assignedWard} Ward`}
                        {stateConstituency && ` [${stateConstituency}]`}
                        {senatorialDistrict && ` (${senatorialDistrict} Dist.)`}
                        {federalConstituency && ` (${federalConstituency})`}
                    </span>
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-8">

                {/* Staffing Deployment & Audit Coverage Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

                    {/* Card 1: LGA Supervisors Allocation — Dynamically Hidden/Adjusted for Sub-LGA Contexts */}
                    {!isSubLgaSeat ? (
                        <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#9A6749] transition-all group-hover:w-2" />
                            <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">LGA Supervisor Staffing</p>
                            <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2">
                                {lgaSaturation}%
                            </p>
                            <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                                {totalSupervisorsFound} covered of {targets.totalLgas} administrative areas
                            </p>
                            <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                                <div className="bg-[#9A6749] h-full transition-all duration-500 ease-out" style={{ width: `${lgaSaturation}%` }} />
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/60 p-5 rounded-2xl border border-[#8A7968]/10 relative overflow-hidden shadow-sm flex flex-col justify-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A7968]">LGA Scope</p>
                            <p className="text-sm font-black text-[#8A7968] mt-1 uppercase">Sub-LGA Constituency</p>
                            <p className="text-[11px] font-medium text-[#8A7968]/80 mt-0.5">Direct LGA-wide monitoring bypassed for this seat profile.</p>
                        </div>
                    )}

                    {/* Card 2: Ward Coordinators Allocation */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#9A6749] transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Ward Coordinator Coverage</p>
                        <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2">
                            {wardSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {totalCoordinatorsFound} covered of {targets.totalWards} electoral wards
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-[#9A6749] h-full transition-all duration-500 ease-out" style={{ width: `${wardSaturation}%` }} />
                        </div>
                    </div>

                    {/* Card 3: Polling Agents Allocation */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600 transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Polling Agent Assignment</p>
                        <p className="text-2xl font-black tracking-tight text-emerald-600 mt-2">
                            {agentSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {totalAgentsFound} active units covered of {targets.totalPus} total units
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-emerald-600 h-full transition-all duration-500 ease-out" style={{ width: `${agentSaturation}%` }} />
                        </div>
                    </div>

                    {/* Card 4: Result Sheet Audits / Scans */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Result Sheet Scans</p>
                        <p className="text-2xl font-black tracking-tight text-blue-600 mt-2">
                            {scanSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {verifiedScannedCount} verified scans across {targets.totalPus} total units
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-blue-600 h-full transition-all duration-500 ease-out" style={{ width: `${scanSaturation}%` }} />
                        </div>
                    </div>

                </div>

                {/* Main Content Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Grid: Structural Area breakdown table — Conditionally rendered layout depending on seat bounds */}
                    <div className={`${isSubLgaSeat ? 'lg:col-span-2' : 'lg:col-span-2'} bg-white p-6 rounded-2xl border border-[#8A7968]/20 shadow-sm transition-all`}>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-[#FAF6F0] pb-4 gap-2">
                            <div>
                                <h3 className="text-xs font-black tracking-wider text-[#291C14] uppercase">
                                    {isSubLgaSeat ? 'Constituency Polling Matrix' : 'Jurisdiction Performance Breakdown'}
                                </h3>
                                <p className="text-[11px] font-medium text-[#8A7968] mt-0.5">
                                    {isSubLgaSeat ? 'Live active agent tracking matrix inside this seat footprint' : 'Personnel and tracking coverage mapped across local government structures'}
                                </p>
                            </div>
                            <span className="text-[9px] bg-[#9A6749]/10 text-[#9A6749] font-black px-2.5 py-1 rounded-md uppercase tracking-wider border border-[#9A6749]/20 shadow-sm whitespace-nowrap">
                                Metrics Matrix
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-[#8A7968]/10">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#8A7968]/20 text-[10px] font-black text-[#8A7968] uppercase tracking-wider bg-[#FAF6F0]">
                                        <th className="p-3.5">{isSubLgaSeat ? 'Constituency Boundaries' : 'Local Government Area'}</th>
                                        <th className="p-3.5">Coordinator Status</th>
                                        <th className="p-3.5">Staff Depth</th>
                                        <th className="p-3.5 text-right">Polling Unit Coverage</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-medium divide-y divide-[#FAF6F0]">
                                    {!isSubLgaSeat && structuralLgas && structuralLgas.length > 0 ? (
                                        structuralLgas.map((row, index) => {
                                            const puPct = Math.round((row.assigned_pus / (row.total_pus || 1)) * 100) || 0;
                                            const currentLgaNameClean = row.lga_name?.trim().toLowerCase();
                                            const isSupervisorAssigned = row.supervisor_status === 'ASSIGNED' || assignedLgasSet.has(currentLgaNameClean);

                                            return (
                                                <tr key={index} className="hover:bg-[#FAF6F0]/50 transition-colors duration-150">
                                                    <td className="p-3.5 font-bold text-[#291C14]">{row.lga_name}</td>
                                                    <td className="p-3.5">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${isSupervisorAssigned ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                            {isSupervisorAssigned ? '✓ ASSIGNED' : '⚠️ VACANT'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 font-semibold text-[#4A3B32]">{row.assigned_wards} / {row.total_wards} Wards</td>
                                                    <td className={`p-3.5 text-right font-bold tracking-tight ${puPct > 75 ? 'text-emerald-700' : puPct > 35 ? 'text-[#9A6749]' : 'text-red-600'}`}>
                                                        {row.assigned_pus} / {row.total_pus} ({puPct}%)
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : isSubLgaSeat ? (
                                        // Streamlined sub-LGA tracking table layout view context block
                                        <tr className="hover:bg-[#FAF6F0]/50 transition-colors duration-150">
                                            <td className="p-3.5 font-bold text-[#291C14]">{assignedWard ? `${assignedWard} Ward` : assignedLga || 'Local Footprint'}</td>
                                            <td className="p-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${totalCoordinatorsFound > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                    {totalCoordinatorsFound > 0 ? '✓ ACTIVE WARD LEADS' : '⚠️ VACANT COORD'}
                                                </span>
                                            </td>
                                            <td className="p-3.5 font-semibold text-[#4A3B32]">{totalAgentsFound} Active Agents</td>
                                            <td className="p-3.5 text-right font-bold tracking-tight text-emerald-700">
                                                {verifiedScannedCount} / {targets.totalPus} Scanned ({scanSaturation}%)
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center font-bold text-[#8A7968] bg-[#FAF6F0]/20 italic">
                                                No structural jurisdiction footprint records found for this seat layout.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Grid: Recent Log Stream Notifications Display */}
                    <div className="bg-white p-6 rounded-2xl border border-[#8A7968]/20 flex flex-col justify-between shadow-sm transition-all">
                        <div>
                            <h3 className="text-xs font-black tracking-wider text-[#291C14] mb-0.5 uppercase">System Activity Feed</h3>
                            <p className="text-[11px] font-medium text-[#8A7968] mb-6">Real-time validation tracking log audits</p>

                            <div className="space-y-4">
                                {recentActivityLog && recentActivityLog.length > 0 ? (
                                    recentActivityLog.map((log) => (
                                        <div key={log.id} className="p-3.5 bg-[#FAF6F0] rounded-xl border border-[#8A7968]/15 text-xs transition-all hover:border-[#8A7968]/30">
                                            <div className="flex justify-between font-black text-[9px] uppercase tracking-wider text-[#8A7968] mb-1.5">
                                                <span className={log.event_type === 'ALERT' ? 'text-amber-700' : 'text-[#9A6749]'}>
                                                    {log.event_type?.replace(/_/g, ' ')}
                                                </span>
                                                <span className="font-mono">
                                                    {log.created_at ? new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'} WAT
                                                </span>
                                            </div>
                                            <p className="font-semibold text-[#291C14] leading-relaxed">{log.description}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 border border-dashed border-[#8A7968]/20 rounded-xl bg-[#FAF6F0]/20">
                                        <p className="text-xs font-bold text-[#8A7968] italic">
                                            No structural registration changes recorded.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-[#FAF6F0]">
                            <button className="w-full bg-[#FAF6F0] hover:bg-[#8A7968]/10 text-xs font-bold uppercase tracking-widest text-[#8A7968] py-3 rounded-xl border border-dashed border-[#8A7968]/40 transition-all duration-150 active:scale-[0.99]">
                                Export Directory Baseline
                            </button>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}