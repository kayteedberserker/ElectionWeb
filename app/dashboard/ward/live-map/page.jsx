'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
    MapPin,
    ChevronDown,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Building2,
    User,
    Users,
    Layers
} from 'lucide-react';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ElectoralDirectoryPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');

    // User context data metrics scoped exclusively to Ward Supervisor context
    const [userScope, setUserScope] = useState({
        role: '',
        state: '',
        assignedWards: [], // Holds authorized administrative wards
    });

    // Structural Navigation States
    const [expandedWards, setExpandedWards] = useState({});

    // Data Repository Cache Arrays
    const [wards, setWards] = useState([]);
    const [puData, setPuData] = useState({}); // Keyed by wardName

    // Personnel Registry Cache
    const [campaignPersonnel, setCampaignPersonnel] = useState([]);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = typeof window !== 'undefined'
        ? createBrowserClient(supabaseUrl, supabaseKey)
        : null;

    useEffect(() => {
        async function loadRegionalDirectory() {
            if (!supabase) return;
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();

                if (userError || !user) {
                    setError('Failed to authenticate session.');
                    return;
                }

                // Fetch profile metrics matching active user account
                const { data: userProfile, error: profileFetchError } = await supabase
                    .from('profiles')
                    .select('role, assigned_wards, assigned_state, candidate_id')
                    .eq('id', user.id)
                    .single();

                if (profileFetchError || !userProfile) {
                    console.error("Profile structural parsing failure:", profileFetchError);
                    setError('Failed to resolve user profile records.');
                    return;
                }

                const seat = userProfile.role || '';
                const userState = userProfile.assigned_state || 'OSUN';

                // Parse authorized assigned Wards list safely
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

                const targetCandidateId = userProfile.candidate_id;

                // Populate baseline directory profiles for regional mapping
                if (targetCandidateId) {
                    const { data: personnelData, error: personnelError } = await supabase
                        .from('profiles')
                        .select('full_name, role, assigned_lgas, assigned_wards, assigned_pus')
                        .eq('candidate_id', targetCandidateId);

                    if (!personnelError && personnelData) {
                        setCampaignPersonnel(personnelData);
                    }
                } else {
                    console.warn("Could not determine candidate tracking structural bounds.");
                }

                // Query initial metrics for authorized local structures directly
                if (assignedWardsList.length > 0) {
                    await fetchDirectoryWards(assignedWardsList, userState);
                }
            } catch (err) {
                console.error("Root structural layout error:", err);
                setError('An unexpected error occurred loading regional structures.');
            } finally {
                setIsLoading(false);
            }
        }

        loadRegionalDirectory();
    }, [supabase]);

    // Request location details for each assigned Ward
    const fetchDirectoryWards = async (assignedWardsList, userState) => {
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
            console.error("Failed fetching ward structures sequentially:", err);
        }
    };

    // Fetch polling units under a designated ward
    const fetchDirectoryPollingUnits = async (wardName) => {
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

    const toggleWardSelection = (wardName) => {
        const isExpanding = !expandedWards[wardName];
        setExpandedWards(prev => ({ ...prev, [wardName]: isExpanding }));

        if (isExpanding) {
            startTransition(async () => {
                await fetchDirectoryPollingUnits(wardName);
            });
        }
    };

    // Cross-reference data match helpers
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
        return <LoadingOverlay message="Loading structural data directory..." />;
    }

    return (
        <main className="py-4 max-w-5xl mx-auto space-y-8 text-textMain">
            {isPending && <LoadingOverlay message="Updating tracking matrix..." />}

            {/* Profile Metrics Overview Header */}
            <div className="border-b border-textMuted/20 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-textMuted bg-background px-2 py-0.5 rounded border border-textMuted/10">
                            Regional Boundaries
                        </span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-textMain uppercase">Electoral Ward Directory</h1>
                    <p className="text-xs font-medium text-textMuted uppercase tracking-wide flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> Track active supervisor coverage and agent assignments across registered units.
                    </p>
                </div>
                <div className="bg-card border border-textMuted/20 px-4 py-3 rounded-xl shadow-sm text-left md:text-right min-w-[180px]">
                    <span className="block text-[10px] font-black text-textMuted uppercase tracking-wider mb-0.5">Management Role</span>
                    <span className="text-xs font-black text-primary tracking-wide block uppercase">
                        {userScope.role ? userScope.role.replace(/_/g, ' ') : 'WARD SUPERVISOR'}
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-gold/10 border border-gold/30 text-gold text-xs font-bold uppercase tracking-wide rounded-xl flex items-center gap-2 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Directory Structural Interface Container */}
            <div className="bg-card border border-textMuted/20 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                    <h3 className="text-base font-black tracking-tight text-textMain uppercase flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" /> Ward Status & Assignment Directory
                    </h3>
                    <p className="text-xs font-medium text-textMuted mt-0.5">
                        Expand a ward selection to view sub-assigned polling units and active field personnel.
                    </p>
                </div>

                {/* Ward Deployment Grid Lists */}
                <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-background">
                    {wards.length === 0 ? (
                        <p className="text-xs font-bold uppercase tracking-wider text-textMuted italic pl-2">
                            No assigned wards mapped to this account profile.
                        </p>
                    ) : (
                        wards.map(ward => {
                            const isWardOpen = !!expandedWards[ward.name];
                            const localizedPus = puData[ward.name] || [];
                            const wardSupervisor = ward.supervisor || getWardSupervisor(ward.name);

                            return (
                                <div key={ward.name} className="border border-textMuted/20 rounded-xl overflow-hidden bg-card shadow-sm transition-all">

                                    {/* Expandable Ward Header trigger block */}
                                    <div
                                        onClick={() => toggleWardSelection(ward.name)}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-background/40 cursor-pointer transition-all select-none gap-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg border transition-colors ${isWardOpen ? 'bg-primary/10 text-primary border-primary/20' : 'bg-background text-textMuted border-textMuted/10'}`}>
                                                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isWardOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-black text-textMain uppercase tracking-tight">{ward.name} Ward</h4>
                                                    <span className={`w-2 h-2 rounded-full ${wardSupervisor ? 'bg-accent animate-pulse' : 'bg-gold'}`} />
                                                </div>
                                                <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider mt-0.5 block">
                                                    {ward.puCount || 0} Polling Units Registered
                                                </span>
                                            </div>
                                        </div>

                                        {/* Supervisor Status Tag Element */}
                                        <div className="flex items-center gap-2 sm:text-right">
                                            {wardSupervisor ? (
                                                <span className="bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5">
                                                    <User className="w-3 h-3" /> Coordinator: {wardSupervisor.toUpperCase()}
                                                </span>
                                            ) : (
                                                <span className="bg-gold/10 border border-gold/20 text-gold text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg">
                                                    Coordinator Vacant
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Polling Units Station Sub-Grid Node */}
                                    {isWardOpen && (
                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background border-t border-textMuted/20 animate-fadeIn">
                                            {localizedPus.length === 0 ? (
                                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-textMuted col-span-2 py-4 justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                    <span>Loading polling units data...</span>
                                                </div>
                                            ) : (
                                                localizedPus.map(pu => {
                                                    const puCode = pu.code || pu.polling_unit_code;
                                                    const puAgent = pu.agentName || pu.agent_name || pu.assigned_agent || pu.agent || getPuAgent(puCode, pu.name);

                                                    return (
                                                        <div
                                                            key={pu.id || puCode || pu.name}
                                                            className="p-4 border rounded-xl flex flex-col justify-between space-y-4 bg-card border-textMuted/20 shadow-sm hover:border-textMuted/40 transition-all"
                                                        >
                                                            <div className="flex justify-between items-start gap-3">
                                                                <div className="space-y-1">
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-black text-textMuted uppercase tracking-wider bg-background px-2 py-0.5 rounded border border-textMuted/10">
                                                                        Code: {puCode || 'N/A'}
                                                                    </span>
                                                                    <h6 className="text-xs font-black text-textMain uppercase tracking-tight leading-snug flex items-center gap-1.5 pt-0.5">
                                                                        <Building2 className="w-3.5 h-3.5 text-textMuted shrink-0" /> {pu.name}
                                                                    </h6>
                                                                </div>
                                                                <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg whitespace-nowrap border ${puAgent ? 'bg-accent/10 text-accent border-accent/20' : 'bg-background text-textMuted border-textMuted/10'}`}>
                                                                    {puAgent ? 'Staff Verified' : 'Awaiting Assignment'}
                                                                </span>
                                                            </div>

                                                            {/* Station Agent Field Bind Status */}
                                                            <div className="pt-2.5 border-t border-background flex items-center justify-between gap-2">
                                                                <span className="text-[10px] font-black text-textMuted uppercase tracking-wider flex items-center gap-1">
                                                                    <Users className="w-3 h-3 text-textMuted" /> Field Agent:
                                                                </span>
                                                                {puAgent ? (
                                                                    <span className="text-[10px] font-black text-accent bg-accent/5 px-2.5 py-1 rounded border border-accent/10 uppercase tracking-wide flex items-center gap-1">
                                                                        <CheckCircle2 className="w-3 h-3 text-accent" />
                                                                        {puAgent.toUpperCase()}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-black text-gold bg-gold/5 px-2.5 py-1 rounded border border-gold/10 uppercase tracking-wider">
                                                                        Unassigned
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