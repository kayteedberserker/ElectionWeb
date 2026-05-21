'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ChevronDown, MapPin, Layers, User, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ElectoralTreePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');

    // User context data metrics scoped exclusively to LGA Supervisor context
    const [userScope, setUserScope] = useState({
        role: '',
        state: '',
        assignedLgas: [], // Holds the direct list of authorized operational zones
    });

    // Hierarchical Structure Expansion States
    const [expandedLgas, setExpandedLgas] = useState({});
    const [expandedWards, setExpandedWards] = useState({});

    // Data Repository Cache Arrays
    const [lgas, setLgas] = useState([]);
    const [wardsData, setWardsData] = useState({}); // Keyed by lgaName
    const [puData, setPuData] = useState({});        // Keyed by wardName

    // Database Personnel Registry
    const [campaignPersonnel, setCampaignPersonnel] = useState([]);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = typeof window !== 'undefined'
        ? createBrowserClient(supabaseUrl, supabaseKey)
        : null;

    useEffect(() => {
        async function loadElectoralStructure() {
            if (!supabase) return;
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();

                if (userError || !user) {
                    setError('Failed to authenticate session scope context.');
                    return;
                }

                // Fetch current user's profile row. Added 'state' to ensure API calls work.
                const { data: userProfile, error: profileFetchError } = await supabase
                    .from('profiles')
                    .select('role, assigned_lgas, assigned_state, candidate_id')
                    .eq('id', user.id)
                    .single();

                console.log("Fetched user profile for context:", userProfile, profileFetchError);
                if (profileFetchError || !userProfile) {
                    console.error("Profile structural parsing failure:", profileFetchError);
                    setError('Failed to resolve user profile records.');
                    return;
                }

                const seat = userProfile.role || '';
                // Defaulting state if missing to prevent API from returning the master states list
                const userState = userProfile.assigned_state || 'OSUN';

                // Parse authorized assigned LGAs list out of database profile row parameters
                let assignedLgasList = [];
                if (Array.isArray(userProfile.assigned_lgas)) {
                    assignedLgasList = userProfile.assigned_lgas;
                } else if (userProfile.assigned_lgas) {
                    try {
                        assignedLgasList = typeof userProfile.assigned_lgas === 'string'
                            ? JSON.parse(userProfile.assigned_lgas)
                            : userProfile.assigned_lgas;
                    } catch {
                        assignedLgasList = [userProfile.assigned_lgas];
                    }
                }

                const currentScope = {
                    role: seat,
                    state: userState,
                    assignedLgas: assignedLgasList,
                };

                setUserScope(currentScope);

                // Resolve candidate ID context directly from profile
                const targetCandidateId = userProfile.candidate_id;

                // Direct database personnel hydration with correlated ID
                if (targetCandidateId) {
                    const { data: personnelData, error: personnelError } = await supabase
                        .from('profiles')
                        .select('full_name, role, assigned_lgas, assigned_wards, assigned_pus')
                        .eq('candidate_id', targetCandidateId);

                    console.log(personnelData, personnelError, " are the data and error of the req? Resolved Candidate ID:", targetCandidateId);

                    if (!personnelError && personnelData) {
                        setCampaignPersonnel(personnelData);
                    }
                } else {
                    console.warn("Could not determine Candidate ID context for this profile session.");
                }

                // Initial Root Hydration: Query and verify details ONLY for the supervisor's specified operational LGAs
                if (assignedLgasList.length > 0) {
                    await fetchLgas(assignedLgasList, userState);
                }
            } catch (err) {
                console.error("Structure alignment error:", err);
                setError('An unexpected error occurred loading the electoral structure.');
            } finally {
                setIsLoading(false);
            }
        }

        loadElectoralStructure();
    }, [supabase]);

    // Async Fetch Branch: Request metadata for each assigned LGA. 
    // The backend API automatically returns wards here, so we cache them immediately!
    const fetchLgas = async (assignedLgasList, userState) => {
        try {
            const fetchPromises = assignedLgasList.map(async (lga) => {
                // Must pass 'state' or the backend returns the whole states list!
                const url = `/api/locations?state=${encodeURIComponent(userState)}&lga=${encodeURIComponent(lga)}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();

                    // The API returns wards along with the LGA! Cache them instantly.
                    if (data.wards) {
                        setWardsData(prev => ({
                            ...prev,
                            [data.lga || lga]: data.wards
                        }));
                    }

                    return {
                        name: data.lga || lga,
                        wardCount: data.wards ? data.wards.length : 0,
                        supervisor: data.senatorial_district || data.supervisor || null
                    };
                }
                return null;
            });

            const results = await Promise.all(fetchPromises);
            const validLgas = results.filter(Boolean);

            setLgas(validLgas);
        } catch (err) {
            console.error("Failed fetching directory LGAs sequentially:", err);
        }
    };

    // Async Fetch Branch: Polling Units mapping info under a specific authorized Ward
    const fetchPollingUnits = async (lgaName, wardName) => {
        if (puData[wardName]) return; // Client cache hit

        try {
            // Include state, lga, and ward to trigger the specific block in your backend GET function
            const url = `/api/locations?state=${encodeURIComponent(userScope.state)}&lga=${encodeURIComponent(lgaName)}&ward=${encodeURIComponent(wardName)}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setPuData(prev => ({
                    ...prev,
                    [wardName]: data.pollingUnits || []
                }));
            }
        } catch (err) {
            console.error(`Failed resolving Polling Units for ${wardName}:`, err);
        }
    };

    // Toggle Action: Structure drilldown expansion
    const toggleLga = (lgaName) => {
        setExpandedLgas(prev => ({ ...prev, [lgaName]: !prev[lgaName] }));
        // No need to fetch wards here anymore, fetchLgas already got them!
    };

    const toggleWard = (lgaName, wardName) => {
        const isExpanding = !expandedWards[wardName];
        setExpandedWards(prev => ({ ...prev, [wardName]: isExpanding }));

        if (isExpanding) {
            startTransition(async () => {
                await fetchPollingUnits(lgaName, wardName);
            });
        }
    };

    // Database Cross-Reference Personnel Helpers
    const getLgaSupervisor = (lgaName) => {
        const match = campaignPersonnel.find(p =>
            p.role === 'LGA_SUPERVISOR' &&
            (p.assigned_lgas || []).some(l => l?.toUpperCase() === lgaName?.toUpperCase())
        );
        return match ? match.full_name : null;
    };

    const getWardSupervisor = (wardName) => {
        const match = campaignPersonnel.find(p =>
            p.role === 'WARD_SUPERVISOR' &&
            (p.assigned_wards || []).some(w => w?.toUpperCase() === wardName?.toUpperCase())
        );
        return match ? match.full_name : null;
    };

    const getPuAgent = (puCode, puName) => {
        const match = campaignPersonnel.find(p => {
            const assigned = p.assigned_polling_units || p.assigned_pus || [];
            return assigned.some(u =>
                u?.toUpperCase() === puCode?.toUpperCase() ||
                u?.toUpperCase() === puName?.toUpperCase()
            );
        });
        return match ? match.full_name : null;
    };

    if (isLoading) {
        return <LoadingOverlay message="Loading electoral structure..." />;
    }

    return (
        <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 text-textMain bg-background">
            {isPending && <LoadingOverlay message="Updating registry records..." />}

            {/* Top Header Block */}
            <div className="border-b border-textMuted/20 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-textMain uppercase">Electoral Structure Directory</h1>
                    <p className="text-sm font-medium text-textMuted mt-1">
                        Track assigned personnel and polling unit coverage parameters across your designated Local Government Areas.
                    </p>
                </div>
                <div className="bg-card border border-textMuted/20 px-4 py-3 rounded-xl shadow-sm text-left md:text-right">
                    <span className="block text-[10px] font-bold text-textMuted uppercase tracking-wider mb-1">Supervisor Workspace Scope</span>
                    <span className="text-sm font-black text-primary tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ').toUpperCase() : 'LGA SUPERVISOR'}
                        {userScope.assignedLgas.length > 0 && ` — ${userScope.assignedLgas.join(', ')}`}
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-gold/10 border border-gold/30 text-gold text-xs font-bold uppercase tracking-wide rounded-xl flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* Electoral Hierarchy Container */}
            <div className="bg-card border border-textMuted/20 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                    <h3 className="text-lg font-black text-textMain uppercase">Electoral Directory Breakdown</h3>
                    <p className="text-sm text-textMuted mt-1">Expand each local jurisdiction level to verify official assignments and supervisor verification status.</p>
                </div>

                {/* Local Government Structure Layer */}
                <div className="space-y-4 pl-2 md:pl-4 border-l border-textMuted/10">
                    {lgas.length === 0 ? (
                        <p className="text-sm text-textMuted font-medium pl-2 italic">No assigned Local Government Areas mapped under this supervisor account.</p>
                    ) : (
                        lgas.map(lga => {
                            const isLgaOpen = !!expandedLgas[lga.name];
                            const structuralWards = wardsData[lga.name] || [];
                            const lgaSupervisor = lga.supervisorName || lga.supervisor_name || lga.supervisor || getLgaSupervisor(lga.name);

                            return (
                                <div key={lga.name} className="border border-textMuted/20 rounded-xl overflow-hidden bg-card transition-all">
                                    {lga.name && (
                                        /* LGA Selection Row */
                                        <div
                                            onClick={() => toggleLga(lga.name)}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-background/40 cursor-pointer transition-all select-none gap-4"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <div className={`p-1.5 rounded-md transition-colors ${isLgaOpen ? 'bg-primary text-white' : 'bg-background text-textMuted'}`}>
                                                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isLgaOpen ? 'rotate-180' : ''}`} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center space-x-2">
                                                        <h4 className="text-base font-black text-textMain uppercase tracking-tight">{lga.name} Local Government Area</h4>
                                                        <span className={`w-2 h-2 rounded-full ${lgaSupervisor ? 'bg-accent animate-pulse' : 'bg-gold'}`} />
                                                    </div>
                                                    <span className="text-xs text-textMuted font-bold uppercase mt-0.5 block tracking-wide">
                                                        {lga.wardCount || lga.ward_count || 0} Wards Configured
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Supervisor Allocation Indicator */}
                                            <div className="flex items-center space-x-2 sm:text-right">
                                                {lgaSupervisor ? (
                                                    <span className="inline-flex items-center gap-1 bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                        <CheckCircle2 className="w-3 h-3" /> LGA Supervisor: {lgaSupervisor.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-gold/10 border border-gold/20 text-gold text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                        <AlertTriangle className="w-3 h-3" /> LGA Supervisor Vacant
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Ward Level Drilldown Layer */}
                                    {isLgaOpen && (
                                        <div className="p-4 bg-background/50 space-y-3 border-t border-textMuted/10">
                                            {structuralWards.length === 0 ? (
                                                <p className="text-sm text-textMuted font-medium py-2 pl-2 italic">
                                                    No registered wards found inside this Local Government Area boundary.
                                                </p>
                                            ) : (
                                                structuralWards.map(ward => {
                                                    const isWardOpen = !!expandedWards[ward.name];
                                                    const localizedPus = puData[ward.name] || [];
                                                    const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                                    return (
                                                        <div key={ward.name} className="border border-textMuted/20 rounded-lg bg-card overflow-hidden shadow-xs">
                                                            {/* Ward Selection Row */}
                                                            <div
                                                                onClick={() => toggleWard(lga.name, ward.name)}
                                                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-background/40 cursor-pointer transition-all select-none gap-3"
                                                            >
                                                                <div className="flex items-center space-x-3">
                                                                    <div className={`p-1 rounded transition-colors ${isWardOpen ? 'bg-primary text-white' : 'text-textMuted bg-background'}`}>
                                                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isWardOpen ? 'rotate-180' : ''}`} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center space-x-1.5">
                                                                            <h5 className="text-sm font-black text-textMain uppercase tracking-tight">{ward.name} Ward</h5>
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${wardSupervisor ? 'bg-primary' : 'bg-gold'}`} />
                                                                        </div>
                                                                        <span className="text-xs text-textMuted font-bold uppercase block tracking-wide">
                                                                            {ward.puCount || ward.pu_count || 0} Polling Units Mapped
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Ward Assignment Checking Node */}
                                                                <div className="flex items-center space-x-2">
                                                                    {wardSupervisor ? (
                                                                        <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/10 text-primary text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-xs">
                                                                            <User className="w-3 h-3" /> Ward Supervisor: {wardSupervisor.toUpperCase()}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 bg-gold/10 border border-gold/10 text-gold text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded">
                                                                            <AlertTriangle className="w-3 h-3" /> Ward Supervisor Vacant
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Polling Units Directory Section */}
                                                            {isWardOpen && (
                                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background border-t border-textMuted/10">
                                                                    {localizedPus.length === 0 ? (
                                                                        <div className="flex items-center space-x-2 text-xs font-bold text-textMuted col-span-2 py-2 uppercase tracking-wider">
                                                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                                            <span>Loading polling units directory dataset...</span>
                                                                        </div>
                                                                    ) : (
                                                                        localizedPus.map(pu => {
                                                                            const puCode = pu.code || pu.polling_unit_code;
                                                                            const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                                            return (
                                                                                <div
                                                                                    key={pu.id || puCode || pu.name}
                                                                                    className="p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all bg-card border-textMuted/20 shadow-xs"
                                                                                >
                                                                                    <div className="flex justify-between items-start gap-3">
                                                                                        <div>
                                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-textMuted mb-1 uppercase tracking-wider">
                                                                                                <Layers className="w-3 h-3" /> Code: {puCode || 'N/A'}
                                                                                            </span>
                                                                                            <h6 className="text-sm font-black text-textMain leading-snug uppercase tracking-tight">
                                                                                                {pu.name}
                                                                                            </h6>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md whitespace-nowrap border ${puAgent ? 'bg-accent/10 text-accent border-accent/20' : 'bg-background text-textMuted border-textMuted/10'}`}>
                                                                                            {puAgent ? 'Agent Verified' : 'Awaiting Field Assignment'}
                                                                                        </span>
                                                                                    </div>

                                                                                    {/* Polling Unit Personnel Parameters */}
                                                                                    <div className="pt-2 border-t border-background flex items-center justify-between">
                                                                                        <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Assigned Agent:</span>
                                                                                        {puAgent ? (
                                                                                            <span className="text-xs font-black text-accent bg-accent/5 px-2 py-1 rounded border border-accent/10 uppercase tracking-tight inline-flex items-center">
                                                                                                <CheckCircle2 className="w-3 h-3 text-accent mr-1" />
                                                                                                {puAgent.toUpperCase()}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-xs font-black text-gold bg-gold/5 px-2 py-1 rounded border border-gold/10 uppercase tracking-tight inline-flex items-center gap-1">
                                                                                                <AlertTriangle className="w-3 h-3" /> Unassigned
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </main>
    );
}