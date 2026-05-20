import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// Server-side validation and role protection
async function getAuthenticatedSupervisor() {
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

    // Security Gate: Explicitly check for lga_supervisor authorization
    const role = user.user_metadata?.role;
    if (role !== 'lga_supervisor') {
        if (role === 'candidate') redirect('/dashboard/candidate');
        if (role === 'ward_supervisor') redirect('/dashboard/ward');
        redirect('/login?error=unauthorized');
    }

    return { user, supabase };
}

export default async function LgaSupervisorDashboardPage({ searchParams }) {
    const { user, supabase } = await getAuthenticatedSupervisor();

    // Resolve search parameters safely for tab switching
    const resolvedParams = await searchParams;
    const activeLgaTab = resolvedParams?.lga || 'all';

    // 1. Fetch Supervisor's Profile Row to get dynamic relational bindings
    const { data: supervisorProfile, error: profileError } = await supabase
        .from('profiles')
        .select(`
id,
full_name,
assigned_lgas,
assigned_state,
candidate_id
`)
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Supervisor Profile Fetch Error:", profileError);
    }

    // Graceful fallbacks for supervisor profile attributes
    const supervisorName = supervisorProfile?.full_name || user.user_metadata?.full_name || 'LGA Supervisor';
    const safeState = supervisorProfile?.assigned_state || '';
    const assignedLgasArray = supervisorProfile?.assigned_lgas || [];
    const candidateId = supervisorProfile?.candidate_id || '';

    // 2. Fetch the candidate's profile dynamically to get correct, real-time campaign details
    let candidateName = 'Hon. Candidate';
    let candidateSeat = '';

    if (candidateId) {
        const { data: candidateProfile } = await supabase
            .from('profiles')
            .select('full_name, contesting_seat')
            .eq('id', candidateId)
            .maybeSingle();

        if (candidateProfile) {
            candidateName = candidateProfile.full_name || 'Hon. Candidate';
            candidateSeat = candidateProfile.contesting_seat || '';
        }
    }

    // 3. Dynamic targeted structural filtering query building
    let wardCoordinatorsQuery = supabase
        .from('profiles')
        .select('id, full_name, assigned_wards, assigned_lgas, phone, created_at')
        .in('role', ['WARD_SUPERVISOR', 'ward_supervisor', 'ward_supervisor'])
        .eq('lga_supervisor_id', user.id)
        .eq('candidate_id', candidateId);

    let pollingAgentsQuery = supabase
        .from('profiles')
        .select('id, assigned_pus, assigned_lgas, lga_supervisor_id')
        .in('role', ['polling_agent', 'POLLING_UNIT_AGENT'])
        .eq('lga_supervisor_id', user.id)
        .eq('candidate_id', candidateId);

    let metricsQuery = supabase
        .from('lga_performance_metrics')
        .select('lga_name, supervisor_status, total_wards, assigned_wards, total_pus, assigned_pus')
        .eq('state_name', safeState);

    let logsQuery = supabase
        .from('deployment_activity_logs')
        .select('id, event_type, description, lga_name, created_at')
        .eq('state_name', safeState)
        .order('created_at', { ascending: false });

    // Enforce arrays or structural criteria to cover all assigned jurisdictions
    if (assignedLgasArray.length > 0) {
        metricsQuery = metricsQuery.in('lga_name', assignedLgasArray);
        logsQuery = logsQuery.in('lga_name', assignedLgasArray);
    }

    // Execute database operations concurrently
    const [
        resCoordinators,
        resAgents,
        resMetrics,
        resLogs
    ] = await Promise.all([
        wardCoordinatorsQuery,
        pollingAgentsQuery,
        metricsQuery,
        logsQuery
    ]);

    // Baseline arrays directly extracted from performance-tuned database queries
    const allCoordinatorsList = resCoordinators.data || [];
    const allAgentsList = resAgents.data || [];
    const allDbMetrics = resMetrics.data || [];
    const allActivityLogs = resLogs.data || [];

    // Secondary data pipeline layer targeting unique audit collection sheets 
    let activeAuditsList = [];
    if (allAgentsList.length > 0) {
        const activeAgentIds = allAgentsList.map(agent => agent.id).filter(Boolean);
        if (activeAgentIds.length > 0) {
            const { data, error } = await supabase
                .from('document_audits')
                .select('pu_id, pu_code, agent_id')
                .filter('agent_id', 'in', `(${activeAgentIds.map(id => `"${id}"`).join(',')})`);
            activeAuditsList = data || [];
        }
    }

    // 4. Fetch baseline structural targets and build an explicit ward-to-lga map dictionary
    let structuralTargetsMap = {};
    let wardToLgaLookup = {}; // Format: { "ward_name_lowercase": "lga_name_lowercase" }

    await Promise.all(assignedLgasArray.map(async (lgaName) => {
        let targets = { totalWards: 0, totalPus: 0 };
        try {
            const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const searchParams = new URLSearchParams();
            if (safeState) searchParams.set('state', safeState);
            searchParams.set('lga', lgaName);

            const matrixApiResponse = await fetch(`${origin}/api/locations?${searchParams.toString()}`, {
                cache: 'no-store'
            });

            if (matrixApiResponse.ok) {
                const matrixData = await matrixApiResponse.json();
                if (matrixData.wards) {
                    const calculatedPuTotal = matrixData.wards.reduce((acc, w) => acc + (w.puCount || w.pollingUnitsCount || w.total_pus || 0), 0);
                    targets = {
                        totalWards: matrixData.wards.length || 0,
                        totalPus: calculatedPuTotal || 0
                    };

                    // Populate lookup system with ward associations found from API response
                    matrixData.wards.forEach(w => {
                        const wardName = (w.name || w.ward_name || '').toString().trim().toLowerCase();
                        if (wardName) {
                            wardToLgaLookup[wardName] = lgaName.toLowerCase();
                        }
                    });
                }
            }
        } catch (apiError) {
            console.error(`Failed to query baseline metrics for ${lgaName}:`, apiError);
        }

        // Apply fallback targets to db metrics safely per individual LGA
        const specificDbMetric = allDbMetrics.find(m => m.lga_name?.toLowerCase() === lgaName.toLowerCase());
        if (targets.totalWards === 0) targets.totalWards = specificDbMetric?.total_wards || 1;
        if (targets.totalPus === 0) targets.totalPus = specificDbMetric?.total_pus || 1;

        structuralTargetsMap[lgaName.toLowerCase()] = targets;
    }));

    // 5. Dynamic Tab View Interpolation and Data Splitting logic
    const isFiltered = activeLgaTab !== 'all';

    // Filter profiles AND dynamically strip out unrelated cross-boundary wards
    const coordinatorsList = isFiltered
        ? allCoordinatorsList
            .map(p => {
                const localizedWards = (p.assigned_wards || []).filter(ward => {
                    const normalizedWard = ward.toString().trim().toLowerCase();
                    return wardToLgaLookup[normalizedWard] === activeLgaTab.toLowerCase();
                });

                return { ...p, assigned_wards: localizedWards };
            })
            .filter(p => {
                // Keep profile if it maps explicitly via assigned_lgas or has matching filtered wards
                if (p.assigned_lgas && p.assigned_lgas.length > 0) {
                    return p.assigned_lgas.map(l => l.toString().toLowerCase()).includes(activeLgaTab.toLowerCase());
                }
                return p.assigned_wards.length > 0;
            })
        : allCoordinatorsList;

    console.log(coordinatorsList, " Are all coordinators");

    const agentsList = isFiltered
        ? allAgentsList.filter(p => p.assigned_lgas?.map(l => l.toString().toLowerCase()).includes(activeLgaTab.toLowerCase()))
        : allAgentsList;

    const activityLogs = isFiltered
        ? allActivityLogs.filter(l => l.lga_name?.toString().toLowerCase() === activeLgaTab.toLowerCase())
        : allActivityLogs;

    // Filter out localized tracking audits belonging exclusively to the filtered agents list layout viewport
    const filteredAgentIds = new Set(agentsList.map(a => a.id));
    const targetedAudits = isFiltered
        ? activeAuditsList.filter(audit => filteredAgentIds.has(audit.agent_id))
        : activeAuditsList;

    // Calculate Global or Tab Isolated Coverage Data Metrics
    let calculatedTotalWards = 0;
    let calculatedTotalPus = 0;

    if (isFiltered) {
        calculatedTotalWards = structuralTargetsMap[activeLgaTab.toLowerCase()]?.totalWards || 1;
        calculatedTotalPus = structuralTargetsMap[activeLgaTab.toLowerCase()]?.totalPus || 1;
    } else {
        Object.values(structuralTargetsMap).forEach(target => {
            calculatedTotalWards += target.totalWards;
            calculatedTotalPus += target.totalPus;
        });
    }

    if (calculatedTotalWards === 0) calculatedTotalWards = 1;
    if (calculatedTotalPus === 0) calculatedTotalPus = 1;

    // Evaluate live active sets matching active tab viewport configuration
    const activeWardsSet = new Set(
        coordinatorsList
            .flatMap(p => p.assigned_wards || [])
            .map(w => w?.toString().trim().toLowerCase())
            .filter(Boolean)
    );

    const activePusSet = new Set(
        agentsList
            .flatMap(p => p.assigned_pus || [])
            .map(pu => pu?.toString().trim().toLowerCase())
            .filter(Boolean)
    );

    // Extract unique scanned polling unit records securely matching current scope references
    const scannedPusSet = new Set();
    targetedAudits.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    const totalCoordinatorsFound = activeWardsSet.size;
    const totalAgentsFound = activePusSet.size;

    // Intersect tracking records to match only targets inside assigned deployment structure bounds
    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => activePusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, calculatedTotalPus);

    const wardSaturation = Math.min(Math.round((totalCoordinatorsFound / calculatedTotalWards) * 100), 100) || 0;
    const agentSaturation = Math.min(Math.round((totalAgentsFound / calculatedTotalPus) * 100), 100) || 0;
    const scanSaturation = Math.min(Math.round((verifiedScannedCount / calculatedTotalPus) * 100), 100) || 0;

    return (
        <div className="min-h-screen bg-[#FAF6F0] selection:bg-[#9A6749]/20 p-4 sm:p-6 lg:p-8 text-[#291C14]">

            {/* Institutional Information Header */}
            <header className="max-w-7xl mx-auto mb-6 bg-white p-6 rounded-2xl shadow-sm border border-[#8A7968]/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200 hover:border-[#8A7968]/40">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#9A6749] animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[#8A7968]">LGA Operational Command</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight mt-1 text-[#291C14]">
                        {supervisorName.toUpperCase()}
                    </h1>
                    <p className="text-xs font-bold text-[#9A6749] uppercase tracking-wider mt-0.5">
                        Assigned Jurisdictions: <span className="text-[#291C14] underline decoration-[#9A6749] decoration-2 font-black">{assignedLgasArray.join(', ').toUpperCase()}</span> {safeState && `(${safeState} State)`}
                    </p>
                </div>

                {/* Campaign Scope Context Details */}
                <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2.5 rounded-xl text-left sm:text-right min-w-[220px] shadow-inner">
                    <span className="block text-[9px] font-bold uppercase text-[#8A7968] tracking-widest">Assigned Campaign Scope</span>
                    <span className="text-xs font-bold text-[#291C14] uppercase tracking-wide block mt-0.5 leading-relaxed">
                        Candidate: <span className="font-black text-[#9A6749]">{candidateName}</span>
                        {candidateSeat && ` — ${candidateSeat.replace(/_/g, ' ')}`}
                    </span>
                </div>
            </header>

            {/* Interactive LGA Navigation Filter Tabs */}
            <nav className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 border-b border-[#8A7968]/20 pb-3">
                <a
                    href="?"
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeLgaTab === 'all'
                        ? 'bg-[#291C14] text-white shadow-sm'
                        : 'bg-white text-[#8A7968] hover:text-[#291C14] border border-[#8A7968]/15'
                        }`}
                >
                    💼 All Assigned Areas ({assignedLgasArray.length})
                </a>
                {assignedLgasArray.map((lga) => (
                    <a
                        key={lga}
                        href={`?lga=${encodeURIComponent(lga.toLowerCase())}`}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeLgaTab === lga.toLowerCase()
                            ? 'bg-[#9A6749] text-white shadow-sm'
                            : 'bg-white text-[#8A7968] hover:text-[#291C14] border border-[#8A7968]/15'
                            }`}
                    >
                        📍 {lga.toUpperCase()}
                    </a>
                ))}
            </nav>

            <main className="max-w-7xl mx-auto space-y-8">

                {/* Staffing Deployment Coverage Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

                    {/* Card 1: Managed Boundaries Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#291C14] transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Current Boundary Scope</p>
                        <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2 uppercase">
                            {isFiltered ? `${activeLgaTab}` : `${assignedLgasArray.length} LGAs`}
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1 uppercase">
                            {isFiltered ? 'Single LGA Filter Active' : assignedLgasArray.join(', ')}
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-[#291C14] h-full transition-all duration-500 ease-out" style={{ width: `100%` }} />
                        </div>
                    </div>

                    {/* Card 2: Ward Coordinators Allocation */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#9A6749] transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Ward Coordinator Coverage</p>
                        <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2">
                            {wardSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {totalCoordinatorsFound} covered of {calculatedTotalWards} total tracking wards
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
                            {totalAgentsFound} active units covered of {calculatedTotalPus} total units
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
                            {verifiedScannedCount} verified scans across {calculatedTotalPus} total units
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-blue-600 h-full transition-all duration-500 ease-out" style={{ width: `${scanSaturation}%` }} />
                        </div>
                    </div>

                </div>

                {/* Regional Matrices Mapping Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Wards Verification Mapping Overview Table */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#8A7968]/20 shadow-sm transition-all">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-[#FAF6F0] pb-4 gap-2">
                            <div>
                                <h3 className="text-xs font-black tracking-wider text-[#291C14] uppercase">
                                    WARD SUPERVISOR DIRECTORY {isFiltered && `— ${activeLgaTab.toUpperCase()}`}
                                </h3>
                                <p className="text-[11px] font-medium text-[#8A7968] mt-0.5">Onboarded team officers managing localized ward sectors</p>
                            </div>

                            {/* Account Creation Access Intercept Node Link */}
                            <Link href="/dashboard/lga/coordinators" className="bg-[#291C14] hover:bg-[#4A3B32] text-white text-[10px] font-bold px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap shadow-sm active:scale-[0.98]">
                                Create Ward Account
                            </Link>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-[#8A7968]/10">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#8A7968]/20 text-[10px] font-black text-[#8A7968] uppercase tracking-wider bg-[#FAF6F0]">
                                        <th className="p-3.5">Supervisor Name</th>
                                        <th className="p-3.5">LGA Boundary</th>
                                        <th className="p-3.5">Assigned Sectors</th>
                                        <th className="p-3.5">Contact Line</th>
                                        <th className="p-3.5 text-right">Registration Date</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-medium divide-y divide-[#FAF6F0]">
                                    {coordinatorsList && coordinatorsList.length > 0 ? (
                                        coordinatorsList.map((coordinator) => (
                                            <tr key={coordinator.id} className="hover:bg-[#FAF6F0]/50 transition-colors duration-150 text-[#291C14]">
                                                <td className="p-3.5 font-bold">{coordinator.full_name}</td>
                                                <td className="p-3.5 uppercase font-black text-[10px] text-[#9A6749]">
                                                    {coordinator.assigned_lgas && coordinator.assigned_lgas.length > 0
                                                        ? coordinator.assigned_lgas.join(', ')
                                                        : assignedLgasArray.join(', ').toUpperCase()}
                                                </td>
                                                <td className="p-3.5 font-semibold text-[#4A3B32]">
                                                    {coordinator.assigned_wards && coordinator.assigned_wards.length > 0
                                                        ? coordinator.assigned_wards.join(', ')
                                                        : 'No Wards Configured'}
                                                </td>
                                                <td className="p-3.5 text-[#8A7968] font-mono">{coordinator.phone || '—'}</td>
                                                <td className="p-3.5 text-right font-bold text-[#8A7968]">
                                                    {coordinator.created_at ? new Date(coordinator.created_at).toLocaleDateString('en-GB') : '—'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center font-bold text-[#8A7968] bg-[#FAF6F0]/20 italic">
                                                No Ward Coordinators currently registered under your chosen local government filter scope.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Hand Sidebar Actions & Log Feed Matrix */}
                    <div className="bg-white p-6 rounded-2xl border border-[#8A7968]/20 flex flex-col justify-between shadow-sm transition-all">
                        <div>
                            <h3 className="text-xs font-black tracking-wider text-[#291C14] mb-0.5 uppercase">
                                System Activity Logs {isFiltered && `— ${activeLgaTab.toUpperCase()}`}
                            </h3>
                            <p className="text-[11px] font-medium text-[#8A7968] mb-6">Real-time operational verification feed</p>

                            <div className="space-y-4">
                                {activityLogs && activityLogs.length > 0 ? (
                                    activityLogs.map((log) => (
                                        <div key={log.id} className="p-3.5 bg-[#FAF6F0] rounded-xl border border-[#8A7968]/15 text-xs transition-all hover:border-[#8A7968]/30">
                                            <div className="flex justify-between font-black text-[9px] uppercase tracking-wider text-[#8A7968] mb-1.5">
                                                <span className={log.event_type === 'ALERT' ? 'text-amber-700' : 'text-[#9A6749]'}>
                                                    {log.lga_name?.toUpperCase()} • {log.event_type?.replace(/_/g, ' ')}
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
                                            No system logs recorded inside this local government jurisdiction boundary framework.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Informative verification safety layout footer */}
                        <div className="mt-6 pt-4 border-t border-[#FAF6F0] text-center">
                            <p className="text-[10px] font-semibold text-[#8A7968] italic leading-normal">
                                Regional Security Tier — All structural data syncs securely with the master INEC configuration server.
                            </p>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}