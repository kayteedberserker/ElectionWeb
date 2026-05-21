'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
    User,
    Phone,
    Key,
    MapPin,
    AlertTriangle,
    RefreshCw,
    X,
    CheckCircle2,
    UserPlus,
    Loader2,
    Users,
    Building2,
    Hash,
    ShieldCheck,
    Search,
    Contact,
    Plus,
    Trash2,
    Check
} from 'lucide-react';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ManageAgentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState({ type: null, text: '' });

    // Supervisor Profile State Configuration (Scoped to state and wards)
    const [supervisorProfile, setSupervisorProfile] = useState({
        state: '',
        assignedWards: []
    });

    // Dynamic Lists from Database
    const [jurisdictionWards, setJurisdictionWards] = useState([]);
    const [selectedWardForPus, setSelectedWardForPus] = useState('');
    const [pollingUnits, setPollingUnits] = useState([]);
    const [activeAgents, setActiveAgents] = useState([]);

    // Form Input States
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [selectedPUs, setSelectedPUs] = useState([]);
    const [generatedToken, setGeneratedToken] = useState('');

    // Existing Agent Linkage Logic
    const [useExistingAgent, setUseExistingAgent] = useState(false);
    const [supervisorId, setSupervisorId] = useState('');
    const [selectedExistingToken, setSelectedExistingToken] = useState('');

    const [isAssigningMode, setIsAssigningMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = typeof window !== 'undefined' ? createBrowserClient(supabaseUrl, supabaseKey) : null;

    // Generates a clean, secure, alphanumeric deployment access token
    const generateSecureAgentToken = useCallback(() => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = 'AGT-';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
            if (i === 2) result += '-';
        }
        return result;
    }, []);

    // Sync inputs if supervisor selects an existing operator profile
    useEffect(() => {
        if (useExistingAgent && selectedExistingToken) {
            const matchedAgent = activeAgents.find(a => a.token === selectedExistingToken);
            if (matchedAgent) {
                setFullName(matchedAgent.name || '');
                setPhoneNumber(matchedAgent.phone || '');
                setGeneratedToken(matchedAgent.token || '');
            }
        } else if (!useExistingAgent) {
            setFullName('');
            setPhoneNumber('');
            setGeneratedToken(generateSecureAgentToken());
        }
    }, [useExistingAgent, selectedExistingToken, activeAgents, generateSecureAgentToken]);

    useEffect(() => {
        async function loadScopeAndPersonnel() {
            if (!supabase) return;
            setIsLoading(true);
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setStatusMessage({ type: 'error', text: 'Authentication session expired. Please log in again.' });
                    return;
                }
                setSupervisorId(user.id);

                const { data: publicProfile } = await supabase
                    .from('profiles')
                    .select('assigned_state, assigned_wards, id')
                    .eq('id', user.id)
                    .single();

                const stateName = publicProfile?.assigned_state || 'OSUN';
                const assignedWardsArray = publicProfile?.assigned_wards || [];

                setSupervisorProfile({
                    state: stateName,
                    assignedWards: assignedWardsArray
                });

                setJurisdictionWards(assignedWardsArray);
                setSelectedWardForPus(assignedWardsArray[0] || '');

                const { data: activeProfiles, error: profilesFetchError } = await supabase
                    .from('profiles')
                    .select('id, full_name, phone, access_token, assigned_pus, status')
                    .eq('ward_supervisor_id', user.id)
                    .eq('role', 'POLLING_UNIT_AGENT');

                if (!profilesFetchError && activeProfiles) {
                    const unifiedCacheList = activeProfiles.map(p => ({
                        id: p.id,
                        name: p.full_name,
                        phone: p.phone,
                        token: p.access_token,
                        assignedPUs: p.assigned_pus || [],
                        status: p.status || "ACTIVE"
                    }));
                    setActiveAgents(unifiedCacheList);
                }
            } catch (err) {
                console.error("Error loading supervisor administrative data:", err);
                setStatusMessage({ type: 'error', text: 'Failed to resolve field official profiling metrics.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadScopeAndPersonnel();
    }, [supabase]);

    // Fetch polling units under a designated ward selection
    useEffect(() => {
        const activeWard = selectedWardForPus || supervisorProfile.assignedWards[0];
        const activeState = supervisorProfile.state;

        if (!activeWard || !activeState) return;

        async function fetchWardsPollingUnits() {
            try {
                const res = await fetch(`/api/locations?state=${encodeURIComponent(activeState)}&ward=${encodeURIComponent(activeWard)}`);
                if (res.ok) {
                    const data = await res.json();
                    setPollingUnits(data.pollingUnits || []);
                }
            } catch (err) {
                console.error("Failed fetching regional constituency allocation records:", err);
            }
        }
        fetchWardsPollingUnits();
    }, [selectedWardForPus, supervisorProfile.state, supervisorProfile.assignedWards]);

    const handleRegisterFieldAgent = async (e) => {
        e.preventDefault();
        setStatusMessage({ type: null, text: '' });

        if (selectedPUs.length === 0) {
            setStatusMessage({ type: 'error', text: 'Please select at least one Polling Station for assignment.' });
            return;
        }

        startTransition(async () => {
            try {
                const payload = {
                    fullName,
                    phoneNumber,
                    accessToken: generatedToken,
                    role: 'POLLING_UNIT_AGENT',
                    assignedState: supervisorProfile.state,
                    assignedWards: [selectedWardForPus || supervisorProfile.assignedWards[0]],
                    assignedPUs: selectedPUs,
                    useExistingAgent,
                    supervisorId: supervisorId
                };

                const res = await fetch('/api/candidate/create-field-agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to finalize structural field assignment.");

                setActiveAgents(prev => {
                    if (useExistingAgent) {
                        return prev.map(a => a.token === generatedToken
                            ? { ...a, assignedPUs: Array.from(new Set([...a.assignedPUs, ...selectedPUs])) }
                            : a
                        );
                    } else {
                        return [...prev, { name: fullName, phone: phoneNumber, token: generatedToken, assignedPUs: selectedPUs, status: "ACTIVE" }];
                    }
                });

                setStatusMessage({
                    type: 'success',
                    text: `Official assignment updated successfully. ${fullName} allocated to ${selectedPUs.length} designated station locations. Token: ${generatedToken}`
                });

                setFullName('');
                setPhoneNumber('');
                setSelectedPUs([]);
                setSelectedExistingToken('');
                setIsAssigningMode(false);
            } catch (err) {
                setStatusMessage({ type: 'error', text: err.message.toUpperCase() });
            }
        });
    };

    const getAgentForPU = (puCode, puName) => {
        return activeAgents.find(agent =>
            (agent.assignedPUs || []).some(pu => pu?.toUpperCase() === puCode?.toUpperCase() || pu?.toUpperCase() === puName?.toUpperCase())
        );
    };

    const togglePUSelection = (puIdentifier) => {
        setSelectedPUs(prev =>
            prev.includes(puIdentifier)
                ? prev.filter(id => id !== puIdentifier)
                : [...prev, puIdentifier]
        );
    };

    // Derived descriptive metadata stats for the current directory view
    const filteredPollingUnits = pollingUnits.filter(pu => {
        const code = pu.code || pu.polling_unit_code || '';
        const name = pu.name || '';
        return code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const totalUnitsCount = pollingUnits.length;
    const staffedUnitsCount = pollingUnits.filter(pu => !!getAgentForPU(pu.code || pu.polling_unit_code, pu.name)).length;
    const vacantUnitsCount = totalUnitsCount - staffedUnitsCount;

    if (isLoading) {
        return <LoadingOverlay message="Loading official administrative mapping rosters..." />;
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 text-textMain selection:bg-primary/20">

            {/* Scope Header */}
            <header className="max-w-7xl mx-auto mb-8 bg-card p-6 rounded-2xl border border-textMuted/15 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xs">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-primary/10 rounded-lg text-primary">
                            <Building2 className="w-4 h-4" />
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-textMuted">
                            Electoral Field Operations Dashboard
                        </span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-textMain uppercase">
                        Official Token &amp; Station Assignment
                    </h1>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                        Jurisdictional Purview: {' '}
                        <span className="text-textMain font-black bg-background px-2 py-0.5 rounded border border-textMuted/10">
                            {supervisorProfile.state || 'UNKNOWN'} STATE
                        </span>
                    </p>
                </div>
            </header>

            {/* Institutional Ward Progress Dashboard Bar */}
            <section className="max-w-7xl mx-auto mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card p-4 rounded-xl border border-textMuted/15 flex items-center justify-between shadow-xs">
                    <div>
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Total Stations in Ward</p>
                        <p className="text-xl font-black text-textMain mt-0.5">{totalUnitsCount}</p>
                    </div>
                    <div className="p-2.5 bg-background border border-textMuted/10 rounded-lg text-textMuted">
                        <Hash className="w-5 h-5" />
                    </div>
                </div>
                <div className="bg-card p-4 rounded-xl border border-textMuted/15 flex items-center justify-between shadow-xs">
                    <div>
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Staffed Locations</p>
                        <p className="text-xl font-black text-accent mt-0.5">{staffedUnitsCount}</p>
                    </div>
                    <div className="p-2.5 bg-accent/10 rounded-lg text-accent">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                </div>
                <div className="bg-card p-4 rounded-xl border border-textMuted/15 flex items-center justify-between shadow-xs">
                    <div>
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Unassigned Vacancies</p>
                        <p className="text-xl font-black text-gold mt-0.5">{vacantUnitsCount}</p>
                    </div>
                    <div className="p-2.5 bg-gold/10 rounded-lg text-gold">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                </div>
            </section>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Left Column: Polling Stations Directory */}
                <div className="lg:col-span-3 bg-card p-6 rounded-2xl border border-textMuted/15 flex flex-col h-[75vh] shadow-xs">

                    {/* Filters & Navigation Controls Header */}
                    <div className="mb-6 space-y-4 border-b border-textMuted/10 pb-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-black tracking-tight text-textMain uppercase">
                                    Polling Station Directory
                                </h3>
                                <p className="text-xs font-medium text-textMuted mt-0.5">
                                    Filter by ward registration zones to modify official deployments.
                                </p>
                            </div>
                            <div className="min-w-[180px]">
                                <select
                                    value={selectedWardForPus}
                                    onChange={(e) => {
                                        setSelectedWardForPus(e.target.value);
                                        setSelectedPUs([]);
                                        setIsAssigningMode(false);
                                    }}
                                    className="block w-full rounded-xl border border-textMuted/20 bg-background px-3 py-2.5 text-xs font-bold text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none tracking-wide uppercase cursor-pointer transition-all"
                                >
                                    {jurisdictionWards.map((w, idx) => (
                                        <option key={idx} value={w}>{w.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Direct Station Text Search Filter */}
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-textMuted">
                                <Search className="w-4 h-4" />
                            </span>
                            <input
                                type="text"
                                placeholder="Search station names or descriptive numeric codes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="block w-full rounded-xl border border-textMuted/15 bg-background pl-10 pr-4 py-2 text-xs font-semibold text-textMain placeholder:text-textMuted/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Polling Units Core List Wrapper View */}
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 overflow-x-hidden custom-scrollbar">
                        {(!selectedWardForPus && jurisdictionWards.length === 0) ? (
                            <div className="flex flex-col items-center justify-center text-center py-24 bg-background/50 border border-dashed border-textMuted/20 rounded-xl">
                                <MapPin className="w-8 h-8 text-textMuted/30 mb-3" />
                                <p className="text-xs font-black uppercase tracking-widest text-textMuted">
                                    Awaiting Administration Ward Filter
                                </p>
                            </div>
                        ) : filteredPollingUnits.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 text-textMuted/60">
                                <Search className="w-6 h-6 mb-2 text-textMuted/30" />
                                <span className="text-xs font-bold uppercase tracking-wider">No matching station locations found</span>
                            </div>
                        ) : (
                            filteredPollingUnits.map((pu, idx) => {
                                const puCode = pu.code || pu.polling_unit_code;
                                const agent = getAgentForPU(puCode, pu.name);
                                const isAssigned = !!agent;
                                const isCurrentlySelected = selectedPUs.includes(puCode || pu.name);

                                return (
                                    <div
                                        key={pu.id || idx}
                                        className={`p-4 rounded-xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${isCurrentlySelected
                                            ? 'border-primary ring-1 ring-primary bg-primary/5'
                                            : isAssigned
                                                ? 'bg-card border-textMuted/15 hover:border-textMuted/30'
                                                : 'border-dashed border-textMuted/30 bg-background hover:bg-card'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono font-bold tracking-wider text-textMuted bg-background px-1.5 py-0.5 rounded border border-textMuted/15 uppercase">
                                                        Code: {puCode || 'N/A'}
                                                    </span>
                                                    {isCurrentlySelected && (
                                                        <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded uppercase tracking-wider">
                                                            In Assignment Queue
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-sm font-bold text-textMain tracking-tight block uppercase">
                                                    {pu.name}
                                                </span>

                                                {isAssigned ? (
                                                    <div className="mt-2 bg-background p-2 rounded-lg border border-textMuted/10 text-[11px] space-y-1 max-w-sm">
                                                        <span className="font-bold text-textMain flex items-center gap-1.5">
                                                            <User className="w-3.5 h-3.5 text-primary shrink-0" /> {agent.name}
                                                        </span>
                                                        <span className="font-mono text-textMuted flex items-center gap-1.5">
                                                            <Key className="w-3.5 h-3.5 shrink-0" /> Token ID: <span className="text-primary font-bold">{agent.token}</span>
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-gold bg-gold/5 border border-gold/20 px-2.5 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1.5 mt-1">
                                                        <AlertTriangle className="w-3.5 h-3.5" /> Vacant Station Assignment
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAssigningMode(true);
                                                    togglePUSelection(puCode || pu.name);
                                                }}
                                                className={`text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs ${isCurrentlySelected
                                                    ? 'bg-textMain text-white hover:bg-gold'
                                                    : 'bg-primary hover:bg-textMain text-white'
                                                    }`}
                                            >
                                                {isCurrentlySelected ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5" /> Selected
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-3.5 h-3.5" /> {isAssigned ? 'Add Official' : 'Assign Station'}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Column: Dynamic Form Workspace Panel */}
                <div className="lg:col-span-2">
                    {isAssigningMode ? (
                        <div className="bg-card p-6 rounded-2xl border border-primary h-fit shadow-xs animate-fadeIn">
                            <div className="mb-6 border-b border-textMuted/10 pb-4 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-black tracking-tight text-textMain uppercase">
                                        Setup Assignment Profile
                                    </h3>
                                    <p className="text-[10px] font-bold text-textMuted uppercase mt-0.5">
                                        Selected Stations: <span className="text-primary font-black">{selectedPUs.length} Locations queued</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssigningMode(false);
                                        setSelectedPUs([]);
                                        setUseExistingAgent(false);
                                    }}
                                    className="text-[10px] font-black text-textMuted uppercase hover:text-textMain bg-background px-3 py-1.5 rounded-lg border border-textMuted/15 tracking-wider transition-colors flex items-center gap-1"
                                >
                                    <X className="w-3.5 h-3.5" /> Close
                                </button>
                            </div>

                            {statusMessage.text && (
                                <div className={`p-4 mb-5 rounded-xl border text-[11px] font-bold uppercase tracking-wide leading-relaxed flex items-center gap-2 ${statusMessage.type === 'success'
                                    ? 'bg-accent/10 border-accent/30 text-accent'
                                    : 'bg-gold/10 border-gold/30 text-gold'
                                    }`}>
                                    {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                                    <span>{statusMessage.text}</span>
                                </div>
                            )}

                            {/* Selection Summary Roster Chips */}
                            {selectedPUs.length > 0 && (
                                <div className="mb-5 bg-background p-3 rounded-xl border border-textMuted/15 max-h-[120px] overflow-y-auto custom-scrollbar">
                                    <span className="block text-[9px] font-black uppercase text-textMuted mb-2 tracking-wide">Assigned Polling Stations:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedPUs.map((pCode) => (
                                            <span key={pCode} className="bg-card border border-textMuted/20 text-textMain font-mono font-bold text-[9px] pl-2.5 pr-1.5 py-1 rounded-lg flex items-center gap-1">
                                                {pCode}
                                                <button
                                                    type="button"
                                                    onClick={() => togglePUSelection(pCode)}
                                                    className="text-textMuted hover:text-gold p-0.5 rounded transition-colors"
                                                    title="Remove from assignment batch"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Toggle switch for linking existing verified agents */}
                            {activeAgents.length > 0 && (
                                <div className="mb-5 bg-background p-3.5 rounded-xl border border-textMuted/10 space-y-3">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={useExistingAgent}
                                            onChange={(e) => {
                                                setUseExistingAgent(e.target.checked);
                                                setSelectedExistingToken('');
                                            }}
                                            className="w-4 h-4 accent-primary cursor-pointer rounded border-textMuted/30 text-white focus:ring-0 focus:ring-offset-0"
                                        />
                                        <span className="text-xs font-black uppercase text-textMain tracking-tight flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-textMuted" /> Link to Existing Registered Field Agent
                                        </span>
                                    </label>

                                    {useExistingAgent && (
                                        <div className="mt-2 animate-slideDown">
                                            <select
                                                value={selectedExistingToken}
                                                onChange={(e) => setSelectedExistingToken(e.target.value)}
                                                className="block w-full rounded-xl border border-textMuted/20 bg-card px-3 py-2.5 text-xs font-bold text-textMain focus:border-primary focus:outline-none cursor-pointer tracking-wide uppercase"
                                            >
                                                <option value="">-- SELECT FIELD OPERATOR PROFILE --</option>
                                                {activeAgents.map((agent, sIdx) => (
                                                    <option key={sIdx} value={agent.token}>
                                                        {agent.name.toUpperCase()} [{agent.token}]
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Core Registration Credentials Form */}
                            <form onSubmit={handleRegisterFieldAgent} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                                        <Contact className="w-3.5 h-3.5" /> Agent Full Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        disabled={useExistingAgent}
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        placeholder="Enter full legal name"
                                        className="block w-full rounded-xl border border-textMuted/20 bg-background disabled:opacity-50 px-4 py-3 text-xs font-bold text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none tracking-wide uppercase transition-all"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                                        <Phone className="w-3.5 h-3.5" /> Contact Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        disabled={useExistingAgent}
                                        value={phoneNumber}
                                        onChange={e => setPhoneNumber(e.target.value)}
                                        placeholder="e.g., 08031234567"
                                        className="block w-full rounded-xl border border-textMuted/20 bg-background disabled:opacity-50 px-4 py-3 text-xs font-bold text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none tracking-wide transition-all"
                                    />
                                </div>

                                <div className="space-y-2 bg-background p-4 rounded-xl border border-dashed border-textMuted/25">
                                    <label className="block text-[9px] font-black uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Security Verification Token
                                    </label>
                                    <div className="flex items-center justify-between mt-1 gap-4">
                                        <span className="text-lg font-mono font-black text-primary tracking-widest select-all bg-card/60 px-3 py-1.5 rounded-lg border border-textMuted/10">
                                            {generatedToken || '---'}
                                        </span>
                                        {!useExistingAgent && (
                                            <button
                                                type="button"
                                                onClick={() => setGeneratedToken(generateSecureAgentToken())}
                                                className="text-[9px] font-black uppercase bg-card border border-textMuted/20 px-3 py-2 rounded-xl hover:bg-textMain hover:text-white transition-all flex items-center gap-1.5 shadow-2xs"
                                            >
                                                <RefreshCw className="w-3 h-3" /> Regenerate
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[9px] text-textMuted font-medium leading-normal mt-2.5 uppercase border-t border-textMuted/10 pt-2">
                                        * This security credential enables authenticated data transmission workflows within official local mobile deployment clients.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-full bg-primary hover:bg-textMain disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-xs border border-transparent flex items-center justify-center gap-2"
                                >
                                    {isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" /> Finalizing Assignment...
                                        </>
                                    ) : useExistingAgent ? (
                                        'Authorize Station Linkage'
                                    ) : (
                                        'Generate Official Access Account'
                                    )}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-card/30 p-8 rounded-2xl border border-dashed border-textMuted/25 text-center py-20 flex flex-col items-center justify-center space-y-4 h-fit shadow-2xs">
                            <div className="w-14 h-14 bg-card rounded-2xl flex items-center justify-center border border-textMuted/15 text-primary shadow-2xs">
                                <UserPlus className="w-6 h-6" />
                            </div>
                            <div className="space-y-1.5 max-w-xs mx-auto">
                                <h4 className="text-xs font-black text-textMain uppercase tracking-widest">
                                    No Station Selection Active
                                </h4>
                                <p className="text-xs text-textMuted font-medium leading-relaxed">
                                    Select an available station from the station directory layout list on the left to allocate security access credentials or modify assigned personnel parameters.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}