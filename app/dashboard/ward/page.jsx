import React from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    Building,
    Users,
    FileText,
    UserPlus,
    Phone,
    Calendar,
    Clock,
    MapPin,
    CheckCircle2,
    AlertCircle,
    Inbox,
    ShieldCheck
} from 'lucide-react';

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

    // 1. Fetch Supervisor's Profile Row
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

    // 2. Fetch the candidate's profile
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
    const { data: resAgents } = await supabase
        .from('profiles')
        .select('id, full_name, assigned_pus, assigned_wards, phone, created_at')
        .in('role', ['polling_agent', 'POLLING_UNIT_AGENT'])
        .eq('candidate_id', candidateId)
        .eq('ward_supervisor_id', user.id);

    const allAgentsList = resAgents || [];

    // Secondary live data pipeline layer targeting explicit document transmission tracking
    let activeAuditsList = [];
    if (allAgentsList.length > 0) {
        const activeAgentIds = allAgentsList.map(agent => agent.id).filter(Boolean);
        if (activeAgentIds.length > 0) {
            // NOTE: Added 'id' and 'created_at' to construct logs later
            const { data, error } = await supabase
                .from('document_audits')
                .select('id, pu_id, pu_code, agent_id, created_at')
                .in('agent_id', activeAgentIds);

            activeAuditsList = data || [];
        }
    }

    // 4. Query Location Master API System for Polling Units
    let structuralTargetsMap = {};
    let puToWardLookup = {};

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

    // ============================================================================
    // SYNTHESIZE CUSTOM ACTIVITY LOGS
    // Combine Agent Onboarding + Document Uploads into a unified timeline feed
    // ============================================================================
    const generatedLogs = [];

    // Map Agent Registrations into logs
    allAgentsList.forEach(agent => {
        if (agent.created_at) {
            generatedLogs.push({
                id: `agent-${agent.id}`,
                event_type: 'NEW_AGENT',
                description: `Agent ${agent.full_name} was registered and onboarded.`,
                ward_name: (agent.assigned_wards && agent.assigned_wards[0]) || 'Unknown',
                created_at: agent.created_at
            });
        }
    });

    // Map Document Audits into logs
    activeAuditsList.forEach(audit => {
        if (audit.created_at) {
            // Try to resolve the ward name from the PU code using our API map
            const code = (audit.pu_code || audit.pu_id || '').toString().trim().toLowerCase();
            const resolvedWard = puToWardLookup[code] || 'Unknown';

            generatedLogs.push({
                id: `audit-${audit.id || Math.random().toString(36).substring(7)}`,
                event_type: 'RESULT_UPLOADED',
                description: `Result document submitted for station ${audit.pu_code || audit.pu_id}.`,
                ward_name: resolvedWard,
                created_at: audit.created_at
            });
        }
    });

    // Sort the synthesized logs by date descending (newest first)
    generatedLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));


    // 5. Dynamic Tab View Interpolation and Data Splitting logic
    const isFiltered = activeWardTab !== 'all';

    // Filter agents based on active tab selection matrix
    const agentsList = isFiltered
        ? allAgentsList.filter(p => {
            const wards = (p.assigned_wards || []).map(w => w.toString().toLowerCase());
            if (wards.includes(activeWardTab.toLowerCase())) return true;

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

    // Evaluate live unique station coverage mappings
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

    // Extract unique scanned polling unit records
    const scannedPusSet = new Set();
    targetedAudits.forEach(audit => {
        if (audit.pu_id) scannedPusSet.add(audit.pu_id.trim().toLowerCase());
        if (audit.pu_code) scannedPusSet.add(audit.pu_code.trim().toLowerCase());
    });

    // Intersect tracking records to match only targets inside assigned deployment structure bounds
    const uniqueScannedJurisdictionCount = Array.from(scannedPusSet).filter(code => assignedPusSet.has(code)).length;
    const verifiedScannedCount = uniqueScannedJurisdictionCount > 0 ? uniqueScannedJurisdictionCount : Math.min(scannedPusSet.size, calculatedTotalPus);
    const submissionSaturation = Math.min(Math.round((verifiedScannedCount / calculatedTotalPus) * 100), 100) || 0;

    // Filter the synthesized logs for the active tab
    const activityLogs = isFiltered
        ? generatedLogs.filter(l => l.ward_name?.toString().toLowerCase() === activeWardTab.toLowerCase())
        : generatedLogs;

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 text-textMain">
            <header className="max-w-7xl mx-auto mb-6 bg-card p-6 rounded-2xl shadow-sm border border-textMuted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-200">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-textMuted bg-background px-2 py-0.5 rounded border border-textMuted/10">
                            Ward Management Dashboard
                        </span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-textMain">
                        {supervisorName.toUpperCase()}
                    </h1>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Assigned Wards: {' '}
                        <span className="text-textMain underline decoration-primary decoration-2 font-black pl-1">
                            {assignedWardsArray.join(', ').toUpperCase()}
                        </span>
                    </p>
                </div>

                <div className="bg-background border border-textMuted/20 px-4 py-2.5 rounded-xl text-left sm:text-right min-w-[220px] shadow-inner">
                    <span className="block text-[9px] font-bold uppercase text-textMuted tracking-widest">Campaign Assignment</span>
                    <span className="text-xs font-bold text-textMain uppercase tracking-wide block mt-0.5 leading-relaxed">
                        Candidate: <span className="font-black text-primary">{candidateName}</span>
                        {candidateSeat && ` — ${candidateSeat.replace(/_/g, ' ')}`}
                    </span>
                </div>
            </header>

            <nav className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 border-b border-textMuted/20 pb-3">
                <a
                    href="?"
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 ${activeWardTab === 'all'
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-card text-textMuted hover:text-textMain border border-textMuted/20'
                        }`}
                >
                    All Assigned Wards ({assignedWardsArray.length})
                </a>
                {assignedWardsArray.map((ward) => (
                    <a
                        key={ward}
                        href={`?ward=${encodeURIComponent(ward.toLowerCase())}`}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 ${activeWardTab === ward.toLowerCase()
                            ? 'bg-gold text-white shadow-sm'
                            : 'bg-card text-textMuted hover:text-textMain border border-textMuted/20'
                            }`}
                    >
                        {ward.toUpperCase()}
                    </a>
                ))}
            </nav>

            <main className="max-w-7xl mx-auto space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div className="bg-card p-5 rounded-2xl border border-textMuted/20 relative overflow-hidden shadow-sm transition-all duration-300 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary transition-all group-hover:w-2" />
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold uppercase tracking-wider text-textMuted">Polling Station Scope</p>
                            <Building className="w-4 h-4 text-textMuted opacity-60" />
                        </div>
                        <p className="text-2xl font-black tracking-tight text-textMain mt-2 uppercase">
                            {isFiltered ? `${activeWardTab}` : `${assignedWardsArray.length} Wards`}
                        </p>
                        <p className="text-[11px] font-semibold text-textMuted mt-1 uppercase">
                            {calculatedTotalPus} Expected Polling Stations
                        </p>
                        <div className="w-full bg-background h-1.5 rounded-full mt-3 overflow-hidden border border-textMuted/10">
                            <div className="bg-primary h-full" style={{ width: `100%` }} />
                        </div>
                    </div>

                    <div className="bg-card p-5 rounded-2xl border border-textMuted/20 relative overflow-hidden shadow-sm transition-all duration-300 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gold transition-all group-hover:w-2" />
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold uppercase tracking-wider text-textMuted">Polling Agent Coverage</p>
                            <Users className="w-4 h-4 text-textMuted opacity-60" />
                        </div>
                        <p className="text-2xl font-black tracking-tight text-textMain mt-2">
                            {agentSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-textMuted mt-1">
                            {totalAgentsFound} of {calculatedTotalPus} stations staffed
                        </p>
                        <div className="w-full bg-background h-1.5 rounded-full mt-3 overflow-hidden border border-textMuted/10">
                            <div className="bg-gold h-full transition-all duration-500 ease-out" style={{ width: `${agentSaturation}%` }} />
                        </div>
                    </div>

                    <div className="bg-card p-5 rounded-2xl border border-textMuted/20 relative overflow-hidden shadow-sm transition-all duration-300 group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-accent transition-all group-hover:w-2" />
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold uppercase tracking-wider text-textMuted">Result Submission Progress</p>
                            <FileText className="w-4 h-4 text-textMuted opacity-60" />
                        </div>
                        <p className="text-2xl font-black tracking-tight text-accent mt-2">
                            {submissionSaturation}%
                        </p>
                        <p className="text-[11px] font-semibold text-textMuted mt-1">
                            {verifiedScannedCount} reports verified from {calculatedTotalPus} stations
                        </p>
                        <div className="w-full bg-background h-1.5 rounded-full mt-3 overflow-hidden border border-textMuted/10">
                            <div className="bg-accent h-full transition-all duration-500 ease-out" style={{ width: `${submissionSaturation}%` }} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-textMuted/20 shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-background pb-4 gap-2">
                            <div>
                                <h3 className="text-xs font-black tracking-wider text-textMain uppercase">
                                    Polling Agent Directory {isFiltered && `— Ward ${activeWardTab.toUpperCase()}`}
                                </h3>
                                <p className="text-[11px] font-medium text-textMuted mt-0.5">Onboarded field personnel assigned to active polling units</p>
                            </div>

                            <Link
                                href="/dashboard/ward/coordinators"
                                className="bg-primary hover:bg-primary-dark text-white text-[10px] font-bold px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap shadow-sm active:scale-[0.98] flex items-center gap-1.5"
                            >
                                <UserPlus className="w-3.5 h-3.5" /> Create Agent Account
                            </Link>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-textMuted/10">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-textMuted/20 text-[10px] font-black text-textMuted uppercase tracking-wider bg-background">
                                        <th className="p-3.5">Agent Name</th>
                                        <th className="p-3.5">Assigned Ward</th>
                                        <th className="p-3.5">Target Stations</th>
                                        <th className="p-3.5">Contact Number</th>
                                        <th className="p-3.5 text-right">Registration Date</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-medium divide-y divide-background">
                                    {agentsList && agentsList.length > 0 ? (
                                        agentsList.map((agent) => (
                                            <tr key={agent.id} className="hover:bg-background/50 transition-colors duration-150 text-textMain">
                                                <td className="p-3.5 font-bold flex items-center gap-2">{agent.full_name}</td>
                                                <td className="p-3.5 uppercase font-black text-[10px] text-gold">
                                                    {agent.assigned_wards && agent.assigned_wards.length > 0
                                                        ? agent.assigned_wards.join(', ')
                                                        : activeWardTab.toUpperCase()}
                                                </td>
                                                <td className="p-3.5 font-semibold text-textMain">
                                                    {agent.assigned_pus && agent.assigned_pus.length > 0
                                                        ? agent.assigned_pus.join(', ').toUpperCase()
                                                        : <span className="text-gold italic font-medium">No Stations Bound</span>}
                                                </td>
                                                <td className="p-3.5 text-textMuted font-mono flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-textMuted/60" /> {agent.phone || '—'}
                                                </td>
                                                <td className="p-3.5 text-right font-bold text-textMuted">
                                                    <span className="inline-flex items-center gap-1 justify-end w-full">
                                                        <Calendar className="w-3 h-3 text-textMuted/60" />
                                                        {agent.created_at ? new Date(agent.created_at).toLocaleDateString('en-GB') : '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center font-semibold text-textMuted bg-background/20 italic">
                                                <div className="flex flex-col items-center justify-center py-4">
                                                    <Inbox className="w-8 h-8 text-textMuted opacity-40 mb-2" />
                                                    No polling agents registered under your chosen ward scope structure.
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-card p-6 rounded-2xl border border-textMuted/20 flex flex-col justify-between shadow-sm">
                        <div>
                            <h3 className="text-xs font-black tracking-wider text-textMain mb-0.5 uppercase">
                                Activity Logs {isFiltered && `— ${activeWardTab.toUpperCase()}`}
                            </h3>
                            <p className="text-[11px] font-medium text-textMuted mb-6">Recent updates from your assigned wards</p>

                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                                {activityLogs && activityLogs.length > 0 ? (
                                    activityLogs.map((log) => (
                                        <div key={log.id} className="p-3.5 bg-background rounded-xl border border-textMuted/15 text-xs transition-all hover:border-textMuted/30">
                                            <div className="flex justify-between font-black text-[9px] uppercase tracking-wider text-textMuted mb-1.5">
                                                <span className={`flex items-center gap-1 ${log.event_type === 'ALERT' ? 'text-gold' : 'text-primary'}`}>
                                                    {log.event_type === 'ALERT' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                                    {log.ward_name?.toUpperCase() || 'WARD'} • {log.event_type?.replace(/_/g, ' ')}
                                                </span>
                                                <span className="font-mono flex items-center gap-1">
                                                    <Clock className="w-3 h-3 opacity-60" />
                                                    {log.created_at ? new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'} WAT
                                                </span>
                                            </div>
                                            <p className="font-semibold text-textMain leading-relaxed">{log.description}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 border border-dashed border-textMuted/20 rounded-xl bg-background/20">
                                        <p className="text-xs font-bold text-textMuted italic">
                                            No events logged in this ward scope framework.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-background text-center">
                            <p className="text-[10px] font-semibold text-textMuted italic leading-normal flex items-center justify-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                                All dashboard metrics sync with the central server configuration.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}