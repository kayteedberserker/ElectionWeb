'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
    User,
    Mail,
    Phone,
    Briefcase,
    MapPin,
    Lock,
    Save,
    AlertTriangle,
    CheckCircle2,
    AlertCircle,
    Layers
} from 'lucide-react';
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
                    setMessage({ type: 'error', text: 'Failed to load user account details.' });
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
                setMessage({ type: 'error', text: 'An unexpected connection error occurred while retrieving profile details.' });
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
                "WARNING:\n\nChanging your Contesting Office or Target State will completely remove all downline agents (Ward Supervisors, LGA Supervisors, and Polling Unit Agents) currently linked to your profile.\n\nThis action prevents disconnected agent profiles from causing data errors and cannot be undone.\n\nAre you sure you want to proceed?"
            );
            if (!userConfirmedPurge) {
                return; // Terminate execution line seamlessly
            }
        }

        startTransition(async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setMessage({ type: 'error', text: 'Your session has expired. Please log in again.' });
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
                            text: `Could not clear previous sub-agents: ${purgeError.message || 'Update aborted.'}`
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

                // 1. Update internal Auth Meta Data
                const { error: authError } = await supabase.auth.updateUser({
                    data: {
                        ...updates,
                        role: 'candidate'
                    }
                });

                if (authError) {
                    setMessage({ type: 'error', text: authError.message || 'Failed to update account credentials.' });
                    return;
                }

                // 2. Explicitly write out metrics row directly to the public profiles table
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
                    setMessage({ type: 'error', text: profileTableError.message || 'Account details saved, but failed to sync with the database profile table.' });
                    return;
                }

                // Synchronize state baselines to prevent subsequent alerts until changes are made again
                setInitialCriticalData({
                    contestingSeat: updates.contesting_seat,
                    assignedState: updates.assigned_state || ''
                });

                setMessage({ type: 'success', text: 'Your profile and jurisdiction details have been updated successfully!' });
            } catch (err) {
                console.error("Profile save error:", err);
                setMessage({ type: 'error', text: 'An unexpected error occurred while saving your profile data.' });
            }
        });
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (!supabase) return;

        setPasswordMessage({ type: '', text: '' });

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'The password fields do not match.' });
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
                    setPasswordMessage({ type: 'error', text: error.message || 'Failed to update your password.' });
                    return;
                }

                setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } catch (err) {
                console.error("Password update error:", err);
                setPasswordMessage({ type: 'error', text: 'An error occurred while updating your account password.' });
            }
        });
    };

    if (isLoading) {
        return <LoadingOverlay message="Loading profile data..." />;
    }

    return (
        <main className="p-4 md:px-8 max-w-5xl mx-auto space-y-12 text-textMain">
            {isPending && <LoadingOverlay message="Saving updates..." />}

            {/* Header Identity Section */}
            <div className="border-b-2 border-textMuted/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-textMain uppercase tracking-wide flex items-center gap-2">
                        <User className="w-6 h-6 text-primary" />
                        Candidate Profile Settings
                    </h1>
                    <p className="text-xs font-medium text-textMuted mt-1">
                        Manage your contesting office, electoral jurisdictions, and account details.
                    </p>
                </div>

                {/* Dynamic District Metrics Tracker */}
                {formData.assignedState && (
                    <div className="bg-background border border-textMuted/20 rounded-xl px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black uppercase text-textMuted items-center">
                        <Layers className="w-3.5 h-3.5 mr-1 text-primary" />
                        <div>LGAs: <span className="text-textMain font-mono">{metricCounts.totalLgas}</span></div>
                        {metricCounts.totalSenatorialDistricts > 0 && <div>Districts: <span className="text-textMain font-mono">{metricCounts.totalSenatorialDistricts}</span></div>}
                        {metricCounts.totalFederalConstituencies > 0 && <div>Fed Reps: <span className="text-textMain font-mono">{metricCounts.totalFederalConstituencies}</span></div>}
                        {metricCounts.totalStateConstituencies > 0 && <div>State Assembly: <span className="text-textMain font-mono">{metricCounts.totalStateConstituencies}</span></div>}
                    </div>
                )}
            </div>

            {/* Form Interface Block */}
            <div className="space-y-8">
                {/* Status Messages for Profile */}
                {message.text && (
                    <div className={`p-4 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${message.type === 'success'
                        ? 'bg-accent-light border-accent/30 text-accent'
                        : 'bg-red-50 border-red-500/30 text-red-700'
                        }`}>
                        {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleProfileUpdate} className="bg-card border-2 border-textMuted/20 rounded-xl p-6 shadow-sm space-y-8">

                    {/* Section: Personal Data Fields */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-textMuted uppercase mb-4 border-b border-textMuted/10 pb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            Personal Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">Full Name</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-textMuted">
                                        <User className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleInputChange}
                                        placeholder="Enter full official name"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-textMuted tracking-wider uppercase">Email Address (Cannot be changed)</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-textMuted/50">
                                        <Mail className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        disabled
                                        className="w-full pl-10 pr-4 py-3 bg-background/50 border-2 border-textMuted/5 rounded-xl text-xs font-bold text-textMuted tracking-wide cursor-not-allowed opacity-70"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">Phone Number</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-textMuted">
                                        <Phone className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        placeholder="Enter active phone number"
                                        className="w-full pl-10 pr-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain tracking-wide focus:border-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Target Contest Office Parameters */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-textMuted uppercase mb-4 border-b border-textMuted/10 pb-1 flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" />
                            Electoral Office Details
                        </h3>
                        <div className="max-w-md flex flex-col space-y-2">
                            <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">Office You Are Contesting For</label>
                            <select
                                name="contestingSeat"
                                value={formData.contestingSeat}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer"
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
                            <h3 className="text-xs font-bold tracking-widest text-textMuted uppercase mb-2 border-b border-textMuted/10 pb-1 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                Location & Jurisdiction Boundaries
                            </h3>
                            <p className="text-[10px] text-textMuted font-medium mb-4 italic">
                                Select the location boundaries that correspond to your chosen contesting office.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                {/* Base Rule: Every single option requires a parent state container */}
                                {isFieldRequired('state') && (
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">State Jurisdiction</label>
                                        <select
                                            name="assignedState"
                                            value={formData.assignedState}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer"
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
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">
                                            Senatorial District {metricCounts.totalSenatorialDistricts > 0 && `(${metricCounts.totalSenatorialDistricts} Total)`}
                                        </label>
                                        <select
                                            name="senatorialDistrict"
                                            value={formData.senatorialDistrict}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateSenatorialDistricts.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
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
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">
                                            Federal Constituency {metricCounts.totalFederalConstituencies > 0 && `(${metricCounts.totalFederalConstituencies} Total)`}
                                        </label>
                                        <select
                                            name="federalConstituency"
                                            value={formData.federalConstituency}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateFederalConstituencies.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
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
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">
                                            State Constituency {metricCounts.totalStateConstituencies > 0 && `(${metricCounts.totalStateConstituencies} Total)`}
                                        </label>
                                        <select
                                            name="stateConstituency"
                                            value={formData.stateConstituency}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState || stateConstituenciesList.length === 0}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
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
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">
                                            Local Government Area (LGA) {metricCounts.totalLgas > 0 && `(${metricCounts.totalLgas} Total)`}
                                        </label>
                                        <select
                                            name="assignedLga"
                                            value={formData.assignedLga}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedState}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
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
                                        <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">
                                            Electoral Ward {metricCounts.totalWards > 0 && `(${metricCounts.totalWards} Total)`}
                                        </label>
                                        <select
                                            name="assignedWard"
                                            value={formData.assignedWard}
                                            onChange={handleInputChange}
                                            disabled={!formData.assignedLga}
                                            required
                                            className="w-full px-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
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
                    <div className="border-t-2 border-background pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="bg-primary text-white border-2 border-primary hover:bg-card hover:text-primary text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl transition-all disabled:opacity-50 min-w-[180px] text-center shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Save className="w-4 h-4" />
                            {isPending ? 'Saving Changes...' : 'Save Profile Changes'}
                        </button>
                    </div>
                </form>

                {/* Section: Change Password */}
                <div className="pt-4 border-t border-textMuted/10">
                    {passwordMessage.text && (
                        <div className={`mb-6 p-4 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${passwordMessage.type === 'success'
                            ? 'bg-accent-light border-accent/30 text-accent'
                            : 'bg-red-50 border-red-500/30 text-red-700'
                            }`}>
                            {passwordMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {passwordMessage.text}
                        </div>
                    )}

                    <form onSubmit={handlePasswordUpdate} className="bg-card border-2 border-textMuted/20 rounded-xl p-6 shadow-sm space-y-6">
                        <div>
                            <h3 className="text-xs font-bold tracking-widest text-textMuted uppercase mb-1 border-b border-textMuted/10 pb-1 flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5" />
                                Account Security
                            </h3>
                            <p className="text-[10px] text-textMuted font-medium mb-4 italic">
                                Update your account password below to keep your credentials secure.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">New Password</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-textMuted">
                                        <Lock className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordInputChange}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-textMain tracking-wider uppercase">Confirm New Password</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-textMuted">
                                        <Lock className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordInputChange}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-background border-2 border-textMuted/10 rounded-xl text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="bg-primary-dark text-white border-2 border-primary-dark hover:bg-card hover:text-primary-dark text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl transition-all disabled:opacity-50 min-w-[180px] text-center shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <Lock className="w-4 h-4" />
                                {isPending ? 'Updating Password...' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}