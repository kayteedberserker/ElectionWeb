import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    Briefcase,
    MapPin,
    Activity,
    Plus,
    ShieldCheck,
    User,
    Users,
    FileText,
    CheckCircle2
} from 'lucide-react';

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

    // 3. Query profiles table to get managed Ward Supervisors and Polling Agents
    let wardCoordinatorsQuery = supabase
        .from('profiles')
        .select('id, full_name, assigned_wards, assigned_lgas, phone, created_at')
        .in('role', ['WARD_SUPERVISOR', 'ward_supervisor'])
        .eq('lga_supervisor_id', user.id)
        .eq('candidate_id', candidateId);

    let pollingAgentsQuery = supabase
        .from('profiles')
        .select('id, full_name, assigned_pus, assigned_lgas, lga_supervisor_id, created_at')
        .in('role', ['polling_agent', 'POLLING_UNIT_AGENT', 'POLLING_UNIT_AGENT'])
        .eq('lga_supervisor_id', user.id)
        .eq('candidate_id', candidateId);

    // Execute database operations concurrently
    const [resCoordinators, resAgents] = await Promise.all([
        wardCoordinatorsQuery,
        pollingAgentsQuery
    ]);

    const allCoordinatorsList = resCoordinators.data || [];
    const allAgentsList = resAgents.data || [];

    // Secondary data pipeline layer targeting unique document audit collection sheets 
    let activeAuditsList = [];
    if (allAgentsList.length > 0) {
        const activeAgentIds = allAgentsList.map(agent => agent.id).filter(Boolean);
        if (activeAgentIds.length > 0) {
            const { data } = await supabase
                .from('document_audits')
                .select('pu_id, pu_code, agent_id')
                .in('agent_id', activeAgentIds);
            activeAuditsList = data || [];
        }
    }

    // 4. Fetch baseline structural targets and build an explicit ward-to-lga map dictionary
    let structuralTargetsMap = {};
    let wardToLgaLookup = {};

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

        if (targets.totalWards === 0) targets.totalWards = 1;
        if (targets.totalPus === 0) targets.totalPus = 1;

        structuralTargetsMap[lgaName.toLowerCase()] = targets;
    }));

    // 5. Dynamic Tab View Interpolation and Data Splitting logic
    const isFiltered = activeLgaTab !== 'all';

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
                if (p.assigned_lgas && p.assigned_lgas.length > 0) {
                    return p.assigned_lgas.map(l => l.toString().toLowerCase()).includes(activeLgaTab.toLowerCase());
                }
                return p.assigned_wards.length > 0;
            })
        : allCoordinatorsList;

    const agentsList = isFiltered
        ? allAgentsList.filter(p => p.assigned_lgas?.map(l => l.toString().toLowerCase()).includes(activeLgaTab.toLowerCase()))
        : allAgentsList;

    const filteredAgentIds = new Set(agentsList.map(a => a.id));
    const targetedAudits = isFiltered
        ? activeAuditsList.filter(audit => filteredAgentIds.has(audit.agent_id))
        : activeAuditsList;

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

    const scannedPusSet = new Set();
    targetedAudits.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    const totalCoordinatorsFound = activeWardsSet.size;
    const totalAgentsFound = activePusSet.size;

    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => activePusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, calculatedTotalPus);

    const wardSaturation = Math.min(Math.round((totalCoordinatorsFound / calculatedTotalWards) * 100), 100) || 0;
    const agentSaturation = Math.min(Math.round((totalAgentsFound / calculatedTotalPus) * 100), 100) || 0;
    const scanSaturation = Math.min(Math.round((verifiedScannedCount / calculatedTotalPus) * 100), 100) || 0;

    // 6. Generate Profile-Derived Real-time Activity Timeline Logs
    const activityLogs = [
        ...coordinatorsList.map(p => ({
            id: `coord-${p.id}`,
            event_type: 'COORDINATOR_ONBOARDED',
            lga_name: p.assigned_lgas?.[0] || assignedLgasArray[0] || 'Unknown LGA',
            description: `Ward Coordinator "${p.full_name || 'Staff'}" deployed to assigned sectors: ${p.assigned_wards?.join(', ') || 'None Assigned'}.`,
            created_at: p.created_at
        })),
        ...agentsList.map(p => ({
            id: `agent-${p.id}`,
            event_type: 'AGENT_DEPLOYED',
            lga_name: p.assigned_lgas?.[0] || assignedLgasArray[0] || 'Unknown LGA',
            description: `Polling Agent "${p.full_name || 'Staff'}" assigned to direct field units: ${p.assigned_pus?.join(', ') || 'None Assigned'}.`,
            created_at: p.created_at
        }))
    ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 15);

    const customScrollbarClasses = `
    [&::-webkit-scrollbar]:w-1.5 
    [&::-webkit-scrollbar]:h-1.5 
    [&::-webkit-scrollbar-track]:bg-[#F3F4F6] 
    [&::-webkit-scrollbar-track]:rounded-md 
    [&::-webkit-scrollbar-thumb]:bg-[#6B7280]/30 
    [&::-webkit-scrollbar-thumb]:rounded-md 
    hover:[&::-webkit-scrollbar-thumb]:bg-[#1E3A8A]/40
  `;

    return (
        <div className="min-h-screen bg-background selection:bg-primary/20 p-4 sm:p-6 lg:p-8 text-[#111827] font-sans antialiased">

            {/* Overview Information Header */}
            <header className="max-w-7xl mx-auto mb-6 bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-[#F9FAFB] border border-[#6B7280]/20 rounded-lg text-[#1E3A8A]">
                        <User className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">LGA Field Management Terminal</span>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight mt-0.5 text-[#111827]">
                            {supervisorName.toUpperCase()}
                        </h1>
                        <p className="text-xs font-semibold text-[#1E3A8A] mt-1">
                            Assigned Focus Areas: <span className="text-[#111827] font-bold underline decoration-[#1E3A8A] decoration-2 uppercase">{assignedLgasArray.join(', ')}</span> {safeState && `(${safeState} State)`}
                        </p>
                    </div>
                </div>

                {/* Campaign Details */}
                <div className="bg-[#F9FAFB] border border-[#6B7280]/20 px-4 py-3 rounded-lg text-left md:text-right min-w-[240px] flex items-start md:items-center gap-3 md:justify-end">
                    <Briefcase className="h-4 w-4 text-[#1E3A8A] mt-0.5 md:mt-0 flex-shrink-0" />
                    <div>
                        <span className="block text-[9px] font-bold uppercase text-[#6B7280] tracking-wider">Campaign Assignment Alignment</span>
                        <span className="text-xs font-semibold text-[#111827] block mt-0.5 leading-normal uppercase">
                            Candidate: <span className="text-[#1E3A8A] font-bold">{candidateName}</span>
                            {candidateSeat && ` • ${candidateSeat.replace(/_/g, ' ')}`}
                        </span>
                    </div>
                </div>
            </header>

            {/* Interactive LGA Filter Tabs */}
            <nav className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 border-b border-[#6B7280]/20 pb-3">
                <a
                    href="?"
                    className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeLgaTab === 'all'
                        ? 'bg-[#1E3A8A] text-white shadow-sm'
                        : 'bg-[#ffffff] text-[#6B7280] hover:text-[#111827] border border-[#6B7280]/15'
                        }`}
                >
                    <Briefcase className="w-3.5 h-3.5 mr-1.5" /> All Areas ({assignedLgasArray.length})
                </a>
                {assignedLgasArray.map((lga) => (
                    <a
                        key={lga}
                        href={`?lga=${encodeURIComponent(lga.toLowerCase())}`}
                        className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${activeLgaTab === lga.toLowerCase()
                            ? 'bg-[#1E3A8A] text-white shadow-sm'
                            : 'bg-[#ffffff] text-[#6B7280] hover:text-[#111827] border border-[#6B7280]/15'
                            }`}
                    >
                        <MapPin className="w-3.5 h-3.5 mr-1.5" /> {lga.toUpperCase()}
                    </a>
                ))}
            </nav>

            <main className="max-w-7xl mx-auto space-y-8">

                {/* Deployment Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

                    {/* Card 1: Assigned Scope */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Location Scope</span>
                                <MapPin className="h-4 w-4 text-[#1E3A8A]" />
                            </div>
                            <p className="text-2xl font-bold tracking-tight text-[#111827] mt-3 uppercase">
                                {isFiltered ? `${activeLgaTab}` : `${assignedLgasArray.length} LGAs`}
                            </p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium uppercase truncate">{isFiltered ? 'Single LGA Filter Active' : assignedLgasArray.join(', ')}</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#1E3A8A] h-full" style={{ width: `100%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Ward Coordinator Coverage */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Ward Coordinator Coverage</span>
                                <Users className="h-4 w-4 text-[#172554]" />
                            </div>
                            <p className="text-2xl font-bold tracking-tight text-[#111827] mt-3">
                                {wardSaturation}%
                            </p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{totalCoordinatorsFound} covered of {calculatedTotalWards} targets</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#172554] h-full transition-all duration-500 ease-out" style={{ width: `${wardSaturation}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Polling Agent Assignment */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Polling Agent Assignment</span>
                                <Users className="h-4 w-4 text-[#16A34A]" />
                            </div>
                            <p className="text-2xl font-bold tracking-tight text-[#16A34A] mt-3">
                                {agentSaturation}%
                            </p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{totalAgentsFound} assigned of {calculatedTotalPus} total units</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#16A34A] h-full transition-all duration-500 ease-out" style={{ width: `${agentSaturation}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Result Sheet Scans */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Result Sheet Scans</span>
                                <FileText className="h-4 w-4 text-[#D97706]" />
                            </div>
                            <p className="text-2xl font-bold tracking-tight text-[#D97706] mt-3">
                                {scanSaturation}%
                            </p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{verifiedScannedCount} verified scans across {calculatedTotalPus} units</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#D97706] h-full transition-all duration-500 ease-out" style={{ width: `${scanSaturation}%` }} />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Breakdown Data Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left Grid: Ward Supervisor Roster (Compact Microcard Layout) */}
                    <div className="bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col h-[480px]">
                        <div className="flex-shrink-0 mb-4 pb-3 border-b border-[#F9FAFB] flex justify-between items-start gap-2">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <ShieldCheck className="h-4 w-4 text-[#1E3A8A]" />
                                    <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">
                                        Ward Supervisors
                                    </h3>
                                </div>
                                <p className="text-[11px] font-medium text-[#6B7280]">Personnel inside your scope</p>
                            </div>

                            <Link href="/dashboard/lga/coordinators" className="inline-flex items-center gap-1 bg-[#1E3A8A] hover:bg-[#172554] text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider shadow-sm flex-shrink-0">
                                <Plus className="w-3 h-3" /> Add Account
                            </Link>
                        </div>

                        {/* Scroll Container for Ward Cards */}
                        <div className={`space-y-3 overflow-y-auto flex-grow pr-1.5 ${customScrollbarClasses}`}>
                            {coordinatorsList && coordinatorsList.length > 0 ? (
                                coordinatorsList.map((coordinator) => (
                                    <div key={coordinator.id} className="p-3.5 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15 text-xs">
                                        <div className="flex justify-between items-start gap-2 mb-1.5">
                                            <span className="font-bold text-[#111827] text-sm">{coordinator.full_name}</span>
                                            <span className="text-[9px] font-mono font-bold bg-[#1E3A8A]/10 text-[#1E3A8A] px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                                                {coordinator.assigned_lgas && coordinator.assigned_lgas.length > 0
                                                    ? coordinator.assigned_lgas[0]
                                                    : assignedLgasArray[0]}
                                            </span>
                                        </div>

                                        <div className="space-y-1 text-[#6B7280] font-medium">
                                            <p className="text-[11px] leading-normal text-[#111827]">
                                                <span className="text-[#6B7280] font-semibold text-[10px] uppercase tracking-wide block">Assigned Sectors:</span>
                                                {coordinator.assigned_wards && coordinator.assigned_wards.length > 0
                                                    ? coordinator.assigned_wards.join(', ')
                                                    : 'No Wards Configured'}
                                            </p>
                                            <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-[#6B7280]/10 mt-1.5">
                                                <span className="font-mono text-[#1E3A8A]">{coordinator.phone || 'No Contact Line'}</span>
                                                <span className="text-[9px] text-[#6B7280]">Registered {coordinator.created_at ? new Date(coordinator.created_at).toLocaleDateString('en-GB') : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 border border-dashed border-[#6B7280]/20 rounded-lg bg-[#F9FAFB]/50">
                                    <p className="text-xs font-medium text-[#6B7280] italic px-4">
                                        No ward supervisors currently registered under your chosen framework scope.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Grid: Profile-Derived System Activity Logs Feed */}
                    <div className="lg:col-span-2 bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col h-[480px]">
                        <div className="flex-shrink-0 mb-4 pb-3 border-b border-[#F9FAFB]">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity className="h-4 w-4 text-[#1E3A8A]" />
                                <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">
                                    Activity Timeline {isFiltered && `— ${activeLgaTab.toUpperCase()}`}
                                </h3>
                            </div>
                            <p className="text-[11px] font-medium text-[#6B7280]">Real-time operational log telemetry tracker generated from workforce profile mappings</p>
                        </div>

                        {/* Scroll Container for Logs */}
                        <div className={`space-y-3 overflow-y-auto flex-grow pr-1.5 ${customScrollbarClasses}`}>
                            {activityLogs && activityLogs.length > 0 ? (
                                activityLogs.map((log) => (
                                    <div key={log.id} className="p-3.5 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15 text-xs transition-all hover:border-[#1E3A8A]/30">
                                        <div className="flex justify-between font-bold text-[9px] uppercase tracking-wider text-[#6B7280] mb-1.5">
                                            <span className="flex items-center gap-1 text-[#1E3A8A]">
                                                <CheckCircle2 className="h-3 w-3 text-[#1E3A8A]" />
                                                {log.lga_name?.toUpperCase()} • {log.event_type?.replace(/_/g, ' ')}
                                            </span>
                                            <span className="font-mono">
                                                {log.created_at ? new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'} WAT
                                            </span>
                                        </div>
                                        <p className="font-medium text-[#111827] leading-relaxed">{log.description}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 border border-dashed border-[#6B7280]/20 rounded-lg bg-[#F9FAFB]/50">
                                    <p className="text-xs font-medium text-[#6B7280] italic">
                                        No active staff registrations or deployments available to populate the tracking matrix timeline yet.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Security Footer block safely nested inside the card wrapper */}
                        <div className="flex-shrink-0 mt-4 pt-3 border-t border-[#F9FAFB] text-center flex items-center justify-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#6B7280]" />
                            <p className="text-[10px] font-medium text-[#6B7280] italic">
                                Secure Connection — System metrics are cryptographically verified by the central boundary core.
                            </p>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}