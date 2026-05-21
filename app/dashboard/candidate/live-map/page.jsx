'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ChevronDown, AlertTriangle, CheckCircle2, Loader2, MapPin, ShieldCheck } from 'lucide-react';
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
        return <LoadingOverlay message="Loading electoral structure..." />;
    }

    // Determine targeted structural context arrays based on user scope values
    const isSubLgaContext = userScope.role === 'house_of_assembly' || rootWards.length > 0;

    const targetedLgas = userScope.role === 'chairman' || userScope.role === 'house_of_assembly' || userScope.role === 'councillor'
        ? lgas.filter(l => l.name?.toLowerCase() === userScope.lga?.toLowerCase())
        : lgas;

    return (
        <main className="p-4 px-0 max-w-5xl mx-auto space-y-8 bg-background text-textMain">
            {isPending && <LoadingOverlay message="Updating data..." />}

            {/* Top Operational Location Tracker */}
            <div className="border-b border-textMuted/20 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-textMain">Electoral Structure Overview</h1>
                    <p className="text-sm font-medium text-textMuted mt-1">
                        View the hierarchy of assigned personnel from Local Government Areas down to specific polling units.
                    </p>
                </div>
                <div className="bg-card border border-textMuted/20 px-4 py-3 rounded-xl shadow-sm text-left md:text-right">
                    <span className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-1">Administrative Jurisdiction</span>
                    <span className="text-sm font-bold text-textMain tracking-wide">
                        {userScope.role ? userScope.role.replace(/_/g, ' ').toUpperCase() : 'CENTRAL HEADQUARTERS'} ({userScope.state || 'All States'})
                        {userScope.lga && ` - ${userScope.lga} Local Government Area`}
                        {userScope.stateConstituency && ` [${userScope.stateConstituency}]`}
                        {userScope.senatorialDistrict && ` (${userScope.senatorialDistrict} District)`}
                        {userScope.federalConstituency && ` (${userScope.federalConstituency})`}
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* Core Territorial Tree Hierarchy Container */}
            <div className="bg-card border border-textMuted/20 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-textMain">Administrative Hierarchy Breakdown</h3>
                    <p className="text-sm text-textMuted mt-1">Track deployed field managers. Expand jurisdictions to view assigned operational workflows.</p>
                </div>

                {/* Level 0: State Anchor Node */}
                <div className="bg-background p-5 rounded-xl border border-textMuted/20 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center space-x-3">
                            <MapPin className="w-5 h-5 text-primary animate-pulse-luxury" />
                            <div>
                                <span className="block text-xs font-semibold text-textMuted uppercase tracking-wider">State Administration Level</span>
                                <h2 className="text-lg font-bold text-textMain">{userScope.state || 'N/A'} State</h2>
                            </div>
                        </div>
                        <div className="text-left sm:text-right">
                            <span className="bg-primary text-white text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" /> DATABASE SYNCHRONIZED
                            </span>
                        </div>
                    </div>
                </div>

                {/* Dynamic Tree Branches Container */}
                <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-textMuted/10">

                    {!isSubLgaContext ? (
                        /* STANDARD LGA TREE RENDER BLOCK */
                        targetedLgas.length === 0 ? (
                            <p className="text-sm text-textMuted font-medium pl-2">No Local Government Areas found for this view.</p>
                        ) : (
                            targetedLgas.map(lga => {
                                const isLgaOpen = !!expandedLgas[lga.name];
                                const structuralWards = wardsData[lga.name] || [];
                                const lgaSupervisor = lga.supervisorName || lga.supervisor_name || lga.supervisor || getLgaSupervisor(lga.name);

                                return (
                                    <div key={lga.name} className="border border-textMuted/20 rounded-xl overflow-hidden bg-card">
                                        {lga.name && (
                                            <div
                                                onClick={() => toggleLga(lga.name)}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-background cursor-pointer transition-all select-none gap-4"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className={`p-1.5 rounded-md ${isLgaOpen ? 'bg-textMuted/20 text-textMain' : 'bg-background text-textMuted'}`}>
                                                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isLgaOpen ? 'rotate-180' : ''}`} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-base font-bold text-textMain">{lga.name} Local Government Area</h4>
                                                        <span className="text-xs text-textMuted font-medium mt-0.5 block">
                                                            {lga.wardCount || lga.ward_count || 0} Wards Registered
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-2 sm:text-right">
                                                    {lgaSupervisor ? (
                                                        <span className="bg-accent-light border border-accent/20 text-accent text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                            LGA Supervisor: {lgaSupervisor.toUpperCase()}
                                                        </span>
                                                    ) : (
                                                        <span className="bg-gold-light/10 border border-gold/20 text-gold text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                            LGA Supervisor Vacant
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {isLgaOpen && (
                                            <div className="p-4 bg-background space-y-3 border-t border-textMuted/20">
                                                {structuralWards.length === 0 ? (
                                                    <div className="flex items-center space-x-2 text-sm text-textMuted py-2 pl-2">
                                                        <Loader2 className="w-4 h-4 text-textMuted animate-spin" />
                                                        <span>Loading registers...</span>
                                                    </div>
                                                ) : (
                                                    structuralWards.map(ward => {
                                                        const isWardOpen = !!expandedWards[ward.name];
                                                        const localizedPus = puData[ward.name] || [];
                                                        const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                                        return (
                                                            <div key={ward.name} className="border border-textMuted/20 rounded-lg bg-card overflow-hidden shadow-sm">
                                                                <div
                                                                    onClick={() => toggleWard(lga.name, ward.name)}
                                                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-background cursor-pointer transition-all select-none gap-3"
                                                                >
                                                                    <div className="flex items-center space-x-3">
                                                                        <div className={`p-1 rounded text-textMuted ${isWardOpen ? 'bg-background' : ''}`}>
                                                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isWardOpen ? 'rotate-180' : ''}`} />
                                                                        </div>
                                                                        <div>
                                                                            <h5 className="text-sm font-bold text-textMain">{ward.name} Ward</h5>
                                                                            <span className="text-xs text-textMuted font-medium block">
                                                                                {ward.puCount || ward.pu_count || 0} Polling Units Registered
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        {wardSupervisor ? (
                                                                            <span className="bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded shadow-xs">
                                                                                Ward Supervisor: {wardSupervisor.toUpperCase()}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="bg-red-50 border border-red-200 text-red-500 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded">
                                                                                Ward Supervisor Vacant
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {isWardOpen && (
                                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background border-t border-textMuted/20">
                                                                        {localizedPus.length === 0 ? (
                                                                            <div className="flex items-center space-x-2 text-sm text-textMuted col-span-2 py-2">
                                                                                <Loader2 className="w-4 h-4 text-textMuted animate-spin" />
                                                                                <span>Loading polling units...</span>
                                                                            </div>
                                                                        ) : (
                                                                            localizedPus.map(pu => {
                                                                                const puCode = pu.code || pu.polling_unit_code;
                                                                                const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                                                return (
                                                                                    <div key={pu.id || puCode || pu.name} className="p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all bg-card border-textMuted/20 shadow-sm">
                                                                                        <div className="flex justify-between items-start gap-3">
                                                                                            <div>
                                                                                                <span className="block text-xs font-bold text-textMuted mb-1">
                                                                                                    Code: {puCode || 'N/A'}
                                                                                                </span>
                                                                                                <h6 className="text-sm font-semibold text-textMain leading-snug">
                                                                                                    {pu.name}
                                                                                                </h6>
                                                                                            </div>
                                                                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${puAgent ? 'bg-accent-light text-accent' : 'bg-background text-textMuted'}`}>
                                                                                                {puAgent ? 'Official Assigned' : 'Awaiting Field Assignment'}
                                                                                            </span>
                                                                                        </div>

                                                                                        <div className="pt-2 border-t border-textMuted/10 flex items-center justify-between">
                                                                                            <span className="text-xs font-semibold text-textMuted uppercase">Assigned Official:</span>
                                                                                            {puAgent ? (
                                                                                                <span className="text-xs font-bold text-accent bg-accent-light px-2 py-1 rounded border border-accent/20 uppercase tracking-tight flex items-center">
                                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-accent mr-1" />
                                                                                                    {puAgent.toUpperCase()}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200 uppercase tracking-tight flex items-center gap-1">
                                                                                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Unassigned
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
                        )
                    ) : (
                        /* SUB-LGA DIRECT WARD ROOT TREE BLOCK */
                        rootWards.length === 0 ? (
                            <p className="text-sm text-textMuted font-medium pl-2">No Electoral Wards found for this view.</p>
                        ) : (
                            rootWards.map(ward => {
                                const isWardOpen = !!expandedWards[ward.name];
                                const localizedPus = puData[ward.name] || [];
                                const totalWardExpectedPus = ward.puCount || ward.pu_count || 0;
                                const wardSupervisor = ward.supervisorName || ward.supervisor_name || ward.supervisor || getWardSupervisor(ward.name);

                                return (
                                    <div key={ward.name} className="border border-textMuted/20 rounded-xl overflow-hidden bg-card">
                                        <div
                                            onClick={() => toggleWard(userScope.lga, ward.name)}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-background cursor-pointer transition-all select-none gap-4"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <div className={`p-1.5 rounded-md ${isWardOpen ? 'bg-textMuted/20 text-textMain' : 'bg-background text-textMuted'}`}>
                                                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isWardOpen ? 'rotate-180' : ''}`} />
                                                </div>
                                                <div>
                                                    <h5 className="text-base font-bold text-textMain">{ward.name} Ward</h5>
                                                    <span className="text-xs text-textMuted font-medium mt-0.5 block">
                                                        {totalWardExpectedPus} Polling Units Registered
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                {wardSupervisor ? (
                                                    <span className="bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-xs">
                                                        Ward Supervisor: {wardSupervisor.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="bg-red-50 border border-red-200 text-red-500 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                                        Ward Supervisor Vacant
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {isWardOpen && (
                                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background border-t border-textMuted/20">
                                                {localizedPus.length === 0 ? (
                                                    <div className="flex items-center space-x-2 text-sm text-textMuted col-span-2 py-2">
                                                        <Loader2 className="w-4 h-4 text-textMuted animate-spin" />
                                                        <span>Loading polling units...</span>
                                                    </div>
                                                ) : (
                                                    localizedPus.map(pu => {
                                                        const puCode = pu.code || pu.polling_unit_code;
                                                        const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                        return (
                                                            <div key={pu.id || puCode || pu.name} className="p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all bg-card border-textMuted/20 shadow-sm">
                                                                <div className="flex justify-between items-start gap-3">
                                                                    <div>
                                                                        <span className="block text-xs font-bold text-textMuted mb-1">
                                                                            Code: {puCode || 'N/A'}
                                                                        </span>
                                                                        <h6 className="text-sm font-semibold text-textMain leading-snug">
                                                                            {pu.name}
                                                                        </h6>
                                                                    </div>
                                                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${puAgent ? 'bg-accent-light text-accent' : 'bg-background text-textMuted'}`}>
                                                                        {puAgent ? 'Official Assigned' : 'Awaiting Field Assignment'}
                                                                    </span>
                                                                </div>

                                                                <div className="pt-2 border-t border-textMuted/10 flex items-center justify-between">
                                                                    <span className="text-xs font-semibold text-textMuted uppercase">Assigned Official:</span>
                                                                    {puAgent ? (
                                                                        <span className="text-xs font-bold text-accent bg-accent-light px-2 py-1 rounded border border-accent/20 uppercase tracking-tight flex items-center">
                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-accent mr-1" />
                                                                            {puAgent.toUpperCase()}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200 uppercase tracking-tight flex items-center gap-1">
                                                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Unassigned
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
                        )
                    )}

                </div>
            </div>
        </main>
    );
}