'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import LoadingOverlay from '../../../components/LoadingOverlay';

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const router = useRouter();
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
        }

        if (password.length < 6) {
            setErrorMessage("Password must be at least 6 characters long.");
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setSuccessMessage("Password updated successfully! Redirecting...");
            setTimeout(() => {
                router.push('/dashboard/candidate');
            }, 2000);
        } catch (error) {
            setErrorMessage(error.message || "Failed to update password.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            {isLoading && <LoadingOverlay message="Updating password..." />}

            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-primary/10">
                <h2 className="text-2xl font-extrabold text-textMain text-center mb-2">Update Password</h2>
                <p className="text-sm text-textMuted text-center mb-8">Enter your new secure password below.</p>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="relative">
                        <Lock className="absolute left-3 top-3.5 text-textMuted" size={16} />
                        <input
                            type={showPassword ? "text" : "password"}
                            required
                            placeholder="New Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-10 py-3 text-sm font-semibold focus:border-primary focus:outline-none"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-textMuted">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-3 top-3.5 text-textMuted" size={16} />
                        <input
                            type={showPassword ? "text" : "password"}
                            required
                            placeholder="Confirm New Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-10 py-3 text-sm font-semibold focus:border-primary focus:outline-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                        Update Password
                    </button>

                    {errorMessage && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center gap-2">
                            <AlertCircle size={16} /> {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-600 text-xs font-bold flex items-center gap-2">
                            <CheckCircle size={16} /> {successMessage}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}