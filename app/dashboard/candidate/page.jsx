import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import {
    User,
    MapPin,
    Users,
    FileText,
    Activity,
    CheckCircle2,
    Briefcase,
    ShieldCheck
} from 'lucide-react';

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
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Safe to ignore in Server Components if middleware handles session refreshes
                    }
                },
            },
        }
    );

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/login');
    }

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

    const fullName = user.user_metadata?.full_name || 'Hon. Candidate';
    const contestedSeat = user.user_metadata?.contesting_seat || '';
    const assignedState = user.user_metadata?.assigned_state || '';
    const assignedLga = user.user_metadata?.assigned_lga || '';
    const assignedWard = user.user_metadata?.assigned_ward || '';

    const senatorialDistrict = user.user_metadata?.senatorial_district || '';
    const federalConstituency = user.user_metadata?.federal_constituency || '';
    const stateConstituency = user.user_metadata?.state_constituency || '';

    const safeState = assignedState || '';

    let supervisorsQuery = supabase.from('profiles').select('id, full_name, assigned_lgas, assigned_wards, created_at, role').eq('role', 'LGA_SUPERVISOR').eq('candidate_id', user.id);
    let coordinatorsQuery = supabase.from('profiles').select('id, full_name, assigned_lgas, assigned_wards, created_at, role').eq('role', 'WARD_SUPERVISOR').eq('candidate_id', user.id);
    let agentsQuery = supabase.from('profiles').select('id, full_name, assigned_lgas, assigned_wards, assigned_pus, created_at, role').eq('role', 'POLLING_UNIT_AGENT').eq('candidate_id', user.id);

    if (contestedSeat === 'governor' || contestedSeat === 'president') {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'senate' && senatorialDistrict) {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'house_of_reps' && federalConstituency) {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'house_of_assembly' && stateConstituency) {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    } else if (contestedSeat === 'chairman' && assignedLga) {
        supervisorsQuery = supervisorsQuery.contains('assigned_lgas', [assignedLga]);
        coordinatorsQuery = coordinatorsQuery.contains('assigned_lgas', [assignedLga]);
        agentsQuery = agentsQuery.contains('assigned_lgas', [assignedLga]);
    } else {
        supervisorsQuery = supervisorsQuery.eq('assigned_state', safeState);
        coordinatorsQuery = coordinatorsQuery.eq('assigned_state', safeState);
        agentsQuery = agentsQuery.eq('assigned_state', safeState);
    }

    const [resSupervisors, resCoordinators, resAgents] = await Promise.all([
        supervisorsQuery,
        coordinatorsQuery,
        agentsQuery
    ]);

    const activeSupervisorsList = resSupervisors.data || [];
    const activeCoordinatorsList = resCoordinators.data || [];
    const activeAgentsList = resAgents.data || [];

    let activeAuditsList = [];
    if (activeAgentsList.length > 0) {
        const activeAgentIds = activeAgentsList.map(agent => agent.id).filter(Boolean);

        if (activeAgentIds.length > 0) {
            const { data, error } = await supabase
                .from('document_audits')
                .select('pu_id, pu_code, agent_id')
                .in('agent_id', activeAgentIds);

            if (!error) activeAuditsList = data || [];
        }
    }

    const assignedLgasSet = new Set(activeSupervisorsList.flatMap(p => p.assigned_lgas || []).map(l => l?.trim().toLowerCase()).filter(Boolean));
    const assignedWardsSet = new Set(activeCoordinatorsList.flatMap(p => p.assigned_wards || []).map(w => w?.trim().toLowerCase()).filter(Boolean));
    const assignedPusSet = new Set(activeAgentsList.flatMap(p => p.assigned_pus || []).map(pu => pu?.trim().toLowerCase()).filter(Boolean));

    const scannedPusSet = new Set();
    activeAuditsList.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    let targets = { totalLgas: 0, totalWards: 0, totalPus: 0 };
    let matrixData = null;

    try {
        const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const searchParams = new URLSearchParams();
        if (safeState) searchParams.set('state', safeState);
        if (assignedLga) searchParams.set('lga', assignedLga);
        if (assignedWard) searchParams.set('ward', assignedWard);
        if (senatorialDistrict) searchParams.set('senatorial_district', senatorialDistrict);
        if (federalConstituency) searchParams.set('fed_constituency', federalConstituency);
        if (stateConstituency) searchParams.set('state_constituency', stateConstituency);

        const matrixApiResponse = await fetch(`${origin}/api/locations?${searchParams.toString()}`, { cache: 'no-store' });

        if (matrixApiResponse.ok) {
            matrixData = await matrixApiResponse.json();
            if (matrixData.pollingUnits) {
                targets = { totalLgas: 0, totalWards: 1, totalPus: matrixData.pollingUnits.length || 0 };
            } else if (matrixData.wards && !assignedWard) {
                const calculatedPuTotal = matrixData.wards.reduce((acc, w) => acc + (w.puCount || w.pollingUnitsCount || w.total_pus || 0), 0);
                targets = { totalLgas: 0, totalWards: matrixData.wards.length || 0, totalPus: calculatedPuTotal || 0 };
            } else if (matrixData.lgas) {
                targets = {
                    totalLgas: matrixData.lgas.length || 0,
                    totalWards: matrixData.lgas.reduce((acc, l) => acc + (l.wardCount || l.total_wards || 0), 0),
                    totalPus: matrixData.lgas.reduce((acc, l) => acc + (l.puCount || l.total_pus || 0), 0)
                };
            }
        }
    } catch (apiError) {
        console.error("Failed to query baseline total metrics from internal data endpoint:", apiError);
    }

    // Baseline fallback sizing checks based on the location footprint
    const isSubLgaSeat = contestedSeat === 'house_of_assembly' || targets.totalLgas === 0;
    if (!isSubLgaSeat && targets.totalLgas === 0 && matrixData?.lgas) targets.totalLgas = matrixData.lgas.length || 1;
    if (targets.totalWards === 0 && matrixData?.wards) targets.totalWards = matrixData.wards.length || 1;
    if (targets.totalPus === 0 && matrixData?.pollingUnits) targets.totalPus = matrixData.pollingUnits.length || 1;
    if (targets.totalPus === 0) targets.totalPus = Math.max(assignedPusSet.size, 1);

    const totalSupervisorsFound = assignedLgasSet.size;
    const totalCoordinatorsFound = assignedWardsSet.size;
    const totalAgentsFound = assignedPusSet.size;

    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => assignedPusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, targets.totalPus);

    const lgaSaturation = targets.totalLgas > 0 ? Math.min(Math.round((totalSupervisorsFound / targets.totalLgas) * 100), 100) : 0;
    const wardSaturation = targets.totalWards > 0 ? Math.min(Math.round((totalCoordinatorsFound / targets.totalWards) * 100), 100) : 0;
    const agentSaturation = targets.totalPus > 0 ? Math.min(Math.round((totalAgentsFound / targets.totalPus) * 100), 100) : 0;
    const scanSaturation = targets.totalPus > 0 ? Math.min(Math.round((verifiedScannedCount / targets.totalPus) * 100), 100) : 0;

    const recentActivityLog = [
        ...activeSupervisorsList.map(p => ({
            id: `sup-${p.id}`,
            event_type: 'SUPERVISOR_ONBOARDED',
            description: `LGA Supervisor "${p.full_name || 'Staff'}" registered and mapped to zones: ${p.assigned_lgas?.join(', ') || 'None Assigned'}.`,
            created_at: p.created_at
        })),
        ...activeCoordinatorsList.map(p => ({
            id: `coord-${p.id}`,
            event_type: 'COORDINATOR_ONBOARDED',
            description: `Ward Coordinator "${p.full_name || 'Staff'}" deployed to assigned sectors: ${p.assigned_wards?.join(', ') || 'None Assigned'}.`,
            created_at: p.created_at
        })),
        ...activeAgentsList.map(p => ({
            id: `agent-${p.id}`,
            event_type: 'AGENT_DEPLOYED',
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

            {/* Header Identity Bar */}
            <header className="max-w-7xl mx-auto mb-8 bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-[#F9FAFB] border border-[#6B7280]/20 rounded-lg text-[#1E3A8A]">
                        <User className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Candidate Management Console</span>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight mt-0.5 text-[#111827]">
                            {fullName}
                        </h1>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-[#1E3A8A]">
                            <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Contested Office:</span>
                            <span className="text-[#111827] font-semibold capitalize">{contestedSeat?.replace(/_/g, ' ')}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-[#F9FAFB] border border-[#6B7280]/20 px-4 py-3 rounded-lg text-left md:text-right min-w-[240px] flex items-start md:items-center gap-3 md:justify-end">
                    <MapPin className="h-4 w-4 text-[#1E3A8A] mt-0.5 md:mt-0 flex-shrink-0" />
                    <div>
                        <span className="block text-[9px] font-bold uppercase text-[#6B7280] tracking-wider">Assigned Electoral Scope</span>
                        <span className="text-xs font-semibold text-[#111827] block mt-0.5 leading-normal">
                            {assignedState} State
                            {assignedLga && ` • ${assignedLga} LGA`}
                            {assignedWard && ` • ${assignedWard} Ward`}
                            {stateConstituency && ` [${stateConstituency}]`}
                            {senatorialDistrict && ` (${senatorialDistrict} Dist.)`}
                            {federalConstituency && ` (${federalConstituency})`}
                        </span>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-8">

                {/* Coverage Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Card 1 */}
                    {!isSubLgaSeat ? (
                        <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between text-[#6B7280]">
                                    <span className="text-xs font-bold uppercase tracking-wider">LGA Supervisor Coverage</span>
                                    <Users className="h-4 w-4 text-[#1E3A8A]" />
                                </div>
                                <p className="text-3xl font-bold tracking-tight text-[#111827] mt-3">{lgaSaturation}%</p>
                            </div>
                            <div className="mt-4">
                                <p className="text-[11px] text-[#6B7280] font-medium">{totalSupervisorsFound} of {targets.totalLgas} areas verified</p>
                                <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                    <div className="bg-[#1E3A8A] h-full transition-all duration-500 ease-out" style={{ width: `${lgaSaturation}%` }} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#ffffff]/50 p-5 rounded-xl border border-[#6B7280]/10 shadow-sm flex flex-col justify-center text-center py-8">
                            <MapPin className="h-4 w-4 text-[#6B7280]/60 mx-auto mb-1.5" />
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">LGA Status Scope</p>
                            <p className="text-xs font-semibold text-[#6B7280] mt-0.5">Sub-LGA parameters mapped</p>
                        </div>
                    )}

                    {/* Card 2 */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Ward Coordinator Coverage</span>
                                <Users className="h-4 w-4 text-[#172554]" />
                            </div>
                            <p className="text-3xl font-bold tracking-tight text-[#111827] mt-3">{wardSaturation}%</p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{totalCoordinatorsFound} of {targets.totalWards} wards assigned</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#172554] h-full transition-all duration-500 ease-out" style={{ width: `${wardSaturation}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 3 */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Polling Agent Coverage</span>
                                <Users className="h-4 w-4 text-[#16A34A]" />
                            </div>
                            <p className="text-3xl font-bold tracking-tight text-[#111827] mt-3">{agentSaturation}%</p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{totalAgentsFound} of {targets.totalPus} units deployed</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#16A34A] h-full transition-all duration-500 ease-out" style={{ width: `${agentSaturation}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Card 4 */}
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between text-[#6B7280]">
                                <span className="text-xs font-bold uppercase tracking-wider">Result Sheet Processing</span>
                                <FileText className="h-4 w-4 text-[#D97706]" />
                            </div>
                            <p className="text-3xl font-bold tracking-tight text-[#111827] mt-3">{scanSaturation}%</p>
                        </div>
                        <div className="mt-4">
                            <p className="text-[11px] text-[#6B7280] font-medium">{verifiedScannedCount} of {targets.totalPus} sheets cached</p>
                            <div className="w-full bg-[#F9FAFB] h-1.5 rounded-full mt-2 overflow-hidden border border-[#6B7280]/10">
                                <div className="bg-[#D97706] h-full transition-all duration-500 ease-out" style={{ width: `${scanSaturation}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Breakdown Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left Grid: Workforce Roster Count Breakdown Box */}
                    <div className="bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col h-[480px]">
                        <div className="flex-shrink-0 mb-4 pb-3 border-b border-[#F9FAFB]">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck className="h-4 w-4 text-[#1E3A8A]" />
                                <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">Workforce Directory</h3>
                            </div>
                            <p className="text-[11px] font-medium text-[#6B7280]">Active accounts under your command</p>
                        </div>

                        {/* Micro-cards showcasing raw staff counts directly */}
                        <div className="space-y-4 overflow-y-auto flex-grow pr-1.5 custom-scroll">

                            <div className="p-4 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">LGA Supervisors</span>
                                    <span className="text-lg font-black text-[#111827]">{activeSupervisorsList.length}</span>
                                </div>
                                <p className="text-[11px] text-[#6B7280] leading-normal">Responsible for localized local government logistics and cross-ward monitoring operations.</p>
                            </div>

                            <div className="p-4 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#172554]">Ward Coordinators</span>
                                    <span className="text-lg font-black text-[#111827]">{activeCoordinatorsList.length}</span>
                                </div>
                                <p className="text-[11px] text-[#6B7280] leading-normal">Assigned directly to strategic target tracking partitions and handling downline agent deployments.</p>
                            </div>

                            <div className="p-4 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#16A34A]">Polling Agents</span>
                                    <span className="text-lg font-black text-[#111827]">{activeAgentsList.length}</span>
                                </div>
                                <p className="text-[11px] text-[#6B7280] leading-normal">Field operators stationed inside separate localized polling unit stations across the territory.</p>
                            </div>

                        </div>
                    </div>

                    {/* Right Grid: Expanded Recent System Activity Logs */}
                    <div className="lg:col-span-2 bg-[#ffffff] p-6 rounded-xl border border-[#6B7280]/20 shadow-sm flex flex-col h-[480px]">
                        <div className="flex-shrink-0 mb-4 pb-3 border-b border-[#F9FAFB]">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity className="h-4 w-4 text-[#1E3A8A]" />
                                <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">Recent Activity Logs</h3>
                            </div>
                            <p className="text-[11px] font-medium text-[#6B7280]">Latest logged field management updates</p>
                        </div>

                        {/* Scroll Container */}
                        <div className={`space-y-3 overflow-y-auto flex-grow pr-1.5 ${customScrollbarClasses}`}>
                            {recentActivityLog && recentActivityLog.length > 0 ? (
                                recentActivityLog.map((log) => (
                                    <div key={log.id} className="p-3 bg-[#F9FAFB] rounded-lg border border-[#6B7280]/15 text-xs transition-all hover:border-[#1E3A8A]/30">
                                        <div className="flex justify-between font-bold text-[9px] uppercase tracking-wider text-[#6B7280] mb-1.5">
                                            <span className="flex items-center gap-1">
                                                {log.event_type === 'AGENT_DEPLOYED' ? (
                                                    <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                                                ) : (
                                                    <User className="h-3 w-3 text-[#1E3A8A]" />
                                                )}
                                                {log.event_type?.replace(/_/g, ' ')}
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
                                        No automated system logs found.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}