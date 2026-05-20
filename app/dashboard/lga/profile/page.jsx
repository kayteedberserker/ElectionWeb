'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
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
                    setMessage({ type: 'error', text: 'Failed to synchronize authenticated user session.' });
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
        <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-12">
            {isPending && <LoadingOverlay message="Saving updates..." />}

            {/* Profile Identity Header */}
            <div className="border-b-2 border-[#8A7968]/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-[#291C14] uppercase tracking-wide">Supervisor Profile Settings</h1>
                    <p className="text-xs font-medium text-[#8A7968] mt-1">
                        Manage your contact information, update security settings, and review your assigned geographic jurisdictions.
                    </p>
                </div>

                {/* Supervisor Jurisdiction Tracker Display Element */}
                {formData.assignedLgas.length > 0 && (
                    <div className="bg-[#FAF6F0] border border-[#8A7968]/20 rounded-xl px-4 py-3 flex flex-col items-end text-right max-w-md">
                        <div className="text-[10px] font-black text-[#9A6749] uppercase tracking-wider">
                            Assigned Jurisdiction: <span className="text-[#291C14] font-mono font-black">{formData.assignedLgas.join(', ').toUpperCase()}, {formData.assignedState?.toUpperCase()} STATE</span>
                        </div>
                        <div className="flex gap-x-4 text-[9px] font-bold uppercase text-[#8A7968] mt-1">
                            <div>Total Wards: <span className="text-[#291C14] font-mono">{metricCounts.totalWards}</span></div>
                            {metricCounts.totalPollingUnits > 0 && <div>Total Polling Units: <span className="text-[#291C14] font-mono">{metricCounts.totalPollingUnits}</span></div>}
                        </div>
                    </div>
                )}
            </div>

            {/* Form Workspace Grid */}
            <div className="space-y-8">
                {message.text && (
                    <div className={`p-4 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${message.type === 'success'
                        ? 'bg-green-50 border-green-500/30 text-green-700'
                        : 'bg-red-50 border-red-500/30 text-red-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleProfileUpdate} className="bg-white border-2 border-[#8A7968]/20 rounded-xl p-6 shadow-sm space-y-8">

                    {/* Identity Data Group */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-4 border-b border-[#8A7968]/10 pb-1">
                            Supervisor Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleInputChange}
                                    placeholder="Enter full name"
                                    required
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] uppercase tracking-wide focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#8A7968] tracking-wider uppercase">Email Address (Locked)</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full px-4 py-3 bg-[#FAF6F0]/50 border-2 border-[#8A7968]/5 rounded-xl text-xs font-bold text-[#8A7968] tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">Phone Number</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder="Enter phone number"
                                    className="w-full px-4 py-3 bg-[#FAF6F0] border-2 border-[#8A7968]/10 rounded-xl text-xs font-bold text-[#291C14] tracking-wide focus:border-[#9A6749] focus:outline-none transition-all"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#8A7968] tracking-wider uppercase">Account Role Type</label>
                                <div className="w-full px-4 py-3 bg-[#FAF6F0]/70 border-2 border-[#8A7968]/5 rounded-xl text-xs font-black text-[#9A6749] uppercase tracking-wider">
                                    LGA Supervisor
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Immutable Assignment Parameters Block */}
                    <div>
                        <h3 className="text-xs font-bold tracking-widest text-[#8A7968] uppercase mb-2 border-b border-[#8A7968]/10 pb-1">
                            Assigned Locations
                        </h3>
                        <p className="text-[10px] text-[#8A7968] font-medium mb-4 italic">
                            Your geographic location assignment is managed by your administrator and cannot be modified from this profile page.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#8A7968] tracking-wider uppercase">Assigned State</label>
                                <input
                                    type="text"
                                    value={formData.assignedState || 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-4 py-3 bg-[#FAF6F0]/50 border-2 border-[#8A7968]/5 rounded-xl text-xs font-bold text-[#8A7968] uppercase tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#8A7968] tracking-wider uppercase">Assigned LGAs</label>
                                <input
                                    type="text"
                                    value={formData.assignedLgas.length > 0 ? formData.assignedLgas.join(', ').toUpperCase() : 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-4 py-3 bg-[#FAF6F0]/50 border-2 border-[#8A7968]/5 rounded-xl text-xs font-bold text-[#8A7968] uppercase tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Submission Node Controls */}
                    <div className="border-t-2 border-[#FAF6F0] pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="bg-[#9A6749] text-white border-2 border-[#9A6749] hover:bg-white hover:text-[#9A6749] text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl transition-all disabled:opacity-50 min-w-[180px] text-center shadow-sm"
                        >
                            {isPending ? 'Saving changes...' : 'Save Profile Changes'}
                        </button>
                    </div>
                </form>

                {/* Password Configuration Section */}
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
                                Change Account Password
                            </h3>
                            <p className="text-[10px] text-[#8A7968] font-medium mb-4 italic">
                                Update your password below to maintain secure access to your account.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-2">
                                <label className="text-[10px] font-bold text-[#291C14] tracking-wider uppercase">New Password</label>
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
                                {isPending ? 'Updating password...' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}