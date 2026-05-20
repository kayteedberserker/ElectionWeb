import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// Server-side validation and role protection
async function getAuthenticatedWardSupervisor() {
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

    // Security Gate: Explicitly check for ward_supervisor authorization
    const role = user.user_metadata?.role;
    if (role !== 'ward_supervisor') {
        if (role === 'candidate') redirect('/dashboard/candidate');
        if (role === 'lga_supervisor') redirect('/dashboard/lga');
        redirect('/login?error=unauthorized');
    }

    return { user, supabase };
}

export default async function WardCoordinatorDashboardPage({ searchParams }) {
    const { user, supabase } = await getAuthenticatedWardSupervisor();

    // Resolve search parameters safely for ward tab switching
    const resolvedParams = await searchParams;
    const activeWardTab = resolvedParams?.ward || 'all';

    // 1. Fetch Supervisor's Profile Row to get dynamic relational bindings (Stripped LGA data)
    const { data: supervisorProfile, error: profileError } = await supabase
        .from('profiles')
        .select(`
            id,
            full_name,
            assigned_wards,
            assigned_state,
            candidate_id
        `)
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Ward Supervisor Profile Fetch Error:", profileError);
    }

    // Graceful fallbacks for supervisor profile attributes
    const supervisorName = supervisorProfile?.full_name || user.user_metadata?.full_name || 'Ward Coordinator';
    const safeState = supervisorProfile?.assigned_state || 'OSUN';
    const candidateId = supervisorProfile?.candidate_id || '';

    let assignedWardsArray = [];
    if (Array.isArray(supervisorProfile?.assigned_wards)) {
        assignedWardsArray = supervisorProfile.assigned_wards;
    } else if (supervisorProfile?.assigned_wards) {
        assignedWardsArray = [supervisorProfile.assigned_wards];
    } else if (user.user_metadata?.assigned_ward) {
        assignedWardsArray = [user.user_metadata.assigned_ward];
    }

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

    // 3. Query Polling Agents registered under this specific candidate
    let pollingAgentsQuery = supabase
        .from('profiles')
        .select('id, full_name, assigned_pus, assigned_wards, phone, created_at')
        .in('role', ['polling_agent', 'POLLING_UNIT_AGENT'])
        .eq('candidate_id', candidateId)
        .eq('ward_supervisor_id', user.id);

    let logsQuery = supabase
        .from('deployment_activity_logs')
        .select('id, event_type, description, ward_name, created_at')
        .eq('state_name', safeState)
        .order('created_at', { ascending: false });

    // Enforce scope constraints to only pull items related to this supervisor's jurisdiction
    if (assignedWardsArray.length > 0) {
        logsQuery = logsQuery.in('ward_name', assignedWardsArray);
    }

    // Execute database operations concurrently
    const [resAgents, resLogs] = await Promise.all([
        pollingAgentsQuery,
        logsQuery
    ]);

    const allAgentsList = resAgents.data || [];
    const allActivityLogs = resLogs.data || [];

    // Secondary live data pipeline layer targeting explicit document transmission tracking
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

    // 4. Query Location Master API System for Polling Units to find real structural targets
    let structuralTargetsMap = {}; // Format: { "ward_name": { totalPus: X, puList: [...] } }
    let puToWardLookup = {};       // Format: { "pu_code_or_name": "ward_name" }

    await Promise.all(assignedWardsArray.map(async (wardName) => {
        let targets = { totalPus: 0, puList: [] };
        try {
            const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const url = `${origin}/api/locations?state=${encodeURIComponent(safeState)}&ward=${encodeURIComponent(wardName)}`;

            const matrixApiResponse = await fetch(url, { cache: 'no-store' });

            if (matrixApiResponse.ok) {
                const matrixData = await matrixApiResponse.json();
                const pus = matrixData.pollingUnits || matrixData.polling_units || [];

                targets = {
                    totalPus: pus.length || 0,
                    puList: pus
                };

                pus.forEach(pu => {
                    const code = (pu.code || pu.polling_unit_code || '').toString().trim().toLowerCase();
                    const name = (pu.name || '').toString().trim().toLowerCase();
                    if (code) puToWardLookup[code] = wardName.toLowerCase();
                    if (name) puToWardLookup[name] = wardName.toLowerCase();
                });
            }
        } catch (apiError) {
            console.error(`Failed to query baseline units for Ward ${wardName}:`, apiError);
        }

        structuralTargetsMap[wardName.toLowerCase()] = targets;
    }));

    // 5. Dynamic Tab View Interpolation and Data Splitting logic
    const isFiltered = activeWardTab !== 'all';

    // Filter agents based on active tab selection matrix
    const agentsList = isFiltered
        ? allAgentsList.filter(p => {
            const wards = (p.assigned_wards || []).map(w => w.toString().toLowerCase());
            if (wards.includes(activeWardTab.toLowerCase())) return true;

            // Cross-check via mapped assigned polling units structural assignments
            const pus = (p.assigned_pus || []).map(pu => pu.toString().trim().toLowerCase());
            return pus.some(pu => puToWardLookup[pu] === activeWardTab.toLowerCase());
        })
        : allAgentsList.filter(p => {
            const wards = (p.assigned_wards || []).map(w => w.toString().toLowerCase());
            return wards.some(w => assignedWardsArray.map(aw => aw.toLowerCase()).includes(w));
        });

    // Filter out audits matching only the active scoped tracking list
    const filteredAgentIds = new Set(agentsList.map(a => a.id));
    const targetedAudits = isFiltered
        ? activeAuditsList.filter(audit => filteredAgentIds.has(audit.agent_id))
        : activeAuditsList;

    // Calculate dynamic physical unit baselines across selected scope bounds
    let calculatedTotalPus = 0;
    if (isFiltered) {
        calculatedTotalPus = structuralTargetsMap[activeWardTab.toLowerCase()]?.totalPus || 0;
    } else {
        Object.values(structuralTargetsMap).forEach(target => {
            calculatedTotalPus += target.totalPus;
        });
    }
    if (calculatedTotalPus === 0) calculatedTotalPus = 1;

    // Evaluate live unique station coverage mappings matching active viewport layout parameters
    const assignedPusSet = new Set();
    agentsList.forEach(agent => {
        (agent.assigned_pus || []).forEach(pu => {
            const normalizedPu = pu?.toString().trim().toLowerCase();
            if (isFiltered) {
                if (puToWardLookup[normalizedPu] === activeWardTab.toLowerCase()) {
                    assignedPusSet.add(normalizedPu);
                }
            } else {
                assignedPusSet.add(normalizedPu);
            }
        });
    });

    const totalAgentsFound = assignedPusSet.size;
    const agentSaturation = Math.min(Math.round((totalAgentsFound / calculatedTotalPus) * 100), 100) || 0;

    // Extract unique scanned polling unit records safely matching current scope references
    const scannedPusSet = new Set();
    targetedAudits.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    // Intersect tracking records to match only targets inside assigned deployment structure bounds
    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => assignedPusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, calculatedTotalPus);
    const submissionSaturation = Math.min(Math.round((verifiedScannedCount / calculatedTotalPus) * 100), 100) || 0;

    const activityLogs = isFiltered
        ? allActivityLogs.filter(l => l.ward_name?.toString().toLowerCase() === activeWardTab.toLowerCase())
        : allActivityLogs;

    return (
        <div className="min-h-screen bg-[#FAF6F0] selection:bg-[#9A6749]/20 p-4 sm:p-6 lg:p-8 text-[#291C14]">

            {/* Institutional Information Header */}
            <header className="max-w-7xl mx-auto mb-6 bg-white p-6 rounded-2xl shadow-sm border border-[#8A7968]/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200 hover:border-[#8A7968]/40">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#9A6749] animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[#8A7968]">Ward Operational Command</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight mt-1 text-[#291C14]">
                        {supervisorName.toUpperCase()}
                    </h1>
                    <p className="text-xs font-bold text-[#9A6749] uppercase tracking-wider mt-0.5">
                        Assigned Wards: <span className="text-[#291C14] underline decoration-[#9A6749] decoration-2 font-black">{assignedWardsArray.join(', ').toUpperCase()}</span>
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

            {/* Interactive Ward Navigation Filter Tabs */}
            <nav className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 border-b border-[#8A7968]/20 pb-3">
                <a
                    href="?"
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeWardTab === 'all'
                        ? 'bg-[#291C14] text-white shadow-sm'
                        : 'bg-white text-[#8A7968] hover:text-[#291C14] border border-[#8A7968]/15'
                        }`}
                >
                    💼 All Assigned Wards ({assignedWardsArray.length})
                </a>
                {assignedWardsArray.map((ward) => (
                    <a
                        key={ward}
                        href={`?ward=${encodeURIComponent(ward.toLowerCase())}`}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeWardTab === ward.toLowerCase()
                            ? 'bg-[#9A6749] text-white shadow-sm'
                            : 'bg-white text-[#8A7968] hover:text-[#291C14] border border-[#8A7968]/15'
                            }`}
                    >
                        📍 {ward.toUpperCase()}
                    </a>
                ))}
            </nav>

            <main className="max-w-7xl mx-auto space-y-8">

                {/* Staffing Deployment Coverage Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

                    {/* Card 1: Managed Boundaries Info */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#291C14] transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Current Station Scope</p>
                        <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2 uppercase">
                            {isFiltered ? `${activeWardTab}` : `${assignedWardsArray.length} Wards`}
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1 uppercase">
                            {calculatedTotalPus} Expected Polling Stations
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-[#291C14] h-full transition-all duration-500 ease-out" style={{ width: `100%` }} />
                        </div>
                    </div>

                    {/* Card 2: Polling Agents Allocation */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#9A6749] transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Polling Agent Assignment</p>
                        <p className="text-2xl font-black tracking-tight text-[#291C14] mt-2">
                            {agentSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {totalAgentsFound} active stations covered of {calculatedTotalPus} total units
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-[#9A6749] h-full transition-all duration-500 ease-out" style={{ width: `${agentSaturation}%` }} />
                        </div>
                    </div>

                    {/* Card 3: Form Sheet Logs Ingestion */}
                    <div className="bg-white p-5 rounded-2xl border border-[#8A7968]/20 relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600 transition-all group-hover:w-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8A7968]">Result Transmission Status</p>
                        <p className="text-2xl font-black tracking-tight text-emerald-600 mt-2">
                            {submissionSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-[#8A7968] mt-1">
                            {verifiedScannedCount} verified scans parsed out of {calculatedTotalPus} units
                        </p>
                        <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-3 overflow-hidden border border-[#8A7968]/10">
                            <div className="bg-emerald-600 h-full transition-all duration-500 ease-out" style={{ width: `${submissionSaturation}%` }} />
                        </div>
                    </div>
                </div>

                {/* Regional Matrices Mapping Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Polling Agents Directory Table */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#8A7968]/20 shadow-sm transition-all">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-[#FAF6F0] pb-4 gap-2">
                            <div>
                                <h3 className="text-xs font-black tracking-wider text-[#291C14] uppercase">
                                    POLLING AGENT DIRECTORY {isFiltered && `— WARD ${activeWardTab.toUpperCase()}`}
                                </h3>
                                <p className="text-[11px] font-medium text-[#8A7968] mt-0.5">Onboarded field agents managing down to the station units</p>
                            </div>

                            {/* Account Creation Access Link */}
                            <Link href="/dashboard/ward/coordinators" className="bg-[#291C14] hover:bg-[#4A3B32] text-white text-[10px] font-bold px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap shadow-sm active:scale-[0.98]">
                                Create Agent Account
                            </Link>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-[#8A7968]/10">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#8A7968]/20 text-[10px] font-black text-[#8A7968] uppercase tracking-wider bg-[#FAF6F0]">
                                        <th className="p-3.5">Agent Name</th>
                                        <th className="p-3.5">Assigned Ward</th>
                                        <th className="p-3.5">Target Station Unit(s)</th>
                                        <th className="p-3.5">Contact Line</th>
                                        <th className="p-3.5 text-right">Registration Date</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-medium divide-y divide-[#FAF6F0]">
                                    {agentsList && agentsList.length > 0 ? (
                                        agentsList.map((agent) => (
                                            <tr key={agent.id} className="hover:bg-[#FAF6F0]/50 transition-colors duration-150 text-[#291C14]">
                                                <td className="p-3.5 font-bold">{agent.full_name}</td>
                                                <td className="p-3.5 uppercase font-black text-[10px] text-[#9A6749]">
                                                    {agent.assigned_wards && agent.assigned_wards.length > 0
                                                        ? agent.assigned_wards.join(', ')
                                                        : activeWardTab.toUpperCase()}
                                                </td>
                                                <td className="p-3.5 font-semibold text-[#4A3B32]">
                                                    {agent.assigned_pus && agent.assigned_pus.length > 0
                                                        ? agent.assigned_pus.join(', ').toUpperCase()
                                                        : 'No Stations Bound'}
                                                </td>
                                                <td className="p-3.5 text-[#8A7968] font-mono">{agent.phone || '—'}</td>
                                                <td className="p-3.5 text-right font-bold text-[#8A7968]">
                                                    {agent.created_at ? new Date(agent.created_at).toLocaleDateString('en-GB') : '—'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center font-bold text-[#8A7968] bg-[#FAF6F0]/20 italic">
                                                No Polling Agents currently registered under your chosen ward scope structure.
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
                                System Activity Logs {isFiltered && `— ${activeWardTab.toUpperCase()}`}
                            </h3>
                            <p className="text-[11px] font-medium text-[#8A7968] mb-6">Real-time operational verification feed</p>

                            <div className="space-y-4">
                                {activityLogs && activityLogs.length > 0 ? (
                                    activityLogs.map((log) => (
                                        <div key={log.id} className="p-3.5 bg-[#FAF6F0] rounded-xl border border-[#8A7968]/15 text-xs transition-all hover:border-[#8A7968]/30">
                                            <div className="flex justify-between font-black text-[9px] uppercase tracking-wider text-[#8A7968] mb-1.5">
                                                <span className={log.event_type === 'ALERT' ? 'text-amber-700' : 'text-[#9A6749]'}>
                                                    {log.ward_name?.toUpperCase() || 'UNIT'} • {log.event_type?.replace(/_/g, ' ')}
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
                                            No system logs recorded inside this ward scope framework.
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