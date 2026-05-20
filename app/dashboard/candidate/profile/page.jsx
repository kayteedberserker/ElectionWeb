'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

// Define the available political offices/seats and what geographic fields they require
const CONTESTING_SEATS = [
    { id: 'governor', name: 'Governor', fields: ['state'] },
    { id: 'senate', name: 'Senate (Red Chamber)', fields: ['state', 'senatorialDistrict'] },
    { id: 'house_of_reps', name: 'House of Representatives (Green Chamber)', fields: ['state', 'federalConstituency'] },
    { id: 'chairman', name: 'Local Government Chairman', fields: ['state', 'lga'] },
    { id: 'house_of_assembly', name: 'State House of Assembly', fields: ['state', 'stateConstituency'] }
];

export default function CandidateProfilePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState({ type: '', text: '' });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

    // Master API repository datasets
    const [statesList, setStatesList] = useState([]);
    const [lgasList, setLgasList] = useState([]);
    const [wardsList, setWardsList] = useState([]);

    // Real-time API geopolitical boundary datasets
    const [stateSenatorialDistricts, setStateSenatorialDistricts] = useState([]);
    const [stateFederalConstituencies, setStateFederalConstituencies] = useState([]);
    const [stateConstituenciesList, setStateConstituenciesList] = useState([]);

    // Total metric counters loaded straight from the geographic backend route response
    const [metricCounts, setMetricCounts] = useState({
        totalLgas: 0,
        totalWards: 0,
        totalSenatorialDistricts: 0,
        totalFederalConstituencies: 0,
        totalStateConstituencies: 0
    });

    // Profile metadata tracking state structure
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        contestingSeat: '', // Core driver for the dynamic layout logic
        assignedState: '',
        assignedLga: '',
        assignedWard: '',
        senatorialDistrict: '',
        federalConstituency: '',
        stateConstituency: ''
    });

    // Track initial structural configuration states to detect critical boundary re-allocations
    const [initialCriticalData, setInitialCriticalData] = useState({
        contestingSeat: '',
        assignedState: ''
    });

    // Password Update state management structure
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = typeof window !== 'undefined'
        ? createBrowserClient(supabaseUrl, supabaseKey)
        : null;

    // Fetch master states dataset from your locations api endpoint route on mount
    useEffect(() => {
        async function fetchMasterStates() {
            try {
                const res = await fetch('/api/locations');
                if (res.ok) {
                    const data = await res.json();
                    setStatesList(data.states || []);
                }
            } catch (err) {
                console.error("Error pulling geographic master states list:", err);
            }
        }
        fetchMasterStates();
    }, []);

    // Load active profile metrics from Supabase user auth metadata fields and public profiles table
    useEffect(() => {
        async function loadCandidateProfile() {
            if (!supabase) return;

            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();

                if (userError || !user) {
                    setMessage({ type: 'error', text: 'Failed to synchronize active authenticated user context.' });
                    return;
                }

                // Fetch database public row data to make sure changes are matching
                const { data: publicProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                const metadata = user.user_metadata || {};

                // Map database profile values, normalizing the incoming database role if applicable
                const profileData = {
                    fullName: publicProfile?.full_name || metadata.full_name || '',
                    email: user.email || '',
                    phone: publicProfile?.phone || metadata.phone || '',
                    contestingSeat: publicProfile?.contesting_seat || metadata.contesting_seat || '',
                    assignedState: publicProfile?.assigned_state || metadata.assigned_state || '',
                    assignedLga: publicProfile?.assigned_lga || metadata.assigned_lga || '',
                    assignedWard: publicProfile?.assigned_ward || metadata.assigned_ward || '',
                    senatorialDistrict: publicProfile?.senatorial_district || metadata.senatorial_district || '',
                    federalConstituency: publicProfile?.federal_constituency || metadata.federal_constituency || '',
                    stateConstituency: publicProfile?.state_constituency || metadata.state_constituency || ''
                };

                setFormData(profileData);

                // Commit historical baseline references to check structural modifications on save
                setInitialCriticalData({
                    contestingSeat: profileData.contestingSeat,
                    assignedState: profileData.assignedState
                });

                // Sequentially re-hydrate cascade dependencies using your custom location API endpoint structure
                if (profileData.assignedState) {
                    await fetchLgasAndBoundariesForState(profileData.assignedState);
                }
                if (profileData.assignedState && profileData.assignedLga) {
                    await fetchWardsForLga(profileData.assignedState, profileData.assignedLga);
                }

            } catch (err) {
                console.error("Profile load error:", err);
                setMessage({ type: 'error', text: 'An unexpected connection error occurred while retrieving profile data.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadCandidateProfile();
    }, [supabase]);

    // Locations endpoint helper connections - enhanced to parse real-time zoning structures and extract operational metric totals
    const fetchLgasAndBoundariesForState = async (stateName) => {
        try {
            const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}`);
            if (res.ok) {
                const data = await res.json();

                const lgas = data.lgas || [];
                const senatorial = data.senatorial_districts || [];
                const federal = data.fed_constituencies || [];
                const assembly = data.state_constituencies || [];

                setLgasList(lgas);
                setStateSenatorialDistricts(senatorial);
                setStateFederalConstituencies(federal);
                setStateConstituenciesList(assembly);

                // Commit absolute metric counts directly from the endpoint payload properties arrays
                setMetricCounts(prev => ({
                    ...prev,
                    totalLgas: lgas.length,
                    totalSenatorialDistricts: senatorial.length,
                    totalFederalConstituencies: federal.length,
                    totalStateConstituencies: assembly.length
                }));
            }
        } catch (err) {
            console.error("Error resolving state LGAs and boundary mappings:", err);
        }
    };

    const fetchWardsForLga = async (stateName, lgaName) => {
        try {
            const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}&lga=${encodeURIComponent(lgaName)}`);
            if (res.ok) {
                const data = await res.json();
                const wards = data.wards || [];

                setWardsList(wards);

                // Track precise available localized target ward counts
                setMetricCounts(prev => ({
                    ...prev,
                    totalWards: wards.length
                }));
            }
        } catch (err) {
            console.error("Error resolving LGA Wards:", err);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        setFormData(prev => {
            const updated = { ...prev, [name]: value };

            // Reset downstream data variables systematically if parent seats change
            if (name === 'contestingSeat') {
                updated.assignedState = '';
                updated.assignedLga = '';
                updated.assignedWard = '';
                updated.senatorialDistrict = '';
                updated.federalConstituency = '';
                updated.stateConstituency = '';
                setLgasList([]);
                setWardsList([]);
                setStateSenatorialDistricts([]);
                setStateFederalConstituencies([]);
                setStateConstituenciesList([]);
                setMetricCounts({
                    totalLgas: 0,
                    totalWards: 0,
                    totalSenatorialDistricts: 0,
                    totalFederalConstituencies: 0,
                    totalStateConstituencies: 0
                });
            }

            // Standard geographic selection cascade updates
            if (name === 'assignedState') {
                updated.assignedLga = '';
                updated.assignedWard = '';
                updated.senatorialDistrict = '';
                updated.federalConstituency = '';
                updated.stateConstituency = '';
                setLgasList([]);
                setWardsList([]);
                setStateSenatorialDistricts([]);
                setStateFederalConstituencies([]);
                setStateConstituenciesList([]);
                setMetricCounts({
                    totalLgas: 0,
                    totalWards: 0,
                    totalSenatorialDistricts: 0,
                    totalFederalConstituencies: 0,
                    totalStateConstituencies: 0
                });
                if (value) fetchLgasAndBoundariesForState(value);
            } else if (name === 'assignedLga') {
                updated.assignedWard = '';
                setWardsList([]);
                setMetricCounts(prev => ({ ...prev, totalWards: 0 }));
                if (value) fetchWardsForLga(updated.assignedState, value);
            }

            return updated;
        });
    };

    const handlePasswordInputChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({ ...prev, [name]: value }));
    };

    // Helper utility to flag if a field is required based on selected target seat
    const isFieldRequired = (fieldName) => {
        const activeSeat = CONTESTING_SEATS.find(s => s.id === formData.contestingSeat);
        return activeSeat ? activeSeat.fields.includes(fieldName) : false;
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        if (!supabase) return;

        setMessage({ type: '', text: '' });

        // Evaluate structural parameter alterations compared against pristine loaded states
        const criticalSeatChanged = initialCriticalData.contestingSeat && formData.contestingSeat !== initialCriticalData.contestingSeat;
        const criticalStateChanged = initialCriticalData.assignedState && formData.assignedState !== initialCriticalData.assignedState;
        const isScopePurgeRequired = criticalSeatChanged || criticalStateChanged;

        if (isScopePurgeRequired) {
            const userConfirmedPurge = window.confirm(
                "CRITICAL WARNING:\n\nChanging your Contesting Office Seat or Target State Jurisdiction will completely REMOVE and PURGE all downline agents (Ward Supervisors, LGA Supervisors, and Polling Unit Agents) currently mapped under your candidate profile from the system.\n\nThis action prevents orphan/ghost agent data profiles from corrupting analytics boundaries. This is irreversible.\n\nAre you absolutely sure you want to proceed?"
            );
            if (!userConfirmedPurge) {
                return; // Terminate execution line seamlessly
            }
        }

        startTransition(async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setMessage({ type: 'error', text: 'Authentication reference expired. Please log in again.' });
                    return;
                }

                // If jurisdiction modifications were authorized, execute the purge action safely first
                if (isScopePurgeRequired) {
                    const { error: purgeError } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('candidate_id', user.id) // Matches downline profiles targeting this candidate's account primary key reference
                        .in('role', ['WARD_SUPERVISOR', 'LGA_SUPERVISOR', 'POLLING_UNIT_AGENT']);

                    if (purgeError) {
                        setMessage({
                            type: 'error',
                            text: `Purge Interrupted: ${purgeError.message || 'Failed to safely remove previous downline agent records. Update aborted.'}`
                        });
                        return;
                    }
                }

                const updates = {
                    full_name: formData.fullName,
                    phone: formData.phone,
                    contesting_seat: formData.contestingSeat,
                    assigned_state: isFieldRequired('state') ? formData.assignedState : null,
                    assigned_lga: isFieldRequired('lga') ? formData.assignedLga : null,
                    assigned_ward: isFieldRequired('ward') ? formData.assignedWard : null,
                    senatorial_district: isFieldRequired('senatorialDistrict') ? formData.senatorialDistrict : null,
                    federal_constituency: isFieldRequired('federalConstituency') ? formData.federalConstituency : null,
                    state_constituency: isFieldRequired('stateConstituency') ? formData.stateConstituency : null,
                };

                // 1. Dual-Write Transaction Task A: Update internal Auth Meta Data
                const { error: authError } = await supabase.auth.updateUser({
                    data: {
                        ...updates,
                        role: 'candidate'
                    }
                });

                if (authError) {
                    setMessage({ type: 'error', text: authError.message || 'Failed to update user security context.' });
                    return;
                }

                // 2. Dual-Write Transaction Task B: Explicitly write out metrics row directly to the public profiles table
                const { error: profileTableError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        full_name: updates.full_name,
                        phone: updates.phone,
                        role: 'CANDIDATE', // Enforced uppercase matching database validation models
                        contesting_seat: updates.contesting_seat,
                        assigned_state: updates.assigned_state,
                        senatorial_district: updates.senatorial_district,
                        federal_constituency: updates.federal_constituency,
                        state_constituency: updates.state_constituency,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });

                if (profileTableError) {
                    setMessage({ type: 'error', text: profileTableError.message || 'Auth metadata saved, but failed to synchronize into the database profile table.' });
                    return;
                }

                // Synchronize state baselines to prevent subsequent alerts until changes are made again
                setInitialCriticalData({
                    contestingSeat: updates.contesting_seat,
                    assignedState: updates.assigned_state || ''
                });

                setMessage({ type: 'success', text: 'Constituency scope and database profile table updated successfully!' });
            } catch (err) {
                console.error("Profile save error:", err);
                setMessage({ type: 'error', text: 'Internal update failure encountered processing configuration records.' });
            }
        });
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (!supabase) return;

        setPasswordMessage({ type: '', text: '' });

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'New Passwords fields do not match.' });
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
            return;
        }

        startTransition(async () => {
            try {
                const { error } = await supabase.auth.updateUser({
                    password: passwordData.newPassword
                });

                if (error) {
                    setPasswordMessage({ type: 'error', text: error.message || 'Failed to re-key security profile credentials.' });
                    return;
                }

                setPasswordMessage({ type: 'success', text: 'Security credentials re-keyed and updated successfully.' });
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } catch (err) {
                console.error("Password update error:", err);
                setPasswordMessage({ type: 'error', text: 'Internal error processing cryptographic authentication updates.' });
            }
        });
    };

    if (isLoading) {
        return <LoadingOverlay message="Synchronizing dynamic constituency indices..." />;
    }

    return (
        <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-12">
            {isPending && <LoadingOverlay message="Committing security modification rules..." />}

            {/* Header Identity Bracket */}
            <div className="border-b-2 border-[#8A7968]/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[#291C14] uppercase tracking-wide">Candidate Configuration Controls</h1>
                    <p className="text-xs font-medium text-[#8A7968] mt-1">
                        Establish office target scopes, geographic jurisdictions, and functional candidate access boundaries.
                    </p>
                </div>

                {/* Dynamic Infrastructure Metrics Tracker HUD element */}
                {formData.assignedState && (
                    <div className="bg-[#FAF6F0] border border-[#8A7968]/20 rounded-xl px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black uppercase text-[#8A7968]">
                        <div>LGAs: <span className="text-[#291C14] font-mono">{metricCounts.totalLgas}</span></div>
                        {metricCounts.totalSenatorialDistricts > 0 && <div>Districts: <span className="text-[#291C14] font-mono">{metricCounts.totalSenatorialDistricts}</span></div>}
                        {metricCounts.totalFederalConstituencies > 0 && <div>Fed Reps: <span className="text-[#291C14] font-mono">{metricCounts.totalFederalConstituencies}</span></div>}
                        {metricCounts.totalStateConstituencies > 0 && <div>State Assembly: <span className="text-[#291C14] font-mono">{metricCounts.totalStateConstituencies}</span></div>}
                    </div>
                )}
            </div>

            {/* Form Interface Block */}
            <div className="space-y-8">
                {/* Response Message Toast for Profile */}
                {message.text && (
                    <div className={`p-4 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${message.type === 'success'
                        ? 'bg-green-50 border-green-500/30 text-green-700'
                        : 'bg-red-50 border-red-500/30 text-red-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleProfileUpdate} className="bg-white border-2 border-[#8A7968]/20 rounded-xl p-6 shadow-sm space-y-8">

                    {/* Section: Personal Data Fields */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-4 border-b border-[#8A7968]/10 pb-1">
                            Personal Core Metadata
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Candidate Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleInputChange}
                                    placeholder="Enter full official name"
                                    required
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#8A7968] tracking-wider uppercase">Account Email (Immutable)</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full px-4 py-3 bg-[#FAF6F0]/50 border-2 border-[#8A7968]/5 rounded-xl text-xs font-bold text-[#8A7968] tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Contact Phone Line</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder="Enter active mobile number"
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] tracking-wide focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Target Contest Office Parameters */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-4 border-b border-[#8A7968]/10 pb-1">
                            Target Electoral Office Space
                        </h3>
                        <div className="max-w-md flex flex-col space-y-2">
                            <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Office Contesting Seat</label>
                            <select
                                name="contestingSeat"
                                value={formData.contestingSeat}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer"
                            >
                                <option value="">-- SELECT CONTESTING OFFICE --</option>
                                {CONTESTING_SEATS.map(seat => (
                                    <option key={seat.id} value={seat.id}>{seat?.name?.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Section: Dynamic Geographic Boundary Inputs */}
                    {formData.contestingSeat && (
                        <div>
                            <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-2 border-b border-[#8A7968]/10 pb-1">
                                Jurisdiction Configuration Parameters
                            </h3>
                            <p className="text-[10px] text-[#8A7968] font-medium mb-4 italic">
                                Provide structural territory fields corresponding specifically to your chosen office jurisdiction.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                {/* Base Rule: Every single option requires a parent state container */}
                                {isFieldRequired('state') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Target State Boundary</label>
                                        <select
                                            name="assignedState"
                                            value={formData.assignedState}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer"
                                        >
                                            <option value="">-- SELECT STATE --</option>
                                            {statesList.map(state => (
                                                <option key={state?.code || state?.name} value={state?.name}>
                                                    {state?.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Senate Path: Dynamic selection dropdown matching API profiles */}
                                {isFieldRequired('senatorialDistrict') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">
                                            Senatorial District {metricCounts.totalSenatorialDistricts > 0 && `(${metricCounts.totalSenatorialDistricts} Total)`}
                                        </label>
                                        <select
                                            name="senatorialDistrict"
                                            value={formData.senatorialDistrict}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateSenatorialDistricts.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">-- SELECT SENATORIAL ZONE --</option>
                                            {stateSenatorialDistricts.map(district => (
                                                <option key={district?.name} value={district?.name}>
                                                    {district?.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* House of Reps Path: Dynamic constituency select block */}
                                {isFieldRequired('federalConstituency') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">
                                            Federal Constituency {metricCounts.totalFederalConstituencies > 0 && `(${metricCounts.totalFederalConstituencies} Total)`}
                                        </label>
                                        <select
                                            name="federalConstituency"
                                            value={formData.federalConstituency}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateFederalConstituencies.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">-- SELECT CONSTITUENCY --</option>
                                            {stateFederalConstituencies.map(constituency => (
                                                <option key={constituency?.name} value={constituency?.name}>
                                                    {constituency?.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* State House of Assembly Path: Transformed from text input to dynamic select dropdown */}
                                {isFieldRequired('stateConstituency') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">
                                            State Constituency Location {metricCounts.totalStateConstituencies > 0 && `(${metricCounts.totalStateConstituencies} Total)`}
                                        </label>
                                        <select
                                            name="stateConstituency"
                                            value={formData.stateConstituency}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateConstituenciesList.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">-- SELECT STATE CONSTITUENCY --</option>
                                            {stateConstituenciesList.map(constituency => (
                                                <option key={constituency?.id || constituency?.name} value={constituency?.name}>
                                                    {constituency?.name ? constituency.name.toUpperCase() : 'UNNAMED CONSTITUENCY'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* LGA Path: Triggered for Chairmen, Councillors, or nested dependencies */}
                                {isFieldRequired('lga') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">
                                            Local Government Area (LGA) {metricCounts.totalLgas > 0 && `(${metricCounts.totalLgas} Total)`}
                                        </label>
                                        <select
                                            name="assignedLga"
                                            value={formData.assignedLga}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">-- SELECT LGA --</option>
                                            {lgasList.map(lga => (
                                                <option key={lga?.id || lga?.name} value={lga?.name}>
                                                    {lga?.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Ward Path: Rendered strictly for localized Ward Councillor scopes */}
                                {isFieldRequired('ward') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">
                                            Electoral Ward boundary {metricCounts.totalWards > 0 && `(${metricCounts.totalWards} Total)`}
                                        </label>
                                        <select
                                            name="assignedWard"
                                            value={formData.assignedWard}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedLga}
                                            required
                                            className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">-- SELECT WARD --</option>
                                            {wardsList.map(ward => (
                                                <option key={ward?.id || ward?.name} value={ward?.name}>
                                                    {ward?.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}

                    {/* Submissions Control Node */}
                    <div className="border-t-2 border-[#FAF6F0] pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="bg-[#9A6749] text-white border-2 border-[#9A6749] hover:bg-white hover:text-[#9A6749] text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl transition-all disabled:opacity-50 min-w-[180px] text-center shadow-sm"
                        >
                            {isPending ? 'Saving Record...' : 'Apply Scope Changes'}
                        </button>
                    </div>
                </form>

                {/* Section: Security Matrix Configuration */}
                <div className="pt-4 border-t border-[#8A7968]/10">
                    {passwordMessage.text && (
                        <div className={`mb-6 p-4 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${passwordMessage.type === 'success'
                            ? 'bg-green-50 border-green-500/30 text-green-700'
                            : 'bg-red-50 border-red-500/30 text-red-700'
                            }`}>
                            {passwordMessage.text}
                        </div>
                    )}

                    <form onSubmit={handlePasswordUpdate} className="bg-white border-2 border-[#8A7968]/20 rounded-xl p-6 shadow-sm space-y-6">
                        <div>
                            <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-1 border-b border-[#8A7968]/10 pb-1">
                                Security Management Core
                            </h3>
                            <p className="text-[10px] text-[#8A7968] font-medium mb-4 italic">
                                Re-key your cryptographic system access password rules safely below.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">New Secure Password</label>
                                <input
                                    type="password"
                                    name="newPassword"
                                    value={passwordData.newPassword}
                                    onChange={handlePasswordInputChange}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Confirm New Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={passwordData.confirmPassword}
                                    onChange={handlePasswordInputChange}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="bg-[#291C14] text-white border-2 border-[#291C14] hover:bg-white hover:text-[#291C14] text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl transition-all disabled:opacity-50 min-w-[180px] text-center shadow-sm"
                            >
                                {isPending ? 'Updating Access...' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}