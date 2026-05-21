'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Eye,
    EyeOff,
    Lock,
    Mail,
    User,
    Building,
    CheckCircle,
    AlertCircle,
    ShieldCheck
} from 'lucide-react';

import LoadingOverlay from '../../components/LoadingOverlay';
// NOTE: Added resetPassword and resendConfirmationEmail for the upcoming backend update
import { signIn, signUpCandidate, resetPassword, resendConfirmationEmail } from '../auth/actions';

export default function WebLoginPage() {
    const router = useRouter();
    const [isSignUp, setIsSignUp] = useState(false);

    // New UI states for the recovery flows
    const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
    const [resendEmailMode, setResendEmailMode] = useState(false);

    const [fullName, setFullName] = useState('');
    const [contestedSeat, setContestedSeat] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState('candidate');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            setErrorMessage("Please provide your email address.");
            return;
        }

        // Handle Forgot Password Flow
        if (forgotPasswordMode) {
            setIsLoading(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            try {
                const result = await resetPassword(email);
                if (!result.success) throw new Error(result.message);
                setSuccessMessage("If an account exists, a password reset link has been sent.");
            } catch (error) {
                setErrorMessage(error.message || "Failed to send reset link.");
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // Handle Resend Email Flow
        if (resendEmailMode) {
            setIsLoading(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            try {
                const result = await resendConfirmationEmail(email);
                if (!result.success) throw new Error(result.message);
                setSuccessMessage("Confirmation email resent successfully. Please check your inbox.");
            } catch (error) {
                setErrorMessage(error.message || "Failed to resend confirmation email.");
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // Standard Auth Flows
        if (!password) {
            setErrorMessage("Please fill in all required fields.");
            return;
        }

        if (isSignUp) {
            if (!fullName || !contestedSeat) {
                setErrorMessage("Please provide your full name and the seat you are contesting.");
                return;
            }
            if (password !== confirmPassword) {
                setErrorMessage("Passwords do not match.");
                return;
            }
        }

        setIsLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            if (isSignUp) {
                const result = await signUpCandidate({ email, password, fullName, contestedSeat });
                if (!result.success) throw new Error(result.message);
                if (result.requiresConfirmation) {
                    setSuccessMessage(result.message);
                } else {
                    router.push(result.redirectPath || '/dashboard');
                }
            } else {
                const result = await signIn(email, password, selectedRole);
                if (!result.success) throw new Error(result.message);
                router.push(result.redirectPath || '/dashboard');
            }
        } catch (error) {
            setErrorMessage(error.message || (isSignUp ? "Registration failed. Try again." : "Invalid credentials. Please verify your access."));
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleFlow = () => {
        const nextState = !isSignUp;
        setIsSignUp(nextState);
        setErrorMessage(null);
        setSuccessMessage(null);
        setShowPassword(false);
        setShowConfirmPassword(false);
        setForgotPasswordMode(false);
        setResendEmailMode(false);
        if (nextState) setSelectedRole('candidate');
    };

    const resetToLogin = () => {
        setForgotPasswordMode(false);
        setResendEmailMode(false);
        setIsSignUp(false);
        setErrorMessage(null);
        setSuccessMessage(null);
    };

    // Determine loading text based on current mode
    const getLoadingMessage = () => {
        if (forgotPasswordMode) return "Sending Reset Link...";
        if (resendEmailMode) return "Resending Email...";
        return isSignUp ? "Initializing Candidate Profile..." : "Authenticating Access...";
    };

    // Determine header text based on current mode
    const getHeaderText = () => {
        if (forgotPasswordMode) return "Reset Password";
        if (resendEmailMode) return "Resend Confirmation";
        return isSignUp ? "Candidate Registration" : "NookPoll Authentication";
    };

    const getHeaderSubtext = () => {
        if (forgotPasswordMode) return "Enter your email to receive a reset link";
        if (resendEmailMode) return "Enter your email to receive a new confirmation link";
        return isSignUp ? "Establish your command portal" : "Secure access to election data";
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background selection:bg-accent/20">
            {isLoading && <LoadingOverlay message={getLoadingMessage()} />}

            <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-primary/10">

                {/* Header */}
                <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
                        <ShieldCheck size={32} />
                    </div>
                    <h2 className="mt-6 text-2xl font-extrabold text-textMain tracking-tight">
                        {getHeaderText()}
                    </h2>
                    <p className="mt-2 text-sm text-textMuted font-medium">
                        {getHeaderSubtext()}
                    </p>
                </div>

                {/* Role Selector - Only show if not in recovery modes */}
                {!forgotPasswordMode && !resendEmailMode && (
                    <div className="grid grid-cols-3 gap-2 p-1.5 bg-background rounded-xl border border-primary/10">
                        {[
                            { id: 'candidate', label: 'Candidate' },
                            { id: 'lga_supervisor', label: 'LGA' },
                            { id: 'ward_supervisor', label: 'Ward' }
                        ].map((role) => (
                            <button
                                key={role.id}
                                type="button"
                                onClick={() => {
                                    if (isSignUp && role.id !== 'candidate') {
                                        setErrorMessage("Supervisory accounts must be provisioned internally.");
                                        return;
                                    }
                                    setSelectedRole(role.id);
                                    setErrorMessage(null);
                                }}
                                className={`py-2 text-[11px] font-bold rounded-lg transition-all uppercase tracking-wider ${selectedRole === role.id
                                    ? 'bg-primary text-white shadow-md'
                                    : 'text-textMuted hover:text-textMain hover:bg-white/50'
                                    }`}
                            >
                                {role.label}
                            </button>
                        ))}
                    </div>
                )}

                <form className="mt-8 space-y-5" onSubmit={handleFormSubmit}>

                    {/* Only show Full Name and Contested Seat during standard Sign Up */}
                    {isSignUp && !forgotPasswordMode && !resendEmailMode && (
                        <>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-textMuted">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3.5 text-textMuted" size={16} />
                                    <input
                                        type="text"
                                        required
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-4 py-3 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="Enter full name"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-textMuted">Contested Position</label>
                                <div className="relative">
                                    <Building className="absolute left-3 top-3.5 text-textMuted" size={16} />
                                    <select
                                        required
                                        value={contestedSeat}
                                        onChange={(e) => setContestedSeat(e.target.value)}
                                        className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-4 py-3 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                                    >
                                        <option value="">Select Position</option>
                                        <option value="governor">Governor</option>
                                        <option value="senate">Senate</option>
                                        <option value="house_of_rep">House of Representatives</option>
                                        <option value="state_assembly">State House of Assembly</option>
                                        <option value="chairman">LG Chairman</option>
                                        <option value="councilor">Ward Councilor</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Email is used in all modes */}
                    <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-textMuted">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3.5 text-textMuted" size={16} />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-4 py-3 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="name@domain.com"
                            />
                        </div>
                    </div>

                    {/* Only show passwords if we are not in recovery modes */}
                    {!forgotPasswordMode && !resendEmailMode && (
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-textMuted">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 text-textMuted" size={16} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-10 py-3 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-textMuted hover:text-primary">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {isSignUp && !forgotPasswordMode && !resendEmailMode && (
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-textMuted">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 text-textMuted" size={16} />
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full rounded-xl border border-primary/10 bg-background pl-10 pr-10 py-3 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3 text-textMuted hover:text-primary">
                                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-white py-4 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-50 shadow-md"
                    >
                        {forgotPasswordMode ? 'Reset Password' : resendEmailMode ? 'Resend Email' : isSignUp ? 'Create Account' : 'Sign In'}
                    </button>

                    {/* MOVED: Status Messages now render directly below the submit button */}
                    {errorMessage && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-600 text-xs font-bold flex items-center gap-2">
                            <CheckCircle size={16} className="shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Additional Links below the button/messages */}
                    <div className="flex flex-col items-center gap-4 pt-2">
                        {/* Links available only during standard Sign In */}
                        {!isSignUp && !forgotPasswordMode && !resendEmailMode && (
                            <div className="flex flex-col items-center gap-2 w-full">
                                <button
                                    type="button"
                                    onClick={() => { setForgotPasswordMode(true); setErrorMessage(null); setSuccessMessage(null); }}
                                    className="text-xs text-textMuted hover:text-primary transition-colors"
                                >
                                    Forgot your password?
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setResendEmailMode(true); setErrorMessage(null); setSuccessMessage(null); }}
                                    className="text-xs text-textMuted hover:text-primary transition-colors"
                                >
                                    Didn't receive confirmation email?
                                </button>
                            </div>
                        )}

                        {/* Toggle between Login and Registration (Hide in recovery modes) */}
                        {!forgotPasswordMode && !resendEmailMode && (
                            <button
                                type="button"
                                onClick={handleToggleFlow}
                                className="w-full text-xs font-bold text-textMuted hover:text-primary transition-colors uppercase tracking-wider mt-2"
                            >
                                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Register"}
                            </button>
                        )}

                        {/* Back to Login button for recovery modes */}
                        {(forgotPasswordMode || resendEmailMode) && (
                            <button
                                type="button"
                                onClick={resetToLogin}
                                className="w-full text-xs font-bold text-textMuted hover:text-primary transition-colors uppercase tracking-wider"
                            >
                                Back to Login
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}