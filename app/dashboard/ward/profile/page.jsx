'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, Mail, Phone, Shield, MapPin, Lock, Save, Key, RefreshCw } from 'lucide-react';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function WardSupervisorProfilePage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState({ type: '', text: '' });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

    // Counter metrics aggregated across all assigned wards
    const [metricCounts, setMetricCounts] = useState({
        totalPollingUnits: 0
    });

    // Profile form state layout for a Ward Supervisor
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        role: 'WARD_SUPERVISOR',
        assignedState: '',
        assignedLga: '', // Single LGA context for a ward supervisor
        assignedWards: [] // Stored as an array of text in the database
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

                // Parse assigned_wards safely ensuring it remains an array structure
                const dbWards = publicProfile?.assigned_wards || metadata.assigned_wards;
                const parsedWards = Array.isArray(dbWards) ? dbWards : dbWards ? [dbWards] : [];

                const supervisorData = {
                    fullName: publicProfile?.full_name || metadata.full_name || '',
                    email: user.email || '',
                    phone: publicProfile?.phone || metadata.phone || '',
                    role: publicProfile?.role || metadata.role || 'WARD_SUPERVISOR',
                    assignedState: publicProfile?.assigned_state || metadata.assigned_state || '',
                    assignedLga: publicProfile?.assigned_lga || metadata.assigned_lga || '',
                    assignedWards: parsedWards
                };

                setFormData(supervisorData);

                // Fetch downstream polling unit metrics if territory assignments are present
                if (supervisorData.assignedState && supervisorData.assignedLga && supervisorData.assignedWards.length > 0) {
                    await fetchAllJurisdictionsData(supervisorData.assignedState, supervisorData.assignedLga, supervisorData.assignedWards);
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

    // Query location metrics for all assigned Wards under the designated LGA in parallel
    const fetchAllJurisdictionsData = async (stateName, lgaName, wardsArray) => {
        try {
            let aggregatedPollingUnits = 0;

            // Resolve location endpoints concurrently for each assigned Ward
            const fetchPromises = wardsArray.map(async (wardName) => {
                const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}&lga=${encodeURIComponent(lgaName)}&ward=${encodeURIComponent(wardName)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.total_polling_units) {
                        aggregatedPollingUnits += data.total_polling_units;
                    }
                }
            });

            await Promise.all(fetchPromises);

            setMetricCounts({
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
        <main className="py-4 max-w-5xl mx-auto space-y-10 text-textMain">
            {isPending && <LoadingOverlay message="Saving updates..." />}

            {/* Profile Identity Header */}
            <div className="border-b border-gray-200 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-textMain flex items-center gap-2">
                        <Shield className="w-6 h-6 text-primary" />
                        Supervisor Profile Settings
                    </h1>
                    <p className="text-sm text-textMuted mt-1">
                        Manage your contact information, update security settings, and review your assigned geographic jurisdictions.
                    </p>
                </div>

                {/* Supervisor Jurisdiction Assignment Display Element */}
                {formData.assignedWards.length > 0 && (
                    <div className="bg-card border border-gray-200 rounded-xl p-4 flex flex-col shadow-sm max-w-md w-full md:w-auto">
                        <div className="text-xs font-semibold text-gold flex items-center gap-1.5 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-gold" />
                            <span>ASSIGNED LGA: {formData.assignedLga?.toUpperCase()}, {formData.assignedState?.toUpperCase()} STATE</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs text-textMuted border-t border-gray-100 pt-2">
                            <div>Total Wards: <span className="text-textMain font-bold ml-1">{formData.assignedWards.length}</span></div>
                            {metricCounts.totalPollingUnits > 0 && (
                                <div>Polling Units: <span className="text-textMain font-bold ml-1">{metricCounts.totalPollingUnits}</span></div>
                            )}
                        </div>
                        <div className="text-[11px] text-textMuted mt-2 bg-gray-50 p-2 rounded border border-gray-100 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                            Wards: {formData.assignedWards.join(', ').toUpperCase()}
                        </div>
                    </div>
                )}
            </div>

            {/* Profile Configuration Workspace */}
            <div className="space-y-8">
                {message.text && (
                    <div className={`p-4 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${message.type === 'success'
                        ? 'bg-accent-light border-accent/30 text-accent'
                        : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${message.type === 'success' ? 'bg-accent' : 'bg-red-600'}`} />
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleProfileUpdate} className="bg-card border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">

                    {/* Personal Information Group */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
                            <User className="w-4 h-4 text-primary" />
                            Personal Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMain tracking-wide uppercase">Full Name</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleInputChange}
                                        placeholder="Enter full name"
                                        required
                                        className="w-full pl-3 pr-4 py-2.5 bg-background border border-gray-300 rounded-lg text-sm text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMuted tracking-wide uppercase">Email Address (Locked)</label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-textMuted/60 absolute left-3 top-3.5" />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        disabled
                                        className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-textMuted cursor-not-allowed opacity-70"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMain tracking-wide uppercase">Phone Number</label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 text-textMuted/60 absolute left-3 top-3.5" />
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        placeholder="Enter phone number"
                                        className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-300 rounded-lg text-sm text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMuted tracking-wide uppercase">Account Role Type</label>
                                <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-primary uppercase tracking-wide">
                                    Ward Supervisor
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Electoral Jurisdictions */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-1 border-b border-gray-100 pb-2">
                            <MapPin className="w-4 h-4 text-primary" />
                            Assigned Locations
                        </h3>
                        <p className="text-xs text-textMuted mb-4 italic">
                            Your geographic location assignment is managed by your administrator and cannot be modified from this profile page.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMuted tracking-wide uppercase">Assigned State</label>
                                <input
                                    type="text"
                                    value={formData.assignedState || 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-textMuted uppercase tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMuted tracking-wide uppercase">Assigned LGA</label>
                                <input
                                    type="text"
                                    value={formData.assignedLga || 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-textMuted uppercase tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMuted tracking-wide uppercase">Assigned Wards</label>
                                <input
                                    type="text"
                                    value={formData.assignedWards.length > 0 ? formData.assignedWards.join(', ').toUpperCase() : 'UNASSIGNED'}
                                    disabled
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-textMuted uppercase tracking-wide cursor-not-allowed opacity-70"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Form Actions */}
                    <div className="border-t border-gray-100 pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="bg-primary text-white border border-primary hover:bg-primary-dark hover:border-primary-dark text-sm font-semibold px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 min-w-[160px] flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                        >
                            {isPending ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Saving changes...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Security Configuration Section */}
                <div className="pt-2">
                    {passwordMessage.text && (
                        <div className={`mb-4 p-4 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${passwordMessage.type === 'success'
                            ? 'bg-accent-light border-accent/30 text-accent'
                            : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${passwordMessage.type === 'success' ? 'bg-accent' : 'bg-red-600'}`} />
                            {passwordMessage.text}
                        </div>
                    )}

                    <form onSubmit={handlePasswordUpdate} className="bg-card border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-1 border-b border-gray-100 pb-2">
                                <Key className="w-4 h-4 text-primary" />
                                Change Password
                            </h3>
                            <p className="text-xs text-textMuted mb-4 italic">
                                Update your password below to maintain secure access to your supervisor account.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMain tracking-wide uppercase">New Password</label>
                                <div className="relative">
                                    <Lock className="w-4 h-4 text-textMuted/60 absolute left-3 top-3.5" />
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordInputChange}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-300 rounded-lg text-sm text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-semibold text-textMain tracking-wide uppercase">Confirm New Password</label>
                                <div className="relative">
                                    <Lock className="w-4 h-4 text-textMuted/60 absolute left-3 top-3.5" />
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordInputChange}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-9 pr-4 py-2.5 bg-background border border-gray-300 rounded-lg text-sm text-textMain focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="bg-primary text-white border border-primary hover:bg-primary-dark hover:border-primary-dark text-sm font-semibold px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 min-w-[160px] flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                            >
                                {isPending ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Updating password...
                                    </>
                                ) : (
                                    <>
                                        <Key className="w-4 h-4" />
                                        Update Password
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}