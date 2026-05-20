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
    const [puData, setPuData] = useState({});       // Keyed by wardName

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
        return <LoadingOverlay message="Loading command structure topology tree..." />;
    }

    return (
        <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
            {isPending && <LoadingOverlay message="Querying localized tactical unit metrics..." />}

            {/* Top Operational Breadcrumb Tracker */}
            <div className="border-b-2 border-[#8A7968]/20 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[#291C14] uppercase tracking-wide">Electoral Territory Command Tree</h1>
                    <p className="text-xs font-medium text-[#8A7968] mt-1">
                        Operational deployment map matrix running from assigned LGA structure branches down to polling unit points.
                    </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2 rounded-xl text-right">
                    <span className="block text-[9px] font-black uppercase text-[#8A7968]">Supervisor Scope</span>
                    <span className="text-xs font-bold text-[#291C14] uppercase tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ') : 'LGA Supervisor'}
                        {userScope.assignedLgas.length > 0 && ` - Assigned to ${userScope.assignedLgas.join(', ')}`}
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border-2 border-red-500/20 text-red-700 text-xs font-bold uppercase tracking-wide rounded-xl">
                    {error}
                </div>
            )}

            {/* Core Tree Hierarchy Container */}
            <div className="bg-white border-2 border-[#8A7968]/20 rounded-xl p-6 shadow-sm">

                {/* Level 1: Local Government Deployment Level */}
                <div className="space-y-4">
                    {lgas.length === 0 ? (
                        <p className="text-xs italic text-[#8A7968] font-medium">No assigned Local Government Areas mapped under your supervisor account scope.</p>
                    ) : (
                        lgas.map(lga => {
                            const isLgaOpen = !!expandedLgas[lga.name];
                            const structuralWards = wardsData[lga.name] || [];

                            // Database Field Synchronization Matcher merging API fallbacks with direct database cross-reference
                            const lgaSupervisor = lga.supervisorName || lga.supervisor_name || lga.supervisor || getLgaSupervisor(lga.name);

                            return (
                                <div key={lga.name} className="space-y-2">
                                    {lga.name && (
                                        /* LGA Node Header Strip */
                                        <div
                                            onClick={() => toggleLga(lga.name)}
                                            className="flex items-center justify-between p-3 bg-white hover:bg-[#FAF6F0]/50 border-2 border-[#8A7968]/10 rounded-xl cursor-pointer transition-all select-none"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <span className="text-xs text-[#8A7968] font-bold">
                                                    {isLgaOpen ? '▼' : '▶'}
                                                </span>
                                                <div>
                                                    <div className="flex items-center space-x-2">
                                                        <h4 className="text-xs font-black text-[#291C14] uppercase tracking-wide">{lga.name} LGA</h4>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${lgaSupervisor ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
                                                    </div>
                                                    <span className="text-[10px] text-[#8A7968] font-semibold uppercase">
                                                        {lga.wardCount || lga.ward_count || 0} Electoral Wards Mapped
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Dynamic Supervisor Allocation Indicator Badge */}
                                            <div className="flex items-center space-x-2 text-right">
                                                {lgaSupervisor ? (
                                                    <span className="bg-green-50 border border-green-500/20 text-green-700 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                        LGA Chief: {lgaSupervisor.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="bg-amber-50 border border-amber-500/20 text-amber-600 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                        LGA Supervisor Vacant
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Level 2: Ward Branch Layer */}
                                    {isLgaOpen && (
                                        <div className="pl-6 space-y-3 border-l-2 border-[#9A6749]/20 pt-1 pb-2">
                                            {structuralWards.length === 0 ? (
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7968]/60 py-2 pl-2 italic">
                                                    No wards found for this LGA.
                                                </p>
                                            ) : (
                                                structuralWards.map(ward => {
                                                    const isWardOpen = !!expandedWards[ward.name];
                                                    const localizedPus = puData[ward.name] || [];

                                                    // Database Field Synchronization Matcher
                                                    const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                                    return (
                                                        <div key={ward.name} className="space-y-2">
                                                            {/* Ward Header Component */}
                                                            <div
                                                                onClick={() => toggleWard(lga.name, ward.name)}
                                                                className="flex items-center justify-between p-2.5 bg-[#FAF6F0]/30 hover:bg-[#FAF6F0] border border-[#8A7968]/20 rounded-lg cursor-pointer transition-all select-none"
                                                            >
                                                                <div className="flex items-center space-x-2">
                                                                    <span className="text-[10px] text-[#9A6749] font-bold">
                                                                        {isWardOpen ? '▼' : '▶'}
                                                                    </span>
                                                                    <div>
                                                                        <div className="flex items-center space-x-1.5">
                                                                            <h5 className="text-[11px] font-bold text-[#291C14] uppercase tracking-wide">{ward.name} Ward</h5>
                                                                            <span className={`w-1 h-1 rounded-full ${wardSupervisor ? 'bg-blue-500' : 'bg-red-400'}`} />
                                                                        </div>
                                                                        <span className="text-[9px] text-[#8A7968] font-bold uppercase block">
                                                                            {ward.puCount || ward.pu_count || 0} Units Mapped
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Ward Level Supervisor Check */}
                                                                <div>
                                                                    {wardSupervisor ? (
                                                                        <span className="bg-blue-50 border border-blue-500/10 text-blue-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                                                                            Ward Lead: {wardSupervisor.toUpperCase()}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-red-50 border border-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                                                                            Ward Lead Vacant
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Level 3: Polling Units Base Elements Leaf */}
                                                            {isWardOpen && (
                                                                <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-3 border-l border-dashed border-[#8A7968]/30 py-1">
                                                                    {localizedPus.length === 0 ? (
                                                                        <div className="flex items-center space-x-2 text-[9px] font-bold uppercase tracking-wider text-[#8A7968]/60 col-span-2 py-2 italic">
                                                                            <div className="w-2 h-2 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                                                                            <span>Mapping unit nodes into registry matrix...</span>
                                                                        </div>
                                                                    ) : (
                                                                        localizedPus.map(pu => {
                                                                            // Database Field Synchronization Matcher
                                                                            const puCode = pu.code || pu.polling_unit_code;
                                                                            const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                                            return (
                                                                                <div
                                                                                    key={pu.id || puCode || pu.name}
                                                                                    className="p-3 bg-white border border-[#8A7968]/15 rounded-xl shadow-xs flex flex-col justify-between space-y-2 hover:border-[#9A6749]/30 transition-all"
                                                                                >
                                                                                    <div>
                                                                                        <span className="block text-[8px] font-black tracking-widest text-[#8A7968] uppercase">
                                                                                            CODE: {puCode || 'N/A'}
                                                                                        </span>
                                                                                        <h6 className="text-[10px] font-black text-[#291C14] uppercase tracking-tight leading-tight mt-0.5">
                                                                                            {pu.name}
                                                                                        </h6>
                                                                                    </div>

                                                                                    {/* Polling Unit Operational Field Agent Registration State */}
                                                                                    <div className="pt-2 border-t border-[#FAF6F0] flex items-center justify-between">
                                                                                        <span className="text-[8px] font-bold text-[#8A7968] uppercase">Registered Official:</span>
                                                                                        {puAgent ? (
                                                                                            <span className="text-[9px] font-black text-green-700 bg-green-50/60 px-1.5 py-0.5 rounded border border-green-500/10 uppercase tracking-tight shadow-2xs">
                                                                                                ✓ {puAgent.toUpperCase()}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-[8px] font-bold text-red-500 bg-red-50/60 px-1.5 py-0.5 rounded border border-red-500/10 uppercase tracking-tight">
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