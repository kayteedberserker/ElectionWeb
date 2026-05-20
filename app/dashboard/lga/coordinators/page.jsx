'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function LgaSupervisorManageWardsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState({ type: null, text: '' });

    // Supervisor Profile State Configuration
    const [supervisorProfile, setSupervisorProfile] = useState({
        state: '',
        assignedLgas: []
    });

    // Dynamic Lists from Database
    const [jurisdictionWards, setJurisdictionWards] = useState([]); // Holds all Wards under supervisor's assigned LGAs
    const [activeWardSupervisors, setActiveWardSupervisors] = useState([]); // Ward supervisors fetched from database

    // Form inputs variables state
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [selectedTargetWard, setSelectedTargetWard] = useState(''); // Chosen Ward Name for assignment

    // State for Reusable Supervisor Logic Selection
    const [useExistingSupervisor, setUseExistingSupervisor] = useState(false);
    const [selectedExistingEmail, setSelectedExistingEmail] = useState('');

    const [isAssigningMode, setIsAssigningMode] = useState(false);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = typeof window !== 'undefined' ? createBrowserClient(supabaseUrl, supabaseKey) : null;

    // Helper to extract clean unique list of supervisors out of current database metrics
    const getUniqueSupervisorsList = () => {
        const seen = new Set();
        return activeWardSupervisors.filter(sup => {
            if (!sup.email || seen.has(sup.email.toLowerCase())) return false;
            seen.add(sup.email.toLowerCase());
            return true;
        });
    };

    // Auto-fill field state if supervisor switches to an existing operator selection
    useEffect(() => {
        if (useExistingSupervisor && selectedExistingEmail) {
            const matchedSup = activeWardSupervisors.find(
                s => s.email?.toLowerCase() === selectedExistingEmail.toLowerCase()
            );
            if (matchedSup) {
                setFullName(matchedSup.name || '');
                setEmail(matchedSup.email || '');
                setPassword(''); // Blank out password requirement for existing instances
            }
        } else if (!useExistingSupervisor) {
            setFullName('');
            setEmail('');
            setPassword('');
        }
    }, [useExistingSupervisor, selectedExistingEmail, activeWardSupervisors]);

    useEffect(() => {
        async function loadScopeAndWardSupervisors() {
            if (!supabase) return;
            setIsLoading(true);
            try {
                // 1. Fetch User Session Profile Metadata to detect supervisor boundary scope
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setStatusMessage({ type: 'error', text: 'Authentication out of sync. Please log in again.' });
                    return;
                }

                // Cross-reference public profiles table
                const { data: publicProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                const metadata = user.user_metadata || {};

                const stateName = publicProfile?.assigned_state || metadata.assigned_state || '';
                const dbLgas = publicProfile?.assigned_lgas || metadata.assigned_lgas;
                const assignedLgasArray = Array.isArray(dbLgas) ? dbLgas : dbLgas ? [dbLgas] : [];

                setSupervisorProfile({
                    state: stateName,
                    assignedLgas: assignedLgasArray
                });

                // 2. Query all Wards across all assigned LGAs in parallel
                let compiledWards = [];
                if (stateName && assignedLgasArray.length > 0) {
                    const fetchPromises = assignedLgasArray.map(async (lgaName) => {
                        const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}&lga=${encodeURIComponent(lgaName)}`);
                        if (res.ok) {
                            const data = await res.json();
                            return data.wards || [];
                        }
                        return [];
                    });

                    const results = await Promise.all(fetchPromises);
                    compiledWards = results.flat();
                }
                setJurisdictionWards(compiledWards);

                // 3. Directly query public profiles table to fetch ward supervisors registered under this supervisor
                const { data: activeProfiles, error: profilesFetchError } = await supabase
                    .from('profiles')
                    .select('id, full_name, email, assigned_wards, status')
                    .eq('lga_supervisor_id', user.id) // Bound directly to this LGA Supervisor's ID
                    .eq('role', 'WARD_SUPERVISOR');

                if (!profilesFetchError && activeProfiles) {
                    const unifiedCacheList = [];
                    activeProfiles.forEach(p => {
                        const coverageArray = p.assigned_wards || [];
                        if (coverageArray.length === 0) {
                            unifiedCacheList.push({
                                id: p.id,
                                name: p.full_name,
                                email: p.email,
                                unit: null,
                                status: p.status || "ACTIVE"
                            });
                        } else {
                            coverageArray.forEach(wardName => {
                                unifiedCacheList.push({
                                    id: p.id,
                                    name: p.full_name,
                                    email: p.email,
                                    unit: wardName,
                                    status: p.status || "ACTIVE"
                                });
                            });
                        }
                    });
                    setActiveWardSupervisors(unifiedCacheList);
                }

            } catch (err) {
                console.error("Error loading supervisor scope context:", err);
                setStatusMessage({ type: 'error', text: 'Failed to resolve ward jurisdiction structures.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadScopeAndWardSupervisors();
    }, [supabase]);

    const handleCreateWardSupervisor = async (e) => {
        e.preventDefault();
        setStatusMessage({ type: null, text: '' });

        if (useExistingSupervisor && !selectedExistingEmail) {
            setStatusMessage({ type: 'error', text: 'Please select an existing supervisor from the list configuration.' });
            return;
        }

        startTransition(async () => {
            try {
                const payload = {
                    fullName,
                    email: email.toLowerCase().trim(),
                    password: useExistingSupervisor ? null : password,
                    role: 'WARD_SUPERVISOR',
                    assignedState: supervisorProfile.state,
                    targetUnit: selectedTargetWard // Pass single requested ward name to endpoint safely
                };

                // Reusing or pointing to your dedicated supervisor creation layout API
                const res = await fetch('/api/candidate/create-ward-supervisor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to complete ward supervisor account allocation.");

                // Synchronize active local application state cache array dynamically
                setActiveWardSupervisors(prev => [
                    ...prev,
                    { name: fullName, unit: selectedTargetWard, email: email.toLowerCase().trim(), status: "ACTIVE" }
                ]);

                setStatusMessage({
                    type: 'success',
                    text: data.isExistingUser
                        ? `${fullName.toUpperCase()} has been successfully assigned additional management over ward: ${selectedTargetWard.toUpperCase()}.`
                        : `Ward supervisor account created successfully: ${fullName.toUpperCase()} has been assigned to ${selectedTargetWard.toUpperCase()}.`
                });

                // Clear input form variables
                setFullName('');
                setEmail('');
                setPassword('');
                setSelectedTargetWard('');
                setSelectedExistingEmail('');
                setUseExistingSupervisor(false);
                setIsAssigningMode(false);
            } catch (err) {
                setStatusMessage({ type: 'error', text: err.message.toUpperCase() });
            }
        });
    };

    const getWardSupervisor = (wardName) => {
        return activeWardSupervisors.find(sup => sup.unit?.toUpperCase() === wardName.toUpperCase());
    };

    const initiateAssignment = (wardName) => {
        setSelectedTargetWard(wardName);
        setIsAssigningMode(true);
        setUseExistingSupervisor(false);
        setSelectedExistingEmail('');
        setStatusMessage({ type: null, text: '' });

        const existingSup = activeWardSupervisors.find(s => s.unit?.toUpperCase() === wardName.toUpperCase());
        if (existingSup) {
            setFullName(existingSup.name || '');
            setEmail(existingSup.email || '');
        }
    };

    if (isLoading) {
        return <LoadingOverlay message="Synchronizing ward jurisdiction boundaries..." />;
    }

    return (
        <div className="min-h-screen bg-[#FAF6F0] selection:bg-[#9A6749]/20 p-4 sm:p-6 lg:p-8 text-[#291C14]">
            {isPending && <LoadingOverlay message="Registering ward supervisor details..." />}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #FAF6F0;
                    border-radius: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #8A7968/30;
                    border-radius: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #9A6749/50;
                }
            `}</style>

            <header className="max-w-7xl mx-auto mb-8 bg-white p-6 rounded-2xl border-2 border-[#8A7968]/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#8A7968] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#8A7968]/10">
                        Management Dashboard
                    </span>
                    <h1 className="text-2xl font-black tracking-tight text-[#291C14] uppercase pt-1">
                        Ward Supervisor Management
                    </h1>
                    <p className="text-xs font-bold text-[#9A6749] uppercase tracking-wider flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-[#9A6749] rounded-full animate-pulse" />
                        Jurisdiction: {' '}
                        <span className="text-[#291C14] font-black tracking-wide bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#8A7968]/10">
                            {supervisorProfile.state || 'UNKNOWN'} STATE / LGAs: {supervisorProfile.assignedLgas.join(', ').toUpperCase()}
                        </span>
                    </p>
                </div>
                <div className="bg-[#FAF6F0] border-2 border-[#8A7968]/20 p-4 rounded-xl min-w-[160px] text-center shadow-inner relative overflow-hidden group">
                    <p className="text-[10px] font-black text-[#8A7968] uppercase tracking-wider mb-0.5">
                        Wards Assigned
                    </p>
                    <p className="text-2xl font-black text-[#291C14] tracking-tight">
                        {jurisdictionWards.filter(w => getWardSupervisor(w.name)).length}
                        <span className="text-xs font-bold text-[#8A7968] mx-1">/</span>
                        <span className="text-base text-[#8A7968]">{jurisdictionWards.length || '--'}</span>
                    </p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Left Section: List of Wards */}
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl border-2 border-[#8A7968]/20 flex flex-col h-[75vh]">
                    <div className="mb-6 border-b-2 border-[#FAF6F0] pb-4">
                        <h3 className="text-base font-black tracking-tight text-[#291C14] uppercase">
                            Ward Jurisdiction Coverage
                        </h3>
                        <p className="text-xs font-medium text-[#8A7968] mt-0.5">
                            Real-time assignment mapping of wards across your designated Local Government Areas.
                        </p>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {jurisdictionWards.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-[#FAF6F0]/50 border-2 border-dashed border-[#8A7968]/20 rounded-xl">
                                <span className="text-3xl opacity-40">🗺️</span>
                                <p className="text-xs font-black uppercase tracking-widest text-[#8A7968] mt-3">
                                    No operational wards resolved.
                                </p>
                            </div>
                        ) : (
                            jurisdictionWards.map((ward, idx) => {
                                const supervisor = getWardSupervisor(ward.name);
                                const isAssigned = !!supervisor;

                                return (
                                    <div
                                        key={ward.id || idx}
                                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${isAssigned
                                            ? 'bg-white border-[#8A7968]/20 hover:border-[#9A6749]/40 shadow-sm'
                                            : 'border-dashed border-[#9A6949]/30 bg-[#9A6749]/5 hover:bg-[#9A6749]/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 px-2 py-1 rounded text-[10px] font-black font-mono border ${isAssigned
                                                ? 'bg-[#16a34a]/10 text-[#16a34a] border-[#16a34a]/20'
                                                : 'bg-[#9A6749]/10 text-[#9A6749] border-[#9A6749]/20'
                                                }`}>
                                                {String(idx + 1).padStart(2, '0')}
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-sm font-black uppercase text-[#291C14] tracking-tight block">
                                                    {ward.name}
                                                </span>
                                                {isAssigned ? (
                                                    <div className="space-y-0.5 bg-[#FAF6F0] p-2 rounded-lg border border-[#8A7968]/10 min-w-[200px]">
                                                        <span className="text-xs font-bold text-[#291C14] uppercase block">
                                                            👤 {supervisor.name}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-[#8A7968] font-mono block tracking-wide">
                                                            ✉️ {supervisor.email}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-[#8A7968] uppercase tracking-wider flex items-center gap-1 italic">
                                                        ⚠️ Unassigned Ward
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            {isAssigned ? (
                                                <span className="bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/20 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-lg tracking-widest">
                                                    ASSIGNED
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => initiateAssignment(ward.name)}
                                                    className="bg-[#9A6749] hover:bg-[#291C14] text-white text-[11px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-md transition-all border-2 border-transparent hover:scale-[1.02] active:scale-[0.98]"
                                                >
                                                    Assign Supervisor
                                                </button>
                                            )}
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
                        <div className="bg-white p-6 rounded-2xl border-2 border-[#9A6749] h-fit transition-all shadow-lg animate-fadeIn">
                            <div className="mb-6 border-b-2 border-[#FAF6F0] pb-4 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-black tracking-tight text-[#291C14] uppercase">
                                        Assign Ward Supervisor
                                    </h3>
                                    <p className="text-[10px] font-bold text-[#8A7968] uppercase mt-0.5">
                                        Target Ward: <span className="text-[#9A6749] underline decoration-2 decoration-[#9A6749] font-black tracking-wide">{selectedTargetWard}</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssigningMode(false);
                                        setUseExistingSupervisor(false);
                                        setSelectedExistingEmail('');
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

                            {getUniqueSupervisorsList().length > 0 && (
                                <div className="mb-5 bg-[#FAF6F0] p-3 rounded-xl border-2 border-[#8A7968]/10 space-y-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={useExistingSupervisor}
                                            onChange={(e) => {
                                                setUseExistingSupervisor(e.target.checked);
                                                setSelectedExistingEmail('');
                                            }}
                                            className="w-4 h-4 accent-[#9A6749] cursor-pointer rounded"
                                        />
                                        <span className="text-xs font-black uppercase text-[#291C14] tracking-tight">
                                            Link Existing Supervisor
                                        </span>
                                    </label>

                                    {useExistingSupervisor && (
                                        <div className="mt-1">
                                            <select
                                                value={selectedExistingEmail}
                                                onChange={(e) => setSelectedExistingEmail(e.target.value)}
                                                className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-white px-3 py-2.5 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none cursor-pointer tracking-wide uppercase"
                                            >
                                                <option value="">-- SELECT FROM LIST --</option>
                                                {getUniqueSupervisorsList().map((sup, sIdx) => (
                                                    <option key={sIdx} value={sup.email}>
                                                        {sup.name.toUpperCase()} [{sup.email.toLowerCase()}]
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            <form onSubmit={handleCreateWardSupervisor} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8A7968]">Supervisor Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={useExistingSupervisor}
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        placeholder="Enter complete official name"
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-[#FAF6F0] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none transition-colors tracking-wide uppercase"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8A7968]">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        disabled={useExistingSupervisor}
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="supervisor@campaign.ng"
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-[#FAF6F0] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none transition-colors tracking-wide lowercase"
                                    />
                                </div>

                                {!useExistingSupervisor && (
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-[#8A7968]">Temporary Password</label>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="block w-full rounded-xl border-2 border-[#8A7968]/20 bg-[#FAF6F0] px-4 py-3 text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none transition-colors"
                                        />
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full bg-[#9A6749] hover:bg-[#291C14] text-white text-xs font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-md border-2 border-transparent hover:scale-[1.01] active:scale-[0.99] pt-4"
                                >
                                    {useExistingSupervisor ? 'Link Existing Supervisor' : `Register Ward Supervisor`}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-[#FAF6F0]/40 p-8 rounded-2xl border-2 border-dashed border-[#8A7968]/20 text-center py-16 flex flex-col items-center justify-center space-y-3 h-fit">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-2 border-[#8A7968]/10 text-xl shadow-sm">
                                📋
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-xs font-black text-[#291C14] uppercase tracking-widest">
                                    Awaiting Ward Selection
                                </h4>
                                <p className="text-[11px] text-[#8A7968] font-medium max-w-xs mx-auto leading-relaxed">
                                    Select an unassigned ward parameter from the tracking list layout index to activate the supervisor setup form interface.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}