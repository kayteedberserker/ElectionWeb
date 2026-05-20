'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ElectoralTreePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');

    // User context data metrics
    const [userScope, setUserScope] = useState({
        role: '',
        state: '',
        lga: '',
        ward: '',
        senatorialDistrict: '',
        federalConstituency: '',
        stateConstituency: ''
    });

    // Hierarchical Tree Structural States
    const [expandedLgas, setExpandedLgas] = useState({});
    const [expandedWards, setExpandedWards] = useState({});

    // Data Repository Cache Arrays
    const [lgas, setLgas] = useState([]);
    const [rootWards, setRootWards] = useState([]); // Dynamic root level for sub-LGA fallback arrays
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

                const metadata = user.user_metadata || {};
                const seat = metadata.contesting_seat || '';
                const stateName = metadata.assigned_state || '';
                let lgaName = metadata.assigned_lga || '';
                const senatorialDistrict = metadata.senatorial_district || '';
                const federalConstituency = metadata.federal_constituency || '';
                const stateConstituency = metadata.state_constituency || '';

                // If State House of Assembly is chosen, cross-reference the client-side database mapping to find its structural LGA match
                if (seat === 'house_of_assembly' && stateName && stateConstituency && !lgaName) {
                    try {
                        const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}`);
                        if (res.ok) {
                            const data = await res.json();
                            const matchedAssembly = (data.state_constituencies || []).find(
                                item => item.name?.toUpperCase() === stateConstituency.toUpperCase()
                            );
                            if (matchedAssembly && matchedAssembly.lga) {
                                lgaName = matchedAssembly.lga;
                            }
                        }
                    } catch (err) {
                        console.error("Error resolving State Assembly structural LGA boundaries:", err);
                    }
                }

                const currentScope = {
                    role: seat,
                    state: stateName,
                    lga: lgaName,
                    ward: metadata.assigned_ward || '',
                    senatorialDistrict: senatorialDistrict,
                    federalConstituency: federalConstituency,
                    stateConstituency: stateConstituency
                };

                setUserScope(currentScope);

                // DIRECT DATABASE PERSONNEL HYDRATION
                // Pull all assigned supervisors and agents tied to this candidate id
                const { data: personnelData, error: personnelError } = await supabase
                    .from('profiles')
                    .select('full_name, role, assigned_lgas, assigned_wards, assigned_pus')
                    .eq('candidate_id', user.id);

                if (!personnelError && personnelData) {
                    setCampaignPersonnel(personnelData);
                }

                // Initial Root Hydration: Pass full metadata context payload string parameters down
                if (currentScope.state) {
                    await fetchTreeRootTopology(stateName, seat, lgaName, stateConstituency, senatorialDistrict, federalConstituency);
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

    // Combined Root Tree Hydration Picker: Direct query fallback mechanisms for assembly seats
    const fetchTreeRootTopology = async (stateName, seat, lgaName, stateConstituency, senatorialDistrict, federalConstituency) => {
        try {
            let url = `/api/locations?state=${encodeURIComponent(stateName)}&includeSupervisors=true`;

            if (seat === 'senate' && senatorialDistrict) {
                url += `&senatorial_district=${encodeURIComponent(senatorialDistrict)}&seat=senate`;
            } else if (seat === 'house_of_reps' && federalConstituency) {
                url += `&fed_constituency=${encodeURIComponent(federalConstituency)}&seat=house_of_reps`;
            } else if (seat === 'house_of_assembly' && stateConstituency) {
                url += `&state_constituency=${encodeURIComponent(stateConstituency)}&seat=house_of_assembly`;
                if (lgaName) url += `&lga=${encodeURIComponent(lgaName)}`;
            } else if (seat === 'governor') {
                url += `&seat=governor`;
            }

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();

                // DYNAMIC FIX: If layout data has wards array instead of explicit structural macro LGAs, save it directly
                if (data.wards && (!data.lgas || data.lgas.length === 0)) {
                    setRootWards(data.wards);
                    setLgas([]);
                } else {
                    setLgas(data.lgas || []);
                    setRootWards([]);
                }
            }
        } catch (err) {
            console.error("Failed fetching tree root structural nodes:", err);
        }
    };

    // Async Fetch Branch: Wards & supervisors mapping info
    const fetchTreeWards = async (lgaName) => {
        if (wardsData[lgaName]) return; // Client cache hit

        try {
            const res = await fetch(`/api/locations?state=${encodeURIComponent(userScope.state)}&lga=${encodeURIComponent(lgaName)}&includeSupervisors=true`);
            if (res.ok) {
                const data = await res.json();
                setWardsData(prev => ({
                    ...prev,
                    [lgaName]: data.wards || []
                }));
            }
        } catch (err) {
            console.error(`Failed resolving Wards for ${lgaName}:`, err);
        }
    };

    // Async Fetch Branch: Polling Units & assigned field officials
    const fetchTreePollingUnits = async (lgaName, wardName) => {
        if (puData[wardName]) return; // Client cache hit

        try {
            // Allow structural missing parameters fallbacks if lgaName parameter value string is absent
            const cleanLgaParam = lgaName ? `&lga=${encodeURIComponent(lgaName)}` : '';
            const res = await fetch(`/api/locations?state=${encodeURIComponent(userScope.state)}${cleanLgaParam}&ward=${encodeURIComponent(wardName)}&includeAgents=true`);
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
        const isExpanding = !expandedLgas[lgaName];
        setExpandedLgas(prev => ({ ...prev, [lgaName]: isExpanding }));

        if (isExpanding) {
            startTransition(async () => {
                await fetchTreeWards(lgaName);
            });
        }
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
            const assigned = p.assigned_pus || [];
            return assigned.some(u =>
                u?.toUpperCase() === puCode?.toUpperCase() ||
                u?.toUpperCase() === puName?.toUpperCase()
            );
        });
        return match ? match.full_name : null;
    };

    if (isLoading) {
        return <LoadingOverlay message="Mapping command structure topology tree..." />;
    }

    // Determine targeted structural context arrays based on user scope values
    const isSubLgaContext = userScope.role === 'house_of_assembly' || rootWards.length > 0;

    const targetedLgas = userScope.role === 'chairman' || userScope.role === 'house_of_assembly' || userScope.role === 'councillor'
        ? lgas.filter(l => l.name?.toLowerCase() === userScope.lga?.toLowerCase())
        : lgas;

    return (
        <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
            {isPending && <LoadingOverlay message="Querying localized tactical unit metrics..." />}

            {/* Top Operational Breadcrumb Tracker */}
            <div className="border-b-2 border-[#8A7968]/20 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[#291C14] uppercase tracking-wide">Electoral Territory Command Tree</h1>
                    <p className="text-xs font-medium text-[#8A7968] mt-1">
                        Read-only deployment map matrix running from top structural boundaries straight down to polling unit points.
                    </p>
                </div>
                <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2 rounded-xl text-right">
                    <span className="block text-[9px] font-black uppercase text-[#8A7968]">Campaign Scope</span>
                    <span className="text-xs font-bold text-[#291C14] uppercase tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ') : 'Global Admin'} ({userScope.state || 'No State Specified'})
                        {userScope.lga && ` - ${userScope.lga} LGA`}
                        {userScope.stateConstituency && ` [${userScope.stateConstituency}]`}
                        {userScope.senatorialDistrict && ` (${userScope.senatorialDistrict} District)`}
                        {userScope.federalConstituency && ` (${userScope.federalConstituency})`}
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

                {/* Level 0: State Anchor Node */}
                <div className="flex items-center justify-between mb-6 bg-[#FAF6F0] p-4 rounded-xl border border-[#8A7968]/10">
                    <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full bg-[#9A6749] animate-pulse" />
                        <div>
                            <span className="block text-[9px] font-bold text-[#8A7968] uppercase tracking-widest">State Center Structure</span>
                            <h2 className="text-sm font-black text-[#291C14] uppercase tracking-wider">{userScope.state || 'N/A'} State</h2>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="bg-[#291C14] text-[#FAF6F0] text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md">
                            ROOT SYNC ACTIVE
                        </span>
                    </div>
                </div>

                {/* Dynamic Branch Layer: Swap between Standard LGA layout and direct Sub-LGA Ward branch arrays */}
                <div className="space-y-4 pl-4 border-l-2 border-[#8A7968]/10">

                    {!isSubLgaContext ? (
                        /* STANDARD LGA TREE RENDER BLOCK */
                        targetedLgas.length === 0 ? (
                            <p className="text-xs italic text-[#8A7968] font-medium">No Local Government Areas mapped under this configuration filter scope.</p>
                        ) : (
                            targetedLgas.map(lga => {
                                const isLgaOpen = !!expandedLgas[lga.name];
                                const structuralWards = wardsData[lga.name] || [];
                                const lgaSupervisor = lga.supervisorName || lga.supervisor_name || lga.supervisor || getLgaSupervisor(lga.name);

                                return (
                                    <div key={lga.name} className="space-y-2">
                                        {lga.name && (
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

                                        {isLgaOpen && (
                                            <div className="pl-6 space-y-3 border-l-2 border-[#9A6749]/20 pt-1 pb-2">
                                                {structuralWards.length === 0 ? (
                                                    <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-[#8A7968]/60 py-2 pl-2 italic">
                                                        <div className="w-2 h-2 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                                                        <span>Querying regional branch points...</span>
                                                    </div>
                                                ) : (
                                                    structuralWards.map(ward => {
                                                        const isWardOpen = !!expandedWards[ward.name];
                                                        const localizedPus = puData[ward.name] || [];
                                                        const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                                        return (
                                                            <div key={ward.name} className="space-y-2">
                                                                <div
                                                                    onClick={() => toggleWard(lga.name, ward.name)}
                                                                    className="flex items-center justify-between p-2.5 bg-[#FAF6F0]/30 hover:bg-[#FAF6F0] border border-[#8A7968]/20 rounded-lg cursor-pointer transition-all select-none"
                                                                >
                                                                    <div className="flex items-center space-x-2">
                                                                        <span className="text--------- text-[#9A6749] font-bold">
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

                                                                {isWardOpen && (
                                                                    <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-3 border-l border-dashed border-[#8A7968]/30 py-1">
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
                                                                                    <div key={pu.id || puCode || pu.name} className="p-3 bg-white border border-[#8A7968]/15 rounded-xl shadow-xs flex flex-col justify-between space-y-2 hover:border-[#9A6749]/30 transition-all">
                                                                                        <div>
                                                                                            <span className="block text-[8px] font-black tracking-widest text-[#8A7968] uppercase">CODE: {puCode || 'N/A'}</span>
                                                                                            <h6 className="text-[10px] font-black text-[#291C14] uppercase tracking-tight leading-tight mt-0.5">{pu.name}</h6>
                                                                                        </div>
                                                                                        <div className="pt-2 border-t border-[#FAF6F0] flex items-center justify-between">
                                                                                            <span className="text-[8px] font-bold text-[#8A7968] uppercase">Registered Official:</span>
                                                                                            {puAgent ? (
                                                                                                <span className="text-[9px] font-black text-green-700 bg-green-50/60 px-1.5 py-0.5 rounded border border-green-500/10 uppercase tracking-tight shadow-2xs">✓ {puAgent.toUpperCase()}</span>
                                                                                            ) : (
                                                                                                <span className="text-[8px] font-bold text-red-500 bg-red-50/60 px-1.5 py-0.5 rounded border border-red-500/10 uppercase tracking-tight">⚠️ UNASSIGNED</span>
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
                        )
                    ) : (
                        /* SUB-LGA DIRECT WARD ROOT TREE BLOCK */
                        rootWards.length === 0 ? (
                            <p className="text-xs italic text-[#8A7968] font-medium">No Electoral Wards mapped under this localized configuration scope footprint.</p>
                        ) : (
                            rootWards.map(ward => {
                                const isWardOpen = !!expandedWards[ward.name];
                                const localizedPus = puData[ward.name] || [];
                                const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                return (
                                    <div key={ward.name} className="space-y-2">
                                        <div
                                            onClick={() => toggleWard(userScope.lga, ward.name)}
                                            className="flex items-center justify-between p-3 bg-white hover:bg-[#FAF6F0]/50 border-2 border-[#8A7968]/15 rounded-xl cursor-pointer transition-all select-none"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <span className="text-xs text-[#9A6749] font-bold">
                                                    {isWardOpen ? '▼' : '▶'}
                                                </span>
                                                <div>
                                                    <div className="flex items-center space-x-2">
                                                        <h5 className="text-xs font-black text-[#291C14] uppercase tracking-wide">{ward.name} Ward</h5>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${wardSupervisor ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
                                                    </div>
                                                    <span className="text-[10px] text-[#8A7968] font-bold uppercase block">
                                                        {ward.puCount || ward.pu_count || 0} Units Mapped Inside Active Scope
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                {wardSupervisor ? (
                                                    <span className="bg-blue-50 border border-blue-500/20 text-blue-700 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                        Ward Lead: {wardSupervisor.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="bg-red-50 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                        Ward Lead Vacant
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {isWardOpen && (
                                            <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-3 border-l border-dashed border-[#8A7968]/30 py-1">
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
                                                            <div key={pu.id || puCode || pu.name} className="p-3 bg-white border border-[#8A7968]/15 rounded-xl shadow-xs flex flex-col justify-between space-y-2 hover:border-[#9A6749]/30 transition-all">
                                                                <div>
                                                                    <span className="block text-[8px] font-black tracking-widest text-[#8A7968] uppercase">CODE: {puCode || 'N/A'}</span>
                                                                    <h6 className="text-[10px] font-black text-[#291C14] uppercase tracking-tight leading-tight mt-0.5">{pu.name}</h6>
                                                                </div>
                                                                <div className="pt-2 border-t border-[#FAF6F0] flex items-center justify-between">
                                                                    <span className="text-[8px] font-bold text-[#8A7968] uppercase">Registered Official:</span>
                                                                    {puAgent ? (
                                                                        <span className="text-[9px] font-black text-green-700 bg-green-50/60 px-1.5 py-0.5 rounded border border-green-500/10 uppercase tracking-tight shadow-2xs">✓ {puAgent.toUpperCase()}</span>
                                                                    ) : (
                                                                        <span className="text-[8px] font-bold text-red-500 bg-red-50/60 px-1.5 py-0.5 rounded border border-red-500/10 uppercase tracking-tight">⚠️ UNASSIGNED</span>
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
                        )
                    )}

                </div>
            </div>
        </main>
    );
}