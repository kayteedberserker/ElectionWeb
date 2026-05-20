'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ElectoralTreePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');

    // Flat user context data metrics scoped exclusively to WARD Supervisor context
    const [userScope, setUserScope] = useState({
        role: '',
        state: '',
        assignedWards: [], // Direct array layout holding authorized flat tactical wards
    });

    // Hierarchical Tree Structural States
    const [expandedWards, setExpandedWards] = useState({});

    // Data Repository Cache Arrays
    const [wards, setWards] = useState([]);
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

                // Fetch profile without structural assumptions of an LGA anchor
                const { data: userProfile, error: profileFetchError } = await supabase
                    .from('profiles')
                    .select('role, assigned_wards, assigned_state, candidate_id')
                    .eq('id', user.id)
                    .single();

                console.log("Fetched user profile for tree root context:", userProfile, profileFetchError);
                if (profileFetchError || !userProfile) {
                    console.error("Profile structural parsing failure:", profileFetchError);
                    setError('Failed to resolve tactical user profiling records.');
                    return;
                }

                const seat = userProfile.role || '';
                const userState = userProfile.assigned_state || 'OSUN';

                // Parse authorized assigned Wards list out of database profile parameters safely
                let assignedWardsList = [];
                if (Array.isArray(userProfile.assigned_wards)) {
                    assignedWardsList = userProfile.assigned_wards;
                } else if (userProfile.assigned_wards) {
                    try {
                        assignedWardsList = typeof userProfile.assigned_wards === 'string'
                            ? JSON.parse(userProfile.assigned_wards)
                            : userProfile.assigned_wards;
                    } catch {
                        assignedWardsList = [userProfile.assigned_wards];
                    }
                }

                const currentScope = {
                    role: seat,
                    state: userState,
                    assignedWards: assignedWardsList,
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

                // Initial Flat Hydration: Query details ONLY for the supervisor's specified operational Wards directly
                if (assignedWardsList.length > 0) {
                    await fetchTreeWards(assignedWardsList, userState);
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

    // Async Fetch Branch: Request allocation data for each assigned Ward directly over the State context
    const fetchTreeWards = async (assignedWardsList, userState) => {
        try {
            const fetchPromises = assignedWardsList.map(async (wardName) => {
                const url = `/api/locations?state=${encodeURIComponent(userState)}&ward=${encodeURIComponent(wardName)}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    return {
                        name: wardName,
                        puCount: data.total_polling_units || data.pollingUnits?.length || 0,
                        supervisor: data.supervisor || null
                    };
                }
                return { name: wardName, puCount: 0, supervisor: null };
            });

            const results = await Promise.all(fetchPromises);
            const validWards = results.filter(Boolean);

            setWards(validWards);
        } catch (err) {
            console.error("Failed fetching tree branch Wards sequentially:", err);
        }
    };

    // Async Fetch Branch: Polling Units mapping info loaded directly via the State & Ward parameters
    const fetchTreePollingUnits = async (wardName) => {
        if (puData[wardName]) return; // Client cache hit

        try {
            const url = `/api/locations?state=${encodeURIComponent(userScope.state)}&ward=${encodeURIComponent(wardName)}`;
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

    const toggleWard = (wardName) => {
        const isExpanding = !expandedWards[wardName];
        setExpandedWards(prev => ({ ...prev, [wardName]: isExpanding }));

        if (isExpanding) {
            startTransition(async () => {
                await fetchTreePollingUnits(wardName);
            });
        }
    };

    // LIVE DATABASE CROSS-REFERENCE HELPERS
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
                    <h1 className="text-2xl font-black text-[#291C14] uppercase tracking-wide">Electoral Ward Command Tree</h1>
                    <p className="text-xs font-medium text-[#8A7968] mt-1">
                        Operational deployment map matrix running from assigned Wards down to localized polling unit endpoints.
                    </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2 rounded-xl text-right">
                    <span className="block text-[9px] font-black uppercase text-[#8A7968]">Supervisor Scope</span>
                    <span className="text-xs font-bold text-[#291C14] uppercase tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ') : 'Ward Supervisor'}
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

                {/* Level 1: Ward Root Deployment Branches Layer */}
                <div className="space-y-4">
                    {wards.length === 0 ? (
                        <p className="text-xs italic text-[#8A7968] font-medium">No assigned Wards mapped under your supervisor account scope.</p>
                    ) : (
                        wards.map(ward => {
                            const isWardOpen = !!expandedWards[ward.name];
                            const localizedPus = puData[ward.name] || [];

                            // Database Field Synchronization Matcher
                            const wardSupervisor = ward.supervisor || getWardSupervisor(ward.name);

                            return (
                                <div key={ward.name} className="space-y-2">
                                    {/* Ward Header Component */}
                                    <div
                                        onClick={() => toggleWard(ward.name)}
                                        className="flex items-center justify-between p-3 bg-white hover:bg-[#FAF6F0]/50 border-2 border-[#8A7968]/10 rounded-xl cursor-pointer transition-all select-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <span className="text-xs text-[#8A7968] font-bold">
                                                {isWardOpen ? '▼' : '▶'}
                                            </span>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="text-xs font-black text-[#291C14] uppercase tracking-wide">{ward.name} Ward</h4>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${wardSupervisor ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
                                                </div>
                                                <span className="text-[10px] text-[#8A7968] font-semibold uppercase">
                                                    {ward.puCount || 0} Units Mapped
                                                </span>
                                            </div>
                                        </div>

                                        {/* Ward Level Supervisor Check Badge */}
                                        <div className="flex items-center space-x-2 text-right">
                                            {wardSupervisor ? (
                                                <span className="bg-blue-50 border border-blue-500/20 text-blue-700 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                    Ward Lead: {wardSupervisor.toUpperCase()}
                                                </span>
                                            ) : (
                                                <span className="bg-red-50 border border-red-500/20 text-red-500 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                    Ward Lead Vacant
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Level 2: Polling Units Base Elements Leaf */}
                                    {isWardOpen && (
                                        <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-3 border-l-2 border-[#9A6749]/20 pt-1 pb-2">
                                            {localizedPus.length === 0 ? (
                                                <div className="flex items-center space-x-2 text-[9px] font-bold uppercase tracking-wider text-[#8A7968]/60 col-span-2 py-2 italic">
                                                    <div className="w-2 h-2 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                                                    <span>Mapping unit nodes into registry matrix...</span>
                                                </div>
                                            ) : (
                                                localizedPus.map(pu => {
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
            </div>
        </main>
    );
}