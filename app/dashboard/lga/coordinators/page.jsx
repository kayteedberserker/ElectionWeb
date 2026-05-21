'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
    MapPin,
    User,
    Mail,
    Lock,
    AlertTriangle,
    ClipboardList,
    Plus,
    X,
    CheckCircle2,
    Loader2,
    Wand2
} from 'lucide-react';
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
    const [jurisdictionWards, setJurisdictionWards] = useState([]);
    const [activeWardSupervisors, setActiveWardSupervisors] = useState([]);

    // Form inputs variables state
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [selectedTargetWard, setSelectedTargetWard] = useState('');

    // State for Reusable Supervisor Logic Selection
    const [useExistingSupervisor, setUseExistingSupervisor] = useState(false);
    const [selectedExistingEmail, setSelectedExistingEmail] = useState('');
    const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

    const [isAssigningMode, setIsAssigningMode] = useState(false);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = typeof window !== 'undefined' ? createBrowserClient(supabaseUrl, supabaseKey) : null;

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
                setPassword('');
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
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setStatusMessage({ type: 'error', text: 'AUTHENTICATION OUT OF SYNC. PLEASE LOG IN AGAIN.' });
                    return;
                }

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

                const { data: activeProfiles, error: profilesFetchError } = await supabase
                    .from('profiles')
                    .select('id, full_name, email, assigned_wards, status')
                    .eq('lga_supervisor_id', user.id)
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
                setStatusMessage({ type: 'error', text: 'FAILED TO RESOLVE WARD STRUCTURES.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadScopeAndWardSupervisors();
    }, [supabase]);

    // HIGH-ENTROPY DUMMY EMAIL GENERATOR WITH SYSTEM BREAKERS
    const generateDummyEmail = async () => {
        if (!selectedTargetWard) {
            setStatusMessage({ type: 'error', text: 'PLEASE SELECT A TARGET WARD FIRST TO GENERATE A CONTEXTUAL EMAIL.' });
            return;
        }

        setIsGeneratingEmail(true);
        setStatusMessage({ type: null, text: '' });

        try {
            let isUnique = false;
            let generated = '';
            const cleanWard = selectedTargetWard.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            let attempts = 0;
            const MAX_ATTEMPTS = 5;

            while (!isUnique && attempts < MAX_ATTEMPTS) {
                attempts++;
                const randomNum = Math.floor(100 + Math.random() * 900);
                const timeStampToken = Date.now().toString().slice(-4);
                generated = `ward_${cleanWard}_${randomNum}${timeStampToken}@nookpoll.com`;

                const { data } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', generated)
                    .maybeSingle();

                if (!data) {
                    isUnique = true;
                }
            }

            if (!isUnique) {
                throw new Error("HIGH EMAIL NAMESPACE DENSITY DETECTED. PLEASE ALTER PARAMETERS OR MANUALLY TYPE THE EMAIL.");
            }

            setEmail(generated);
        } catch (err) {
            console.error("Error generating dummy email:", err);
            setStatusMessage({ type: 'error', text: err.message.toUpperCase() });
        } finally {
            setIsGeneratingEmail(false);
        }
    };

    const handleCreateWardSupervisor = async (e) => {
        e.preventDefault();
        setStatusMessage({ type: null, text: '' });

        if (useExistingSupervisor && !selectedExistingEmail) {
            setStatusMessage({ type: 'error', text: 'PLEASE SELECT AN EXISTING SUPERVISOR FROM THE CONFIGURATION LIST.' });
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
                    targetUnit: selectedTargetWard
                };

                const res = await fetch('/api/candidate/create-ward-supervisor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to complete ward supervisor allocation.");

                setActiveWardSupervisors(prev => [
                    ...prev,
                    { name: fullName, unit: selectedTargetWard, email: email.toLowerCase().trim(), status: "ACTIVE" }
                ]);

                setStatusMessage({
                    type: 'success',
                    text: data.isExistingUser
                        ? `${fullName.toUpperCase()} HAS BEEN ASSIGNED MANAGEMENT OVER WARD: ${selectedTargetWard.toUpperCase()}.`
                        : `ACCOUNT CREATED SUCCESSFULLY: ${fullName.toUpperCase()} HAS BEEN ASSIGNED TO ${selectedTargetWard.toUpperCase()}.`
                });

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
        return <LoadingOverlay message="Loading ward structures..." />;
    }

    return (
        <div className="min-h-screen bg-background selection:bg-primary/20 p-4 sm:p-6 lg:p-8 text-textMain">
            {isPending && <LoadingOverlay message="Updating ward supervisor assignments..." />}

            <header className="max-w-7xl mx-auto mb-8 bg-card p-6 rounded-2xl border border-textMuted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-textMuted bg-background px-2.5 py-1 rounded-md border border-textMuted/10">
                        Supervisor Workspace
                    </span>
                    <h1 className="text-2xl font-black tracking-tight text-textMain uppercase pt-1">
                        Ward Supervisor Management
                    </h1>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                        Jurisdiction: {' '}
                        <span className="text-textMain font-black tracking-wide bg-background px-2 py-0.5 rounded border border-textMuted/10">
                            {supervisorProfile.state || 'UNKNOWN'} STATE / LGAs: {supervisorProfile.assignedLgas.join(', ').toUpperCase()}
                        </span>
                    </p>
                </div>
                <div className="bg-background border border-textMuted/20 p-4 rounded-xl min-w-[160px] text-center shadow-inner relative overflow-hidden group">
                    <p className="text-[10px] font-black text-textMuted uppercase tracking-wider mb-0.5">
                        Assigned Wards
                    </p>
                    <p className="text-2xl font-black text-textMain tracking-tight">
                        {jurisdictionWards.filter(w => getWardSupervisor(w.name)).length}
                        <span className="text-xs font-bold text-textMuted mx-1">/</span>
                        <span className="text-base text-textMuted">{jurisdictionWards.length || '--'}</span>
                    </p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Left Section: List of Wards */}
                <div className="lg:col-span-3 bg-card p-6 rounded-2xl border border-textMuted/20 flex flex-col h-[75vh]">
                    <div className="mb-6 border-b border-background pb-4">
                        <h3 className="text-base font-black tracking-tight text-textMain uppercase">
                            Ward Jurisdiction Allocation
                        </h3>
                        <p className="text-xs font-medium text-textMuted mt-0.5">
                            Monitor and assign supervisor coverage across your local government jurisdictions.
                        </p>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {jurisdictionWards.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-background/50 border border-dashed border-textMuted/20 rounded-xl">
                                <MapPin className="w-8 h-8 text-textMuted/40 mb-2" />
                                <p className="text-xs font-black uppercase tracking-widest text-textMuted mt-3">
                                    No operational wards found.
                                </p>
                            </div>
                        ) : (
                            jurisdictionWards.map((ward, idx) => {
                                const supervisor = getWardSupervisor(ward.name);
                                const isAssigned = !!supervisor;

                                return (
                                    <div
                                        key={ward.id || idx}
                                        className={`p-4 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${isAssigned
                                            ? 'bg-card border-textMuted/20 hover:border-primary/40 shadow-sm'
                                            : 'border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 px-2 py-1 rounded text-[10px] font-black font-mono border ${isAssigned
                                                ? 'bg-accent/10 text-accent border-accent/20'
                                                : 'bg-primary/10 text-primary border-primary/20'
                                                }`}>
                                                {String(idx + 1).padStart(2, '0')}
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-sm font-black uppercase text-textMain tracking-tight block">
                                                    {ward.name}
                                                </span>
                                                {isAssigned ? (
                                                    <div className="space-y-1 bg-background p-2 rounded-lg border border-textMuted/10 min-w-[200px]">
                                                        <span className="inline-flex items-center text-xs font-bold text-textMain uppercase gap-1.5">
                                                            <User className="w-3 h-3 text-primary" /> {supervisor.name}
                                                        </span>
                                                        <span className="inline-flex items-center text-[10px] font-semibold text-textMuted font-mono gap-1.5 block tracking-wide">
                                                            <Mail className="w-3 h-3 text-textMuted" /> {supervisor.email}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1.5 italic">
                                                        <AlertTriangle className="w-3 h-3 text-gold" /> Unassigned Ward
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            {isAssigned ? (
                                                <span className="inline-flex items-center gap-1 bg-accent/10 text-accent border border-accent/20 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-lg tracking-widest">
                                                    <CheckCircle2 className="w-3 h-3" /> Assigned
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => initiateAssignment(ward.name)}
                                                    className="bg-primary hover:bg-primary-dark text-white text-[11px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-md transition-all border border-transparent hover:scale-[1.02] active:scale-[0.98]"
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
                        <div className="bg-card p-6 rounded-2xl border-2 border-primary h-fit transition-all shadow-lg animate-fadeIn">
                            <div className="mb-6 border-b border-background pb-4 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-black tracking-tight text-textMain uppercase">
                                        Assign Ward Supervisor
                                    </h3>
                                    <p className="text-[10px] font-bold text-textMuted uppercase mt-0.5">
                                        Target Ward: <span className="text-primary underline decoration-2 decoration-primary font-black tracking-wide">{selectedTargetWard}</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssigningMode(false);
                                        setUseExistingSupervisor(false);
                                        setSelectedExistingEmail('');
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-black text-textMuted uppercase hover:text-textMain bg-background px-3 py-1.5 rounded-lg border border-textMuted/20 tracking-wider transition-colors"
                                >
                                    <X className="w-3 h-3" /> Cancel
                                </button>
                            </div>

                            {statusMessage.text && (
                                <div className={`p-4 mb-5 rounded-xl border text-[11px] font-bold uppercase tracking-wide leading-relaxed ${statusMessage.type === 'success'
                                    ? 'bg-accent/10 border-accent/30 text-accent'
                                    : 'bg-gold/10 border-gold/30 text-gold'
                                    }`}>
                                    {statusMessage.text}
                                </div>
                            )}

                            {getUniqueSupervisorsList().length > 0 && (
                                <div className="mb-5 bg-background p-3 rounded-xl border border-textMuted/10 space-y-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={useExistingSupervisor}
                                            onChange={(e) => {
                                                setUseExistingSupervisor(e.target.checked);
                                                setSelectedExistingEmail('');
                                            }}
                                            className="w-4 h-4 accent-primary cursor-pointer rounded"
                                        />
                                        <span className="text-xs font-black uppercase text-textMain tracking-tight">
                                            Link Existing Supervisor
                                        </span>
                                    </label>

                                    {useExistingSupervisor && (
                                        <div className="mt-1">
                                            <select
                                                value={selectedExistingEmail}
                                                onChange={(e) => setSelectedExistingEmail(e.target.value)}
                                                className="block w-full rounded-xl border border-textMuted/20 bg-card px-3 py-2.5 text-xs font-bold text-textMain focus:border-primary focus:outline-none cursor-pointer tracking-wide uppercase"
                                            >
                                                <option value="">-- Select Supervisor --</option>
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
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-textMuted">Supervisor Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                        <input
                                            type="text"
                                            required
                                            disabled={useExistingSupervisor || isGeneratingEmail}
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            placeholder="Enter full official name"
                                            className="block w-full rounded-xl border border-textMuted/20 bg-background disabled:opacity-60 disabled:cursor-not-allowed pl-9 pr-4 py-3 text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-colors tracking-wide uppercase"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-textMuted">Email Address</label>
                                    <div className="relative flex items-center">
                                        <Mail className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                        <input
                                            type="email"
                                            required
                                            disabled={useExistingSupervisor || isGeneratingEmail}
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="supervisor@campaign.ng"
                                            className="block w-full rounded-xl border border-textMuted/20 bg-background disabled:opacity-60 disabled:cursor-not-allowed pl-9 pr-12 py-3 text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-colors tracking-wide lowercase"
                                        />
                                        {!useExistingSupervisor && (
                                            <button
                                                type="button"
                                                onClick={generateDummyEmail}
                                                disabled={isGeneratingEmail || !selectedTargetWard}
                                                title="Generate safe dynamic email"
                                                className="absolute right-2 p-1.5 rounded-lg bg-card border border-textMuted/20 hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                                            >
                                                {isGeneratingEmail ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {!useExistingSupervisor && (
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-textMuted">Temporary Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                            <input
                                                type="password"
                                                required
                                                disabled={isGeneratingEmail}
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="block w-full rounded-xl border border-textMuted/20 bg-background pl-9 pr-4 py-3 text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isPending || isGeneratingEmail}
                                    className="w-full bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-md border border-transparent hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                >
                                    {isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : useExistingSupervisor ? (
                                        'Link Existing Supervisor'
                                    ) : (
                                        'Register Ward Supervisor'
                                    )}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-background/40 p-8 rounded-2xl border border-dashed border-textMuted/20 text-center py-16 flex flex-col items-center justify-center space-y-3 h-fit">
                            <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center border border-textMuted/10 shadow-sm">
                                <ClipboardList className="w-5 h-5 text-textMuted" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-xs font-black text-textMain uppercase tracking-widest">
                                    Awaiting Ward Selection
                                </h4>
                                <p className="text-[11px] text-textMuted font-medium max-w-xs mx-auto leading-relaxed">
                                    Select an unassigned ward from the management directory list to open the supervisor assignment panel.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}