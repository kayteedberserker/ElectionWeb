'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, Mail, Phone, Shield, MapPin, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function LgasSupervisorProfilePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState({ type: '', text: '' });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

    // List of wards compiled from all assigned LGAs
    const [wardsList, setWardsList] = useState([]);

    // Counter metrics aggregated across all assigned jurisdictions
    const [metricCounts, setMetricCounts] = useState({
        totalWards: 0,
        totalPollingUnits: 0
    });

    // Profile form state layout for an LGA Supervisor
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        role: 'LGA_SUPERVISOR',
        assignedState: '',
        assignedLgas: [] // Stored as an array of text in the database
    });

    // Password modification state tracking
    const [passwordData, setPasswordData] = useState({
        newPassword: '',
        confirmPassword: ''
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = typeof window !== 'undefined'
        ? createBrowserClient(supabaseUrl, supabaseKey)
        : null;

    // Load Profile data on mount
    useEffect(() => {
        async function loadSupervisorProfile() {
            if (!supabase) return;

            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();

                if (userError || !user) {
                    setMessage({ type: 'error', text: 'Failed to load authenticated user session.' });
                    return;
                }

                // Fetch data from public profiles table
                const { data: publicProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                const metadata = user.user_metadata || {};

                // Parse assigned_lgas safely ensuring it remains an array structure
                const dbLgas = publicProfile?.assigned_lgas || metadata.assigned_lgas;
                const parsedLgas = Array.isArray(dbLgas) ? dbLgas : dbLgas ? [dbLgas] : [];

                const supervisorData = {
                    fullName: publicProfile?.full_name || metadata.full_name || '',
                    email: user.email || '',
                    phone: publicProfile?.phone || metadata.phone || '',
                    role: publicProfile?.role || metadata.role || 'LGA_SUPERVISOR',
                    assignedState: publicProfile?.assigned_state || metadata.assigned_state || '',
                    assignedLgas: parsedLgas
                };

                setFormData(supervisorData);

                // Fetch downstream metrics if territory assignments are present
                if (supervisorData.assignedState && supervisorData.assignedLgas.length > 0) {
                    await fetchAllJurisdictionsData(supervisorData.assignedState, supervisorData.assignedLgas);
                }

            } catch (err) {
                console.error("Supervisor profile load error:", err);
                setMessage({ type: 'error', text: 'An unexpected error occurred while retrieving profile data.' });
            } finally {
                setIsLoading(false);
            }
        }

        loadSupervisorProfile();
    }, [supabase]);

    // Query location metrics for all assigned LGAs in parallel
    const fetchAllJurisdictionsData = async (stateName, lgasArray) => {
        try {
            let compiledWards = [];
            let aggregatedPollingUnits = 0;

            // Resolve location endpoints concurrently for each assigned LGA
            const fetchPromises = lgasArray.map(async (lgaName) => {
                const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}&lga=${encodeURIComponent(lgaName)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.wards) {
                        compiledWards = [...compiledWards, ...data.wards];
                    }
                    if (data.total_polling_units) {
                        aggregatedPollingUnits += data.total_polling_units;
                    }
                }
            });

            await Promise.all(fetchPromises);

            setWardsList(compiledWards);
            setMetricCounts({
                totalWards: compiledWards.length,
                totalPollingUnits: aggregatedPollingUnits
            });
        } catch (err) {
            console.error("Error resolving breakdown parameters for assigned jurisdictions:", err);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordInputChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({ ...prev, [name]: value }));
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        if (!supabase) return;

        setMessage({ type: '', text: '' });

        startTransition(async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    setMessage({ type: 'error', text: 'Authentication session expired. Please log in again.' });
                    return;
                }

                // Update Authentication user metadata context
                const { error: authError } = await supabase.auth.updateUser({
                    data: {
                        full_name: formData.fullName,
                        phone: formData.phone
                    }
                });

                if (authError) {
                    setMessage({ type: 'error', text: authError.message || 'Failed to update authentication metadata.' });
                    return;
                }

                // Update Profiles table relational record data
                const { error: profileTableError } = await supabase
                    .from('profiles')
                    .update({
                        full_name: formData.fullName,
                        phone: formData.phone,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', user.id);

                if (profileTableError) {
                    setMessage({ type: 'error', text: profileTableError.message || 'Profile database synchronization failed.' });
                    return;
                }

                setMessage({ type: 'success', text: 'Profile contact details updated successfully.' });
            } catch (err) {
                console.error("Profile save error:", err);
                setMessage({ type: 'error', text: 'Internal error processing profile updates.' });
            }
        });
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (!supabase) return;

        setPasswordMessage({ type: '', text: '' });

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'The new passwords do not match.' });
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
                    setPasswordMessage({ type: 'error', text: error.message || 'Failed to update account password.' });
                    return;
                }

                setPasswordMessage({ type: 'success', text: 'Account password updated successfully.' });
                setPasswordData({ newPassword: '', confirmPassword: '' });
            } catch (err) {
                console.error("Password update error:", err);
                setPasswordMessage({ type: 'error', text: 'Internal error processing password update.' });
            }
        });
    };

    if (isLoading) {
        return <LoadingOverlay message="Loading profile configuration..." />;
    }

    return (
        <main className="p-4 px-0 max-w-4xl mx-auto space-y-12 bg-background text-textMain">
            {isPending && <LoadingOverlay message="Saving profile modifications..." />}

            {/* Profile Identity Header */}
            <div className="border-b border-textMuted/20 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-textMuted bg-card px-2.5 py-1 rounded-md border border-textMuted/10">
                        Account Preferences
                    </span>
                    <h1 className="text-2xl font-black text-textMain uppercase tracking-tight pt-1">Supervisor Profile Settings</h1>
                    <p className="text-xs font-medium text-textMuted">
                        Manage your personal contact details, adjust security credentials, and review assigned operations.
                    </p>
                </div>

                {/* Assigned Jurisdictions Summary */}
                {formData.assignedLgas.length > 0 && (
                    <div className="bg-card border border-textMuted/20 rounded-xl px-4 py-3 flex flex-col items-start md:items-end text-left md:text-right max-w-md w-full md:w-auto shadow-xs">
                        <div className="text-[10px] font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-primary" />
                            <span>Jurisdiction: <span className="text-textMain font-mono font-black">{formData.assignedLgas.join(', ').toUpperCase()}, {formData.assignedState?.toUpperCase()} STATE</span></span>
                        </div>
                        <div className="flex gap-x-4 text-[10px] font-bold uppercase text-textMuted mt-1.5 border-t border-textMuted/10 pt-1 w-full justify-start md:justify-end">
                            <div>Wards: <span className="text-textMain font-mono font-black">{metricCounts.totalWards}</span></div>
                            {metricCounts.totalPollingUnits > 0 && <div>Polling Units: <span className="text-textMain font-mono font-black">{metricCounts.totalPollingUnits}</span></div>}
                        </div>
                    </div>
                )}
            </div>

            {/* Form Workspace Area */}
            <div className="space-y-8">
                {message.text && (
                    <div className={`p-4 rounded-xl border text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${message.type === 'success'
                        ? 'bg-accent/10 border-accent/30 text-accent'
                        : 'bg-gold/10 border-gold/30 text-gold'
                        }`}>
                        {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        <span>{message.text}</span>
                    </div>
                )}

                <form onSubmit={handleProfileUpdate} className="bg-card border border-textMuted/20 rounded-2xl p-6 shadow-sm space-y-8">

                    {/* Contact Details Group */}
                    <div>
                        <h3 className="text-[10px] font-black tracking-widest text-textMuted uppercase mb-6 border-b border-textMuted/10 pb-2 flex items-center gap-2">
                            <User className="w-4 h-4 text-textMuted" /> Supervisor Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMain tracking-wider uppercase">Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleInputChange}
                                    placeholder="Enter full name"
                                    required
                                    className="w-full px-4 py-3 bg-background border border-textMuted/20 rounded-xl text-xs font-bold text-textMain uppercase tracking-wide focus:border-primary focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMuted tracking-wider uppercase flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> Email Address (Read-Only)
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full px-4 py-3 bg-background/50 border border-textMuted/10 rounded-xl text-xs font-bold text-textMuted tracking-wide cursor-not-allowed opacity-60"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMain tracking-wider uppercase flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> Phone Number
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder="Enter phone number"
                                    className="w-full px-4 py-3 bg-background border border-textMuted/20 rounded-xl text-xs font-bold text-textMain tracking-wide focus:border-primary focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMuted tracking-wider uppercase flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> Account Role Type
                                </label>
                                <div className="w-full px-4 py-3 bg-background/60 border border-textMuted/10 rounded-xl text-xs font-black text-primary uppercase tracking-wider">
                                    LGA Supervisor
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Static Boundaries Parameter Block */}
                    <div>
                        <h3 className="text-[10px] font-black tracking-widest text-textMuted uppercase mb-2 border-b border-textMuted/10 pb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-textMuted" /> Assigned Territories
                        </h3>
                        <p className="text-[10px] text-textMuted font-bold uppercase mb-6 tracking-wide italic">
                            Your structural workspace boundary parameters are managed strictly by system administrators.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMuted tracking-wider uppercase">Assigned State</label>
                                <input
                                    type="text"
                                    value={formData.assignedState || 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-4 py-3 bg-background/50 border border-textMuted/10 rounded-xl text-xs font-bold text-textMuted uppercase tracking-wide cursor-not-allowed opacity-60"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMuted tracking-wider uppercase">Assigned LGAs</label>
                                <input
                                    type="text"
                                    value={formData.assignedLgas.length > 0 ? formData.assignedLgas.join(', ').toUpperCase() : 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-4 py-3 bg-background/50 border border-textMuted/10 rounded-xl text-xs font-bold text-textMuted uppercase tracking-wide cursor-not-allowed opacity-60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="border-t border-textMuted/10 pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all disabled:opacity-50 min-w-[200px] text-center shadow-md border border-transparent hover:scale-[1.01] active:scale-[0.99]"
                        >
                            {isPending ? 'Saving changes...' : 'Save Profile Changes'}
                        </button>
                    </div>
                </form>

                {/* Security Access Settings */}
                <div className="pt-4 border-t border-textMuted/10">
                    {passwordMessage.text && (
                        <div className={`mb-6 p-4 rounded-xl border text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${passwordMessage.type === 'success'
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : 'bg-gold/10 border-gold/30 text-gold'
                            }`}>
                            {passwordMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            <span>{passwordMessage.text}</span>
                        </div>
                    )}

                    <form onSubmit={handlePasswordUpdate} className="bg-card border border-textMuted/20 rounded-2xl p-6 shadow-sm space-y-6">
                        <div>
                            <h3 className="text-[10px] font-black tracking-widest text-textMuted uppercase mb-1 border-b border-textMuted/10 pb-2 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-textMuted" /> Change Account Password
                            </h3>
                            <p className="text-[10px] text-textMuted font-bold uppercase mb-4 tracking-wide italic">
                                Update credentials periodically to ensure internal security frameworks remain compliant.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMain tracking-wider uppercase">New Password</label>
                                <input
                                    type="password"
                                    name="newPassword"
                                    value={passwordData.newPassword}
                                    onChange={handlePasswordInputChange}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 bg-background border border-textMuted/20 rounded-xl text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-[10px] font-black text-textMain tracking-wider uppercase">Confirm New Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={passwordData.confirmPassword}
                                    onChange={handlePasswordInputChange}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 bg-background border border-textMuted/20 rounded-xl text-xs font-bold text-textMain focus:border-primary focus:outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="bg-textMain hover:bg-textMain/90 text-background text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all disabled:opacity-50 min-w-[200px] text-center shadow-md border border-transparent hover:scale-[1.01] active:scale-[0.99]"
                            >
                                {isPending ? 'Updating password...' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}