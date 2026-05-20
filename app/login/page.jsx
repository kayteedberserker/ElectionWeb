// app/login/page.jsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingOverlay from '../../components/LoadingOverlay';
// Import your authentication server actions here
import { signIn, signUpCandidate } from '../auth/actions';

export default function WebLoginPage() {
    const router = useRouter();
    const [isSignUp, setIsSignUp] = useState(false);
    const [fullName, setFullName] = useState('');
    const [contestedSeat, setContestedSeat] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState('candidate');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Toggle states for password fields visibility
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            setErrorMessage("Please fill in all required fields.");
            return;
        }

        if (isSignUp) {
            if (!fullName || !contestedSeat) {
                setErrorMessage("Please fill in your name and contested seat information.");
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

                // Fix: Check the actual 'success' boolean returned by the action
                if (!result.success) throw new Error(result.message);

                if (result.requiresConfirmation) {
                    setSuccessMessage(result.message);
                } else {
                    router.push(result.redirectPath || '/dashboard');
                }
            } else {
                // Pass selectedRole down so the authentication action knows which user role table/scope to check
                const result = await signIn(email, password, selectedRole);

                // Fix: Check the actual 'success' boolean returned by the action
                if (!result.success) throw new Error(result.message);

                // Fix: Utilize the server-determined redirect path
                router.push(result.redirectPath || '/dashboard');
            }
        } catch (error) {
            setErrorMessage(error.message || (isSignUp ? "Registration failed. Try again." : "Invalid email or password. Please try again."));
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

        if (nextState) {
            setSelectedRole('candidate');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#FAF6F0] selection:bg-[#9A6749]/20 transition-colors duration-300">
            {isLoading && <LoadingOverlay message={isSignUp ? "Creating candidate profile..." : "Signing in..."} />}

            <div className="w-full max-w-md space-y-8 bg-[#ffffff] p-10 rounded-2xl shadow-xl border-2 border-[#8A7968]/20 backdrop-blur-sm transform transition-all duration-300">

                <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#9A6749] text-white font-bold text-xl tracking-wider shadow-md shadow-[#9A6749]/30 transition-transform hover:scale-105 duration-200">
                        E
                    </div>
                    <h2 className="mt-6 text-3xl font-bold text-[#291C14] tracking-tight">
                        {isSignUp ? 'Candidate Sign Up' : 'Election Monitor'}
                    </h2>
                    <p className="mt-2 text-sm text-[#8A7968] font-semibold">
                        {isSignUp ? 'Register your official candidacy dashboard' : 'Executive Results Management Dashboard'}
                    </p>
                </div>

                {/* Role Switcher Grid */}
                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#FAF6F0] rounded-xl border border-[#8A7968]/30 shadow-inner">
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
                                    setErrorMessage("LGA and Ward positions must be provisioned internally by an administrator.");
                                    return;
                                }
                                setSelectedRole(role.id);
                                setErrorMessage(null);
                            }}
                            className={`py-2.5 text-xs font-bold rounded-lg transition-all duration-200 uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#9A6749]/40 ${selectedRole === role.id
                                ? 'bg-[#9A6749] text-white shadow-md transform scale-[1.02]'
                                : 'text-[#8A7968] hover:text-[#291C14] hover:bg-[#8A7968]/5'
                                }`}
                        >
                            {role.label}
                        </button>
                    ))}
                </div>

                {/* Error Notice */}
                {errorMessage && (
                    <div className="p-4 rounded-xl bg-[#dc2626]/5 border-2 border-[#dc2626]/20 text-[#dc2626] text-xs font-bold flex items-center animate-fadeIn">
                        <span className="mr-2 text-base">⚠️</span> {errorMessage}
                    </div>
                )}

                {/* Success Notice for Email Confirmation */}
                {successMessage && (
                    <div className="p-4 rounded-xl bg-[#16a34a]/5 border-2 border-[#16a34a]/20 text-[#16a34a] text-xs font-bold flex items-center animate-fadeIn">
                        <span className="mr-2 text-base">✅</span> {successMessage}
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleFormSubmit}>
                    <div className="space-y-5 rounded-md">

                        {isSignUp && (
                            <>
                                <div className="space-y-1">
                                    <label htmlFor="full-name" className="block text-xs font-bold uppercase tracking-wider text-[#291C14]">
                                        Full Name
                                    </label>
                                    <input
                                        id="full-name"
                                        name="fullName"
                                        type="text"
                                        required
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/30 bg-[#FAF6F0] px-4 py-3 text-[#291C14] text-sm font-semibold placeholder-[#8A7968]/40 transition-all duration-200 focus:border-[#9A6749] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#9A6749]/10"
                                        placeholder="Hon. Umar Karim"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="contested-seat" className="block text-xs font-bold uppercase tracking-wider text-[#291C14]">
                                        Contested Seat / Position
                                    </label>
                                    <div className="relative">
                                        <select
                                            id="contested-seat"
                                            name="contestedSeat"
                                            required
                                            value={contestedSeat}
                                            onChange={(e) => setContestedSeat(e.target.value)}
                                            className="block w-full rounded-xl border-2 border-[#8A7968]/30 bg-[#FAF6F0] px-4 py-3 text-[#291C14] text-sm font-semibold transition-all duration-200 focus:border-[#9A6749] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#9A6749]/10 appearance-none native-select cursor-pointer pr-10"
                                        >
                                            <option value="" disabled className="text-[#8A7968]/40">Select Contested position</option>
                                            <option value="governor">Governor</option>
                                            <option value="senate">Senate</option>
                                            <option value="house_of_rep">House of Representatives</option>
                                            <option value="state_assembly">State House of Assembly</option>
                                            <option value="chairman">Local Government Chairman</option>
                                            <option value="councilor">Ward Councilor</option>
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#8A7968]">
                                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="space-y-1">
                            <label htmlFor="email-address" className="block text-xs font-bold uppercase tracking-wider text-[#291C14]">
                                Email Address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="block w-full rounded-xl border-2 border-[#8A7968]/30 bg-[#FAF6F0] px-4 py-3 text-[#291C14] text-sm font-semibold placeholder-[#8A7968]/40 transition-all duration-200 focus:border-[#9A6749] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#9A6749]/10"
                                placeholder="name@domain.com"
                            />
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-[#291C14]">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete={isSignUp ? "new-password" : "current-password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full rounded-xl border-2 border-[#8A7968]/30 bg-[#FAF6F0] pl-4 pr-11 py-3 text-[#291C14] text-sm font-semibold placeholder-[#8A7968]/40 transition-all duration-200 focus:border-[#9A6749] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#9A6749]/10"
                                    placeholder="••••••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8A7968] hover:text-[#9A6749] transition-colors focus:outline-none"
                                >
                                    {showPassword ? (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {isSignUp && (
                            <div className="space-y-1">
                                <label htmlFor="confirm-password" className="block text-xs font-bold uppercase tracking-wider text-[#291C14]">
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="confirm-password"
                                        name="confirm-password"
                                        type={showConfirmPassword ? "text" : "password"}
                                        autoComplete="new-password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="block w-full rounded-xl border-2 border-[#8A7968]/30 bg-[#FAF6F0] pl-4 pr-11 py-3 text-[#291C14] text-sm font-semibold placeholder-[#8A7968]/40 transition-all duration-200 focus:border-[#9A6749] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#9A6749]/10"
                                        placeholder="••••••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8A7968] hover:text-[#9A6749] transition-colors focus:outline-none"
                                    >
                                        {showConfirmPassword ? (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                            </svg>
                                        ) : (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold tracking-wide">
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                className="h-4 w-4 rounded border-2 border-[#8A7968]/40 text-[#9A6749] bg-[#FAF6F0] focus:ring-[#9A6749]/40 cursor-pointer accent-[#9A6749]"
                            />
                            <label htmlFor="remember-me" className="ml-2 text-[#8A7968] cursor-pointer select-none">
                                Remember me
                            </label>
                        </div>
                        {!isSignUp && (
                            <a href="#" className="font-bold text-[#9A6749] hover:text-[#291C14] transition-colors duration-200">
                                Forgot Password?
                            </a>
                        )}
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative flex w-full justify-center rounded-xl bg-[#9A6749] px-4 py-4 text-sm font-bold tracking-wider text-white uppercase transition-all duration-200 hover:bg-[#83563a] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-[#9A6749]/20"
                        >
                            {isSignUp ? 'Register as Candidate' : 'Sign In'}
                        </button>
                    </div>

                    <div className="text-center mt-4">
                        <button
                            type="button"
                            onClick={handleToggleFlow}
                            className="text-xs font-bold text-[#8A7968] hover:text-[#9A6749] transition-colors uppercase tracking-wider focus:outline-none focus:underline"
                        >
                            {isSignUp ? 'Already have an account? Sign In' : "Are you a candidate? Create an Account"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}