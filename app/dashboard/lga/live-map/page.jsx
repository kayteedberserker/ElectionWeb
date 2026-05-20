'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
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

    // Hierarchical Tree Structural States
    const [expandedLgas, setExpandedLgas] = useState({});
    const [expandedWards, setExpandedWards] = useState({});

    // Data Repository Cache Arrays
    const [lgas, setLgas] = useState([]);
    const [wardsData, setWardsData] = useState({}); // Keyed by lgaName
    const [puData, setPuData] = useState({});        // Keyed by wardName

    // LIVE DATABASE PERSONNEL REGISTRY
    const [campaignPersonnel, setCampaignPersonnel] = useState([]);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = typeof window !== 'undefined'
        ? createBrowserClient(supabaseUrl, supabaseKey)
        : null;

    useEffect(() => {
        async function loadTerritoryTreeRoot() {
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

                console.log("Fetched user profile for tree root context:", userProfile, profileFetchError);
                if (profileFetchError || !userProfile) {
                    console.error("Profile structural parsing failure:", profileFetchError);
                    setError('Failed to resolve tactical user profiling records.');
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

                // RESOLVE REAL CANDIDATE ID CONTEXT DIRECTLY FROM PROFILE
                const targetCandidateId = userProfile.candidate_id;

                // DIRECT DATABASE PERSONNEL HYDRATION WITH CORRELATED ID
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
                    console.warn("Could not determine structural Candidate ID ownership tier for this user profile session.");
                }

                // Initial Root Hydration: Query and verify details ONLY for the supervisor's specified operational LGAs
                if (assignedLgasList.length > 0) {
                    await fetchTreeLgas(assignedLgasList, userState);
                }
            } catch (err) {
                console.error("Root tree alignment error:", err);
                setError('An unexpected error occurred building territory structural branches.');
            } finally {
                setIsLoading(false);
            }
        }

        loadTerritoryTreeRoot();
    }, [supabase]);

    // Async Fetch Branch: Request metadata for each assigned LGA. 
    // The backend API automatically returns wards here, so we cache them immediately!
    const fetchTreeLgas = async (assignedLgasList, userState) => {
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
            console.error("Failed fetching tree branch LGAs sequentially:", err);
        }
    };

    // Async Fetch Branch: Polling Units mapping info under a specific authorized Ward
    const fetchTreePollingUnits = async (lgaName, wardName) => {
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

    // Toggle Action: Deep structure tree leaf expansion
    const toggleLga = (lgaName) => {
        setExpandedLgas(prev => ({ ...prev, [lgaName]: !prev[lgaName] }));
        // No need to fetch wards here anymore, fetchTreeLgas already got them!
    };

    const toggleWard = (lgaName, wardName) => {
        const isExpanding = !expandedWards[wardName];
        setExpandedWards(prev => ({ ...prev, [wardName]: isExpanding }));

        if (isExpanding) {
            startTransition(async () => {
                await fetchTreePollingUnits(lgaName, wardName);
            });
        }
    };

    // LIVE DATABASE CROSS-REFERENCE HELPERS
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
        <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 text-slate-800">
            {isPending && <LoadingOverlay message="Updating records..." />}

            {/* Top Operational Header Block */}
            <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Electoral Structure Directory</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Track assigned supervisors and polling unit agents across your designated Local Government Areas.
                    </p>
                </div>
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl shadow-sm text-left md:text-right">
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supervisor Scope</span>
                    <span className="text-sm font-bold text-slate-800 tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ').toUpperCase() : 'LGA SUPERVISOR'}
                        {userScope.assignedLgas.length > 0 && ` — ${userScope.assignedLgas.join(', ')}`}
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl flex items-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {/* Core Tree Hierarchy Container */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Regional Hierarchy Breakdown</h3>
                    <p className="text-sm text-slate-500 mt-1">Expand each local jurisdiction to verify field assignments and supervisor coverage.</p>
                </div>

                {/* Level 1: Local Government Deployment Level */}
                <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-slate-100">
                    {lgas.length === 0 ? (
                        <p className="text-sm text-slate-500 font-medium pl-2">No assigned Local Government Areas mapped under this supervisor account.</p>
                    ) : (
                        lgas.map(lga => {
                            const isLgaOpen = !!expandedLgas[lga.name];
                            const structuralWards = wardsData[lga.name] || [];
                            const lgaSupervisor = lga.supervisorName || lga.supervisor_name || lga.supervisor || getLgaSupervisor(lga.name);

                            return (
                                <div key={lga.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                    {lga.name && (
                                        /* LGA Node Header Strip */
                                        <div
                                            onClick={() => toggleLga(lga.name)}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-all select-none gap-4"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <div className={`p-1.5 rounded-md ${isLgaOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    <svg className={`w-4 h-4 transition-transform ${isLgaOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="flex items-center space-x-2">
                                                        <h4 className="text-base font-bold text-slate-800">{lga.name} Local Government Area</h4>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${lgaSupervisor ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
                                                    </div>
                                                    <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                                                        {lga.wardCount || lga.ward_count || 0} Wards Mapped
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Dynamic Supervisor Allocation Indicator Badge */}
                                            <div className="flex items-center space-x-2 sm:text-right">
                                                {lgaSupervisor ? (
                                                    <span className="bg-green-50 border border-green-500/20 text-green-700 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                        LGA Supervisor: {lgaSupervisor.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="bg-amber-50 border border-amber-500/20 text-amber-600 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                        LGA Supervisor Vacant
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Level 2: Ward Branch Layer */}
                                    {isLgaOpen && (
                                        <div className="p-4 bg-slate-50 space-y-3 border-t border-slate-200">
                                            {structuralWards.length === 0 ? (
                                                <p className="text-sm text-slate-500 font-medium py-2 pl-2 italic">
                                                    No wards found for this Local Government Area.
                                                </p>
                                            ) : (
                                                structuralWards.map(ward => {
                                                    const isWardOpen = !!expandedWards[ward.name];
                                                    const localizedPus = puData[ward.name] || [];
                                                    const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                                    return (
                                                        <div key={ward.name} className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                                                            {/* Ward Header Component */}
                                                            <div
                                                                onClick={() => toggleWard(lga.name, ward.name)}
                                                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition-all select-none gap-3"
                                                            >
                                                                <div className="flex items-center space-x-3">
                                                                    <div className={`p-1 rounded text-slate-400 ${isWardOpen ? 'bg-slate-100' : ''}`}>
                                                                        <svg className={`w-3.5 h-3.5 transition-transform ${isWardOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center space-x-1.5">
                                                                            <h5 className="text-sm font-bold text-slate-800">{ward.name} Ward</h5>
                                                                            <span className={`w-1 h-1 rounded-full ${wardSupervisor ? 'bg-blue-500' : 'bg-red-400'}`} />
                                                                        </div>
                                                                        <span className="text-xs text-slate-500 font-medium block">
                                                                            {ward.puCount || ward.pu_count || 0} Polling Units Mapped
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Ward Level Supervisor Check */}
                                                                <div>
                                                                    {wardSupervisor ? (
                                                                        <span className="bg-blue-50 border border-blue-500/10 text-blue-700 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded shadow-xs">
                                                                            Ward Supervisor: {wardSupervisor.toUpperCase()}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-red-50 border border-red-500/10 text-red-500 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded">
                                                                            Ward Supervisor Vacant
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Level 3: Polling Units Base Elements Leaf */}
                                                            {isWardOpen && (
                                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-t border-slate-200">
                                                                    {localizedPus.length === 0 ? (
                                                                        <div className="flex items-center space-x-2 text-sm text-slate-500 col-span-2 py-2">
                                                                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                                                            <span>Mapping polling units into registry structure...</span>
                                                                        </div>
                                                                    ) : (
                                                                        localizedPus.map(pu => {
                                                                            const puCode = pu.code || pu.polling_unit_code;
                                                                            const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                                            return (
                                                                                <div
                                                                                    key={pu.id || puCode || pu.name}
                                                                                    className="p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all bg-white border-slate-200 shadow-sm"
                                                                                >
                                                                                    <div className="flex justify-between items-start gap-3">
                                                                                        <div>
                                                                                            <span className="block text-xs font-bold text-slate-400 mb-1">
                                                                                                Code: {puCode || 'N/A'}
                                                                                            </span>
                                                                                            <h6 className="text-sm font-semibold text-slate-800 leading-snug">
                                                                                                {pu.name}
                                                                                            </h6>
                                                                                        </div>
                                                                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${puAgent ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                                            {puAgent ? 'Agent Verified' : 'Awaiting Field Assignment'}
                                                                                        </span>
                                                                                    </div>

                                                                                    {/* Polling Unit Field Agent Registration State */}
                                                                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                                                                        <span className="text-xs font-semibold text-slate-500 uppercase">Assigned Official:</span>
                                                                                        {puAgent ? (
                                                                                            <span className="text-xs font-bold text-green-700 bg-green-50/60 px-2 py-1 rounded border border-green-500/10 uppercase tracking-tight flex items-center">
                                                                                                <svg className="w-3.5 h-3.5 text-green-600 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                                                                </svg>
                                                                                                {puAgent.toUpperCase()}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-xs font-bold text-red-500 bg-red-50/60 px-2 py-1 rounded border border-red-500/10 uppercase tracking-tight">
                                                                                                ⚠️ UNASSIGNED
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