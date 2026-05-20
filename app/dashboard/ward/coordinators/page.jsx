'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function LgaSupervisorManageAgentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState({ type: null, text: '' });

    // Supervisor Profile State Configuration (Scoped cleanly to state and wards)
    const [supervisorProfile, setSupervisorProfile] = useState({
        state: '',
        assignedWards: []
    });

    // Dynamic Lists from Database
    const [jurisdictionWards, setJurisdictionWards] = useState([]); // Array of direct Ward structures
    const [selectedWardForPus, setSelectedWardForPus] = useState(''); // Active ward filter for leaf nodes
    const [pollingUnits, setPollingUnits] = useState([]); // Polling units under selected ward
    const [activeAgents, setActiveAgents] = useState([]); // Registered Field Agents

    // Form inputs variables state
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [selectedPUs, setSelectedPUs] = useState([]); // Array layout supporting multiple PU assignments
    const [generatedToken, setGeneratedToken] = useState('');

    // State for Reusable Agent Logic Selection
    const [useExistingAgent, setUseExistingAgent] = useState(false);
    const [SupervisorId, setSupervisorId] = useState(false);
    const [selectedExistingToken, setSelectedExistingToken] = useState('');

    const [isAssigningMode, setIsAssigningMode] = useState(false);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = typeof window !== 'undefined' ? createBrowserClient(supabaseUrl, supabaseKey) : null;

    // Helper to generate a clean, secure, easy-to-type deployment access token
    const generateSecureAgentToken = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like O, 0, I, 1
        let result = 'AGT-';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
            if (i === 2) result += '-';
        }
        return result;
    };

    // Auto-fill field state if supervisor switches to an existing operator selection
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
    }, [useExistingAgent, selectedExistingToken, activeAgents]);

    useEffect(() => {
        async function loadScopeAndPersonnel() {
            if (!supabase) return;
            setIsLoading(true);
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setStatusMessage({ type: 'error', text: 'Authentication out of sync. Please log in again.' });
                    return;
                }
                setSupervisorId(user.id);
                // Cross-reference flat profile architecture without LGA assumptions
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

                // Fetch existing polling unit agents assigned under this specific Supervisor
                const { data: activeProfiles, error: profilesFetchError } = await supabase
                    .from('profiles')
                    .select('id, full_name, phone, access_token, assigned_pus, status')
                    .eq('ward_supervisor_id', user.id) // Bound directly to parent supervisor
                    .eq('role', 'POLLING_UNIT_AGENT'); // Filter to only field agents
                console.log("active profiles are: ", activeProfiles);

                if (!profilesFetchError && activeProfiles) {
                    const unifiedCacheList = [];
                    activeProfiles.forEach(p => {
                        const puCoverage = p.assigned_pus || [];
                        unifiedCacheList.push({
                            id: p.id,
                            name: p.full_name,
                            phone: p.phone,
                            token: p.access_token,
                            assignedPUs: puCoverage, // Array of strings (names or codes)
                            status: p.status || "ACTIVE"
                        });
                    });
                    setActiveAgents(unifiedCacheList);
                }

            } catch (err) {
                console.error("Error loading supervisor scope context:", err);
                setStatusMessage({ type: 'error', text: 'Failed to resolve field agent data metrics.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadScopeAndPersonnel();
    }, [supabase]);

    // Fetch Polling Units for a specific ward when selected
    useEffect(() => {
        // Fallback checks to prioritize auto-selecting the first option if array contains data
        const activeWard = selectedWardForPus || supervisorProfile.assignedWards[0];
        const activeState = supervisorProfile.state;

        if (!activeWard || !activeState) return;

        async function fetchWardsLeafUnits() {
            try {
                const res = await fetch(`/api/locations?state=${encodeURIComponent(activeState)}&ward=${encodeURIComponent(activeWard)}`);
                if (res.ok) {
                    const data = await res.json();
                    setPollingUnits(data.pollingUnits || []);
                }
            } catch (err) {
                console.error("Failed fetching polling units leaf nodes:", err);
            }
        }
        fetchWardsLeafUnits();
    }, [selectedWardForPus, supervisorProfile.state, supervisorProfile.assignedWards]);

    const handleRegisterFieldAgent = async (e) => {
        e.preventDefault();
        setStatusMessage({ type: null, text: '' });

        if (selectedPUs.length === 0) {
            setStatusMessage({ type: 'error', text: 'Please select at least one Polling Unit node for allocation.' });
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
                    assignedPUs: selectedPUs, // Multiple PU array allocations mapped cleanly
                    useExistingAgent,
                    supervisorId: SupervisorId // Directly anchor to current supervisor's user ID for flat hierarchy mapping
                };

                // Transmit registration request over custom passwordless token pipeline API
                const res = await fetch('/api/candidate/create-field-agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to complete agent token allocation.");

                // Synchronize active local state dynamically
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
                    text: `Token allocation verified successfully. ${fullName.toUpperCase()} assigned to ${selectedPUs.length} target units. Token: ${generatedToken}`
                });

                // Clear input form variables
                setFullName('');
                setPhoneNumber('');
                setSelectedPUs([]);
                setSelectedExistingToken('');
                setIsAssigningMode(false);
            } catch (err) {
                setStatusMessage({ type: 'error', text: err.message.toUpperCase() });
                console.log(err, "is theerror");

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

    if (isLoading) {
        return <LoadingOverlay message="Synchronizing field agent allocation frameworks..." />;
    }

    return (
        <div className="min-h-screen bg-[#FAF6F0] selection:bg-[#9A6749]/20 p-4 sm:p-6 lg:p-8 text-[#291C14]">
            {isPending && <LoadingOverlay message="Processing agent secure token token allocation..." />}

            <style jsx global>{`
.custom-scrollbar::-webkit-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-webkit-scrollbar-track { background: #FAF6F0; border-radius: 8px; }
.custom-scrollbar::-webkit-webkit-scrollbar-thumb { background: #8A7968/30; border-radius: 8px; }
.custom-scrollbar::-webkit-webkit-scrollbar-thumb:hover { background: #9A6749/50; }
`}</style>

            <header className="max-w-7xl mx-auto mb-8 bg-white p-6 rounded-2xl border-2 border-[#8A7968]/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7968] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#8A7968]/10">
                        Operational Field Controller
                    </span>
                    <h1 className="text-2xl font-black tracking-tight text-[#291C14] uppercase pt-1">
                        PU Agent Token Allocation
                    </h1>
                    <p className="text-xs font-bold text-[#9A6749] uppercase tracking-wider flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-[#9A6749] rounded-full animate-pulse" />
                        Jurisdiction Wards Scope: {' '}
                        <span className="text-[#291C14] font-black tracking-wide bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#8A7968]/10">
                            {supervisorProfile.state || 'UNKNOWN'} STATE / {jurisdictionWards.length} WARDS RUNNING
                        </span>
                    </p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Left Section: Polling Units Mapped Matrix Layout */}
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl border-2 border-[#8A7968]/20 flex flex-col h-[75vh]">
                    <div className="mb-6 border-b-2 border-[#FAF6F0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-base font-black tracking-tight text-[#291C14] uppercase">
                                Polling Unit Grid Mapping
                            </h3>
                            <p className="text-xs font-medium text-[#8A7968] mt-0.5">
                                Select a targeted operational Ward branch to view and cluster tactical endpoints.
                            </p>
                        </div>
                        <div>
                            <select
                                value={selectedWardForPus}
                                onChange={(e) => {
                                    setSelectedWardForPus(e.target.value);
                                    setSelectedPUs([]);
                                    setIsAssigningMode(false);
                                }}
                                className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-white px-3 py-2 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none tracking-wide uppercase"
                            >
                                {jurisdictionWards.map((w, idx) => (
                                    <option key={idx} value={w}>{w.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {(!selectedWardForPus && jurisdictionWards.length === 0) ? (
                            <div className="flex flex-col items-center justify-center text-center py-24 bg-[#FAF6F0]/50 border-2 border-dashed border-[#8A7968]/20 rounded-xl">
                                <span className="text-3xl opacity-40">🗺️</span>
                                <p className="text-xs font-black uppercase tracking-widest text-[#8A7968] mt-3">
                                    Awaiting Ward Hierarchy Selection
                                </p>
                            </div>
                        ) : pollingUnits.length === 0 ? (
                            <div className="flex items-center justify-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-[#8A7968]/60 py-12">
                                <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#8A7968] animate-spin" />
                                <span>Pulling local terminal units from spatial register...</span>
                            </div>
                        ) : (
                            pollingUnits.map((pu, idx) => {
                                const puCode = pu.code || pu.polling_unit_code;
                                const agent = getAgentForPU(puCode, pu.name);
                                const isAssigned = !!agent;

                                return (
                                    <div
                                        key={pu.id || idx}
                                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${isAssigned
                                            ? 'bg-white border-[#8A7968]/20'
                                            : 'border-dashed border-[#9A6749]/30 bg-[#9A6749]/5 hover:bg-[#9A6749]/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black tracking-widest text-[#8A7968] block uppercase">
                                                    CODE: {puCode || 'N/A'}
                                                </span>
                                                <span className="text-xs font-black uppercase text-[#291C14] tracking-tight block">
                                                    {pu.name}
                                                </span>
                                                {isAssigned ? (
                                                    <div className="mt-1 bg-[#FAF6F0] px-2 py-1.5 rounded-lg border border-[#8A7968]/10 text-[10px]">
                                                        <span className="font-bold text-[#291C14] block">👤 {agent.name}</span>
                                                        <span className="font-mono text-[#9A6749] font-bold tracking-wider block mt-0.5">🔑 TOKEN: {agent.token}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded uppercase tracking-wider inline-block mt-1">
                                                        ⚠️ Vacant Unit Terminal
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAssigningMode(true);
                                                    if (!selectedPUs.includes(puCode || pu.name)) {
                                                        togglePUSelection(puCode || pu.name);
                                                    }
                                                }}
                                                className="bg-[#9A6749] hover:bg-[#291C14] text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all"
                                            >
                                                {isAssigned ? 'Add Extra Agent' : 'Queue Allocation'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Section: Form View Configuration */}
                <div className="lg:col-span-2">
                    {isAssigningMode ? (
                        <div className="bg-white p-6 rounded-2xl border-2 border-[#9A6749] h-fit shadow-lg animate-fadeIn">
                            <div className="mb-6 border-b-2 border-[#FAF6F0] pb-4 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-black tracking-tight text-[#291C14] uppercase">
                                        Deploy Agent Access Node
                                    </h3>
                                    <p className="text-[10px] font-bold text-[#8A7968] uppercase mt-0.5">
                                        Selected Terminals count: <span className="text-[#9A6749] font-black">{selectedPUs.length} Units</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssigningMode(false);
                                        setSelectedPUs([]);
                                        setUseExistingAgent(false);
                                    }}
                                    className="text-[10px] font-black text-[#8A7968] uppercase hover:text-[#291C14] bg-[#FAF6F0] px-3 py-1.5 rounded-lg border border-[#8A7968]/20 tracking-wider transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>

                            {statusMessage.text && (
                                <div className={`p-4 mb-5 rounded-xl border-2 text-[11px] font-bold uppercase tracking-wide leading-relaxed ${statusMessage.type === 'success'
                                    ? 'bg-green-50 border-green-500/30 text-green-700'
                                    : 'bg-red-50 border-red-500/30 text-red-700'
                                    }`}>
                                    {statusMessage.text}
                                </div>
                            )}

                            {/* Multi-PU Queue Visual Badge Display Component */}
                            {selectedPUs.length > 0 && (
                                <div className="mb-4 bg-[#FAF6F0] p-2.5 rounded-xl border border-[#8A7968]/20 max-h-[100px] overflow-y-auto custom-scrollbar">
                                    <span className="block text-[8px] font-black uppercase text-[#8A7968] mb-1">Queueing Allocation Bindings:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedPUs.map((pCode) => (
                                            <span key={pCode} className="bg-white border border-[#8A7968]/20 text-[#291C14] font-mono font-bold text-[9px] px-2 py-0.5 rounded-md flex items-center gap-1">
                                                {pCode}
                                                <button type="button" onClick={() => togglePUSelection(pCode)} className="text-red-500 font-sans hover:text-black font-black">×</button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeAgents.length > 0 && (
                                <div className="mb-5 bg-[#FAF6F0] p-3 rounded-xl border-2 border-[#8A7968]/10 space-y-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={useExistingAgent}
                                            onChange={(e) => {
                                                setUseExistingAgent(e.target.checked);
                                                setSelectedExistingToken('');
                                            }}
                                            className="w-4 h-4 accent-[#9A6749] cursor-pointer rounded"
                                        />
                                        <span className="text-xs font-black uppercase text-[#291C14] tracking-tight">
                                            Assign to Existing Agent Profile
                                        </span>
                                    </label>

                                    {useExistingAgent && (
                                        <div className="mt-1">
                                            <select
                                                value={selectedExistingToken}
                                                onChange={(e) => setSelectedExistingToken(e.target.value)}
                                                className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-white px-3 py-2.5 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none cursor-pointer tracking-wide uppercase"
                                            >
                                                <option value="">-- SELECT FIELD OPERATOR --</option>
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

                            <form onSubmit={handleRegisterFieldAgent} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8A7968]">Agent Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={useExistingAgent}
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        placeholder="Enter complete official name"
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-[#FAF6F0] disabled:opacity-60 px-4 py-3 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none tracking-wide uppercase"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8A7968]">Phone Contact Number</label>
                                    <input
                                        type="tel"
                                        required
                                        disabled={useExistingAgent}
                                        value={phoneNumber}
                                        onChange={e => setPhoneNumber(e.target.value)}
                                        placeholder="080XXXXXXXX"
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-[#FAF6F0] disabled:opacity-60 px-4 py-3 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none tracking-wide"
                                    />
                                </div>

                                <div className="space-y-1.5 bg-[#FAF6F0] p-4 rounded-xl border-2 border-dashed border-[#8A7968]/30">
                                    <label className="block text-[9px] font-black uppercase tracking-wider text-[#8A7968]">App Access Security Token</label>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-base font-mono font-black text-[#9A6749] tracking-widest select-all">
                                            {generatedToken || '---'}
                                        </span>
                                        {!useExistingAgent && (
                                            <button
                                                type="button"
                                                onClick={() => setGeneratedToken(generateSecureAgentToken())}
                                                className="text-[9px] font-black uppercase bg-white border px-2.5 py-1 rounded-md hover:bg-black hover:text-white transition-colors shadow-2xs"
                                            >
                                                Regen Token
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[9px] text-[#8A7968] font-medium leading-normal mt-2 uppercase">
                                        * This token acts as passwordless entry credentials for the app profile configuration matrix.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-[#9A6749] hover:bg-[#291C14] text-white text-xs font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-md border-2 border-transparent"
                                >
                                    {useExistingAgent ? 'Link Extra PUs to Agent' : `Deploy Agent with Access Token`}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-[#FAF6F0]/40 p-8 rounded-2xl border-2 border-dashed border-[#8A7968]/20 text-center py-16 flex flex-col items-center justify-center space-y-3 h-fit">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-2 border-[#8A7968]/10 text-xl shadow-sm">
                                🔑
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-xs font-black text-[#291C14] uppercase tracking-widest">
                                    Awaiting Terminal Selection
                                </h4>
                                <p className="text-[11px] text-[#8A7968] font-medium max-w-xs mx-auto leading-relaxed">
                                    Queue operational polling units from the interactive grid list configuration to initialize target secure token deployment.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}