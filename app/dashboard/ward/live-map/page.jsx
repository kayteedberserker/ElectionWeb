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
        return <LoadingOverlay message="Loading electoral structure..." />;
    }

    return (
        <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 text-slate-800">
            {isPending && <LoadingOverlay message="Updating records..." />}

            {/* Top Operational Header Block */}
            <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Electoral Ward Directory</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Track assigned supervisors and polling unit agents across your designated Wards.
                    </p>
                </div>
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl shadow-sm text-left md:text-right">
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supervisor Scope</span>
                    <span className="text-sm font-bold text-slate-800 tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ').toUpperCase() : 'WARD SUPERVISOR'}
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
                    <p className="text-sm text-slate-500 mt-1">Expand each ward jurisdiction to verify field assignments and agent coverage.</p>
                </div>

                {/* Level 1: Ward Deployment Branches Layer */}
                <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-slate-100">
                    {wards.length === 0 ? (
                        <p className="text-sm text-slate-500 font-medium pl-2">No assigned Wards mapped under this supervisor account.</p>
                    ) : (
                        wards.map(ward => {
                            const isWardOpen = !!expandedWards[ward.name];
                            const localizedPus = puData[ward.name] || [];

                            // Database Field Synchronization Matcher
                            const wardSupervisor = ward.supervisor || getWardSupervisor(ward.name);

                            return (
                                <div key={ward.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                    {/* Ward Header Component */}
                                    <div
                                        onClick={() => toggleWard(ward.name)}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-all select-none gap-4"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className={`p-1.5 rounded-md ${isWardOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                                                <svg className={`w-4 h-4 transition-transform ${isWardOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="text-base font-bold text-slate-800">{ward.name} Ward</h4>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${wardSupervisor ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
                                                </div>
                                                <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                                                    {ward.puCount || 0} Polling Units Mapped
                                                </span>
                                            </div>
                                        </div>

                                        {/* Ward Level Supervisor Check Badge */}
                                        <div className="flex items-center space-x-2 sm:text-right">
                                            {wardSupervisor ? (
                                                <span className="bg-blue-50 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                    Ward Supervisor: {wardSupervisor.toUpperCase()}
                                                </span>
                                            ) : (
                                                <span className="bg-red-50 border border-red-500/20 text-red-500 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                    Ward Supervisor Vacant
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Level 2: Polling Units Base Elements Leaf */}
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

                                                            {/* Polling Unit Operational Field Agent Registration State */}
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
            </div>
        </main>
    );
}