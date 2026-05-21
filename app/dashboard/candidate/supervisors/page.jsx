'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';
import {
    ShieldAlert,
    User,
    Mail,
    Lock,
    MapPin,
    Users,
    CheckCircle2,
    AlertTriangle,
    X,
    Link,
    ChevronRight,
    Loader2,
    Wand2
} from 'lucide-react';

export default function ManageSupervisorsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState({ type: null, text: '' });

    // Candidate Profile State Configuration
    const [candidateProfile, setCandidateProfile] = useState({
        state: '',
        lga: '',
        seat: '',
        senatorialDistrict: '',
        federalConstituency: '',
        stateConstituency: '',
        isLocalized: false
    });

    // Dynamic Lists from Database
    const [jurisdictionUnits, setJurisdictionUnits] = useState([]);
    const [activeSupervisors, setActiveSupervisors] = useState([]);

    // Form inputs variables state
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [selectedTargetUnit, setSelectedTargetUnit] = useState('');

    // Reusable Supervisor Logic Selection
    const [useExistingSupervisor, setUseExistingSupervisor] = useState(false);
    const [selectedExistingEmail, setSelectedExistingEmail] = useState('');
    const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

    const [isAssigningMode, setIsAssigningMode] = useState(false);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = typeof window !== 'undefined' ? createBrowserClient(supabaseUrl, supabaseKey) : null;

    const getUniqueSupervisorsList = () => {
        const seen = new Set();
        return activeSupervisors.filter(sup => {
            if (!sup.email || seen.has(sup.email.toLowerCase())) return false;
            seen.add(sup.email.toLowerCase());
            return true;
        });
    };

    useEffect(() => {
        if (useExistingSupervisor && selectedExistingEmail) {
            const matchedSup = activeSupervisors.find(
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
    }, [useExistingSupervisor, selectedExistingEmail, activeSupervisors]);

    useEffect(() => {
        async function loadScopeAndSupervisors() {
            if (!supabase) return;
            setIsLoading(true);
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setStatusMessage({ type: 'error', text: 'Authentication session expired. Please log in again.' });
                    return;
                }

                const { data: publicProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                const metadata = user.user_metadata || {};

                const seat = publicProfile?.contesting_seat || metadata.contesting_seat || '';
                const stateName = publicProfile?.assigned_state || metadata.assigned_state || '';
                let lgaName = publicProfile?.assigned_lga || metadata.assigned_lga || '';
                const senatorialDistrict = publicProfile?.senatorial_district || metadata.senatorial_district || '';
                const federalConstituency = publicProfile?.federal_constituency || metadata.federal_constituency || '';
                const stateConstituency = publicProfile?.state_constituency || metadata.state_constituency || '';

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
                        console.error("Error resolving State Assembly geographic boundaries:", err);
                    }
                }

                const isLocalized = ['chairman', 'house_of_assembly', 'councillor'].includes(seat);

                setCandidateProfile({
                    state: stateName,
                    lga: lgaName,
                    seat: seat,
                    senatorialDistrict: senatorialDistrict,
                    federalConstituency: federalConstituency,
                    stateConstituency: stateConstituency,
                    isLocalized: isLocalized
                });

                let fetchedUnits = [];
                if (isLocalized) {
                    if (stateName && lgaName) {
                        const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}&lga=${encodeURIComponent(lgaName)}`);
                        if (res.ok) {
                            const data = await res.json();
                            fetchedUnits = data.wards || [];
                        }
                    }
                } else {
                    let url = `/api/locations?state=${encodeURIComponent(stateName)}`;
                    if (seat === 'senate' && senatorialDistrict) {
                        url += `&senatorial_district=${encodeURIComponent(senatorialDistrict)}`;
                    } else if (seat === 'house_of_reps' && federalConstituency) {
                        url += `&fed_constituency=${encodeURIComponent(federalConstituency)}`;
                    }

                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        fetchedUnits = data.lgas || [];
                    }
                }
                setJurisdictionUnits(fetchedUnits);

                const supervisorRoleTag = isLocalized ? 'WARD_SUPERVISOR' : 'LGA_SUPERVISOR';
                const { data: activeProfiles, error: profilesFetchError } = await supabase
                    .from('profiles')
                    .select('id, full_name, email, assigned_lgas, assigned_wards, status')
                    .eq('candidate_id', user.id)
                    .eq('role', supervisorRoleTag);

                if (!profilesFetchError && activeProfiles) {
                    const unifiedCacheList = [];
                    activeProfiles.forEach(p => {
                        const coverageArray = isLocalized ? (p.assigned_wards || []) : (p.assigned_lgas || []);
                        if (coverageArray.length === 0) {
                            unifiedCacheList.push({
                                id: p.id,
                                name: p.full_name,
                                email: p.email,
                                unit: null,
                                status: p.status || "ACTIVE"
                            });
                        } else {
                            coverageArray.forEach(unit => {
                                unifiedCacheList.push({
                                    id: p.id,
                                    name: p.full_name,
                                    email: p.email,
                                    unit: unit,
                                    status: p.status || "ACTIVE"
                                });
                            });
                        }
                    });
                    setActiveSupervisors(unifiedCacheList);
                }

            } catch (err) {
                console.error("Error loading profile details:", err);
                setStatusMessage({ type: 'error', text: 'Failed to resolve assigned administrative units.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadScopeAndSupervisors();
    }, [supabase]);

    // SAFE DUMMY EMAIL GENERATION WITH CIRCUIT BREAKER & HIGHER ENTROPY
    const generateDummyEmail = async () => {
        if (!selectedTargetUnit) {
            setStatusMessage({ type: 'error', text: 'Please select a target unit first to generate a contextual email.' });
            return;
        }

        setIsGeneratingEmail(true);
        setStatusMessage({ type: null, text: '' });

        try {
            let isUnique = false;
            let generated = '';
            const cleanUnit = selectedTargetUnit.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const prefix = candidateProfile.isLocalized ? 'ward' : 'lga';

            let attempts = 0;
            const MAX_ATTEMPTS = 5;

            while (!isUnique && attempts < MAX_ATTEMPTS) {
                attempts++;
                // Combine a 3-digit random token with a truncated timestamp token to guarantee spacing uniqueness
                const randomNum = Math.floor(100 + Math.random() * 900);
                const timeStampToken = Date.now().toString().slice(-4);
                generated = `${prefix}_${cleanUnit}_${randomNum}${timeStampToken}@nookpoll.com`;

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
                throw new Error("High email namespace density detected. Please alter details or add custom text manually.");
            }

            setEmail(generated);
        } catch (err) {
            console.error("Error generating dummy email:", err);
            setStatusMessage({ type: 'error', text: err.message || 'Failed to generate dummy email. Try manually.' });
        } finally {
            setIsGeneratingEmail(false);
        }
    };

    const handleCreateSupervisor = async (e) => {
        e.preventDefault();
        setStatusMessage({ type: null, text: '' });

        if (useExistingSupervisor && !selectedExistingEmail) {
            setStatusMessage({ type: 'error', text: 'Please select an existing supervisor from the available registry options.' });
            return;
        }

        startTransition(async () => {
            try {
                const payload = {
                    fullName,
                    email: email.toLowerCase().trim(),
                    password: useExistingSupervisor ? null : password,
                    role: candidateProfile.isLocalized ? 'WARD_SUPERVISOR' : 'LGA_SUPERVISOR',
                    assignedState: candidateProfile.state,
                    targetUnit: selectedTargetUnit
                };

                const res = await fetch('/api/candidate/create-supervisor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to finalize supervisor account alignment properties.");

                setActiveSupervisors(prev => [
                    ...prev,
                    { name: fullName, unit: selectedTargetUnit, email: email.toLowerCase().trim(), status: "ACTIVE" }
                ]);

                setStatusMessage({
                    type: 'success',
                    text: data.isExistingUser
                        ? `${fullName} has successfully been assigned additional management over unit: ${selectedTargetUnit}.`
                        : `Supervisor profile created successfully. ${fullName} has been assigned to ${selectedTargetUnit}.`
                });

                setFullName('');
                setEmail('');
                setPassword('');
                setSelectedTargetUnit('');
                setSelectedExistingEmail('');
                setUseExistingSupervisor(false);
                setIsAssigningMode(false);
            } catch (err) {
                setStatusMessage({ type: 'error', text: err.message });
            }
        });
    };

    const getUnitSupervisor = (unitName) => {
        return activeSupervisors.find(sup => sup.unit?.toUpperCase() === unitName.toUpperCase());
    };

    const initiateAssignment = (unitName) => {
        setSelectedTargetUnit(unitName);
        setIsAssigningMode(true);
        setUseExistingSupervisor(false);
        setSelectedExistingEmail('');
        setStatusMessage({ type: null, text: '' });

        const existingSup = activeSupervisors.find(s => s.unit?.toUpperCase() === unitName.toUpperCase());
        if (existingSup) {
            setFullName(existingSup.name || '');
            setEmail(existingSup.email || '');
        }
    };

    if (isLoading) {
        return <LoadingOverlay message="Loading candidate jurisdiction boundaries..." />;
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 text-textMain">
            {isPending && <LoadingOverlay message="Registering supervisor account details..." />}

            <header className="max-w-7xl mx-auto mb-8 bg-card p-6 rounded-2xl border border-textMuted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-sm">
                <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary bg-background px-3 py-1 rounded-md border border-primary/10">
                        Administrative Management
                    </span>
                    <h1 className="text-2xl font-extrabold tracking-tight text-textMain pt-1">
                        {candidateProfile.isLocalized ? 'Ward Supervisor Management' : 'LGA Supervisor Management'}
                    </h1>
                    <p className="text-sm font-medium text-textMuted flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
                        Active Jurisdiction: {' '}
                        <span className="text-textMain font-bold bg-background px-2.5 py-0.5 rounded border border-textMuted/10">
                            {candidateProfile.state || 'UNKNOWN'}
                            {candidateProfile.lga && ` / ${candidateProfile.lga} LGA`}
                            {candidateProfile.stateConstituency && ` [${candidateProfile.stateConstituency}]`}
                            {candidateProfile.senatorialDistrict && ` (${candidateProfile.senatorialDistrict} District)`}
                            {candidateProfile.federalConstituency && ` (${candidateProfile.federalConstituency})`}
                        </span>
                    </p>
                </div>

                <div className="bg-background border border-textMuted/20 p-4 rounded-xl min-w-[180px] text-center shadow-inner">
                    <p className="text-xs font-bold text-textMuted uppercase tracking-wider mb-1">
                        {candidateProfile.isLocalized ? 'Wards Assigned' : 'LGAs Assigned'}
                    </p>
                    <p className="text-3xl font-black text-primary tracking-tight">
                        {jurisdictionUnits.filter(u => getUnitSupervisor(u.name)).length}
                        <span className="text-lg font-medium text-textMuted mx-1.5">/</span>
                        <span className="text-xl font-bold text-textMuted">{jurisdictionUnits.length || '0'}</span>
                    </p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Left Tracking Matrix Column */}
                <div className="lg:col-span-3 bg-card p-6 rounded-2xl border border-textMuted/20 flex flex-col h-[75vh] shadow-sm">
                    <div className="mb-6 border-b border-background pb-4">
                        <h3 className="text-base font-bold tracking-tight text-textMain">
                            {candidateProfile.isLocalized ? `Wards under ${candidateProfile.lga} LGA` : 'Administrative Coverage Directory'}
                        </h3>
                        <p className="text-xs font-medium text-textMuted mt-0.5">
                            Review assigned and unassigned parameters matching your campaign structure.
                        </p>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {jurisdictionUnits.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-background/50 border border-dashed border-textMuted/30 rounded-xl">
                                <MapPin className="w-8 h-8 text-textMuted opacity-60 mb-3" />
                                <p className="text-sm font-semibold text-textMuted">No geographic boundaries loaded.</p>
                            </div>
                        ) : (
                            jurisdictionUnits.map((unit, idx) => {
                                const supervisor = getUnitSupervisor(unit.name);
                                const isAssigned = !!supervisor;

                                return (
                                    <div
                                        key={unit.id || idx}
                                        className={`p-4 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${isAssigned
                                            ? 'bg-card border-textMuted/20 hover:border-primary/40 shadow-sm'
                                            : 'border-dashed border-gold/40 bg-gold-light/5 hover:bg-gold-light/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3.5">
                                            <div className={`mt-0.5 px-2 py-0.5 rounded text-xs font-bold font-mono border ${isAssigned
                                                ? 'bg-accent-light text-accent border-accent/20'
                                                : 'bg-gold-light/10 text-gold border-gold/20'
                                                }`}>
                                                {String(idx + 1).padStart(2, '0')}
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-sm font-bold text-textMain tracking-tight block">{unit.name}</span>
                                                {isAssigned ? (
                                                    <div className="space-y-1 bg-background p-2.5 rounded-lg border border-textMuted/10 min-w-[220px]">
                                                        <span className="text-xs font-semibold text-textMain flex items-center gap-1.5">
                                                            <User className="w-3.5 h-3.5 text-primary" /> {supervisor.name}
                                                        </span>
                                                        <span className="text-xs font-medium text-textMuted font-mono tracking-wide flex items-center gap-1.5">
                                                            <Mail className="w-3.5 h-3.5 text-textMuted" /> {supervisor.email}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-medium text-gold flex items-center gap-1 italic">
                                                        <AlertTriangle className="w-3.5 h-3.5" /> Unassigned Unit
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            {isAssigned ? (
                                                <span className="bg-accent-light text-accent border border-accent/20 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Assigned
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => initiateAssignment(unit.name)}
                                                    className="bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98]"
                                                >
                                                    Assign Supervisor <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Form Processing Column */}
                <div className="lg:col-span-2">
                    {isAssigningMode ? (
                        <div className="bg-card p-6 rounded-2xl border border-primary/50 h-fit transition-all shadow-md">
                            <div className="mb-6 border-b border-background pb-4 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-bold text-textMain">Assign Supervisor Account</h3>
                                    <p className="text-xs text-textMuted mt-0.5">
                                        Target Unit: <span className="text-primary font-bold">{selectedTargetUnit}</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssigningMode(false);
                                        setUseExistingSupervisor(false);
                                        setSelectedExistingEmail('');
                                    }}
                                    className="text-textMuted hover:text-textMain bg-background p-1.5 rounded-lg border border-textMuted/20 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {statusMessage.text && (
                                <div className={`p-4 mb-5 rounded-xl border text-xs font-medium flex gap-2 items-start ${statusMessage.type === 'success'
                                    ? 'bg-accent-light border-accent/30 text-accent'
                                    : 'bg-red-50 border-red-500/30 text-red-700'
                                    }`}>
                                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>{statusMessage.text}</div>
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
                                        <span className="text-xs font-bold text-textMain">Link Existing Registered Supervisor</span>
                                    </label>

                                    {useExistingSupervisor && (
                                        <div className="mt-1.5">
                                            <select
                                                value={selectedExistingEmail}
                                                onChange={(e) => setSelectedExistingEmail(e.target.value)}
                                                className="block w-full rounded-xl border border-textMuted/30 bg-card px-3 py-2.5 text-xs font-semibold text-textMain focus:border-primary focus:outline-none cursor-pointer"
                                            >
                                                <option value="">-- Select Supervisor Profile --</option>
                                                {getUniqueSupervisorsList().map((sup, sIdx) => (
                                                    <option key={sIdx} value={sup.email}>
                                                        {sup.name} ({sup.email})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            <form onSubmit={handleCreateSupervisor} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-textMuted">Supervisor Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                        <input
                                            type="text"
                                            required
                                            disabled={useExistingSupervisor || isGeneratingEmail}
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            placeholder="Enter legal first and last name"
                                            className="block w-full rounded-xl border border-textMuted/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed pl-9 pr-4 py-3 text-xs font-semibold text-textMain focus:border-primary focus:outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-textMuted">Email Address</label>
                                    <div className="relative flex items-center">
                                        <Mail className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                        <input
                                            type="email"
                                            required
                                            disabled={useExistingSupervisor || isGeneratingEmail}
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="supervisor@domain.com"
                                            className="block w-full rounded-xl border border-textMuted/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed pl-9 pr-14 py-3 text-xs font-semibold text-textMain focus:border-primary focus:outline-none transition-colors"
                                        />
                                        {!useExistingSupervisor && (
                                            <button
                                                type="button"
                                                onClick={generateDummyEmail}
                                                disabled={isGeneratingEmail || !selectedTargetUnit}
                                                title="Generate unique dummy email"
                                                className="absolute right-2 p-1.5 rounded-lg bg-card border border-textMuted/20 hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                                            >
                                                {isGeneratingEmail ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {!useExistingSupervisor && (
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold text-textMuted">Temporary Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3.5 w-4 h-4 text-textMuted" />
                                            <input
                                                type="password"
                                                required
                                                disabled={isGeneratingEmail}
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="block w-full rounded-xl border border-textMuted/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed pl-9 pr-4 py-3 text-xs font-semibold text-textMain focus:border-primary focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isPending || isGeneratingEmail}
                                    className="w-full bg-primary hover:bg-primary-dark text-white text-xs font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                >
                                    {isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : useExistingSupervisor ? (
                                        <span className="flex items-center gap-1.5"><Link className="w-4 h-4" /> Link Profile Unit</span>
                                    ) : (
                                        <span>Register and Assign Supervisor</span>
                                    )}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-background/40 p-8 rounded-2xl border border-dashed border-textMuted/30 text-center py-16 flex flex-col items-center justify-center space-y-3 h-fit shadow-inner">
                            <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center border border-textMuted/10 text-primary shadow-sm">
                                <Users className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-xs font-bold text-textMain uppercase tracking-wider">Awaiting Selection Target</h4>
                                <p className="text-xs text-textMuted max-w-xs mx-auto leading-relaxed">
                                    Select an unassigned administrative unit from the directory on the left to activate account assignment.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}