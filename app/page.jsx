'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadingOverlay from '../components/LoadingOverlay';

export default function LandingPage() {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 1200);
        return () => clearTimeout(timer);
    }, []);

    if (isLoading) {
        return <LoadingOverlay message="Loading NookPoll Command..." />;
    }

    return (
        <div className="min-h-screen bg-background text-textMain font-sans selection:bg-accent/20">
            {/* Header */}
            <nav className="sticky top-0 z-40 bg-card/90 backdrop-blur-md border-b border-primary/10 px-8 py-5 flex justify-between items-center">
                <div className="text-2xl font-bold text-primary tracking-tight">NookPoll</div>
                <div className="flex items-center gap-6">
                    <Link href="/login" className="text-sm font-semibold text-textMuted hover:text-primary">Login</Link>
                    <Link href="/login" className="bg-primary text-white px-5 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-all shadow-md">
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="py-24 px-8 bg-gradient-to-br from-white to-background text-center">
                <div className="max-w-4xl mx-auto">
                    <span className="inline-block py-1 px-3 rounded-full bg-accent/10 text-accent font-medium text-sm mb-6 border border-accent/20">
                        The Official Election Command System
                    </span>
                    <h1 className="text-5xl md:text-7xl font-extrabold text-primary mb-8 leading-tight">
                        Collate, Monitor, <br /> and <span className="text-accent">Protect Every Vote.</span>
                    </h1>
                    <p className="text-xl text-textMuted mb-10 max-w-2xl mx-auto leading-relaxed">
                        The complete election monitoring ecosystem. From polling unit agents to the candidate dashboard, we digitize and secure your results in real-time.
                    </p>
                    <Link href="/login" className="bg-accent text-white px-10 py-4 rounded-lg text-lg font-bold hover:bg-green-700 transition-all shadow-lg hover:shadow-xl">
                        Start Your Campaign
                    </Link>
                </div>
            </header>

            {/* Hierarchy Section */}
            <section className="py-24 px-8 bg-white">
                <div className="max-w-6xl mx-auto text-center mb-16">
                    <h2 className="text-4xl font-bold text-primary mb-6">A Unified Command Structure</h2>
                    <p className="text-textMuted text-lg max-w-2xl mx-auto">
                        Manage your entire ground force with ease. NookPoll allows you to delegate oversight seamlessly across the entire campaign hierarchy.
                    </p>
                </div>
                <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-4">
                    {[
                        { title: 'Candidate', desc: 'Full oversight and result analytics dashboard.' },
                        { title: 'LGA Supervisor', desc: 'Monitor and manage specific local government data.' },
                        { title: 'Ward Supervisor', desc: 'Oversee ward-level logistics and agent reports.' },
                        { title: 'PU Agent', desc: 'Scan EC8A forms and upload results from the field.' }
                    ].map((role, i) => (
                        <div key={i} className="p-6 bg-background rounded-xl border border-primary/10">
                            <div className="text-accent font-bold mb-2">Step {i + 1}</div>
                            <h3 className="text-lg font-bold text-primary mb-2">{role.title}</h3>
                            <p className="text-sm text-textMuted">{role.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Tech Feature Section (EC8A Scanning) */}
            <section className="py-24 px-8 bg-primary text-white">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-16">
                    <div className="flex-1">
                        <h2 className="text-4xl font-bold mb-6">OCR-Powered Result Collation</h2>
                        <p className="text-lg text-white/80 mb-8 leading-relaxed">
                            Stop manual data entry. Our agents simply scan the EC8A form using our mobile app. NookPoll instantly extracts the polling unit name, code, and total votes, updating your dashboard in seconds.
                        </p>
                        <div className="bg-white/10 p-6 rounded-lg border border-white/20">
                            <p className="font-semibold">✓ Instant Data Extraction</p>
                            <p className="font-semibold mt-2">✓ Verified Digital Trail</p>
                            <p className="font-semibold mt-2">✓ Real-time Collation</p>
                        </div>
                    </div>
                    <div className="flex-1 w-full h-80 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center">
                        <span className="text-white/30 font-medium">EC8A Scan Interface Mockup</span>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-24 px-8 bg-background">
                <div className="max-w-4xl mx-auto text-center mb-16">
                    <h2 className="text-4xl font-bold text-primary mb-6">Simple Pricing for Campaigns</h2>
                    <p className="text-textMuted">Scale NookPoll according to the scope of your election.</p>
                </div>
                <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
                    {/* Tier 1 */}
                    <div className="p-8 bg-card rounded-2xl border border-primary/10 shadow-sm">
                        <h3 className="text-2xl font-bold text-primary mb-4">Standard Campaign</h3>
                        <p className="text-textMuted mb-6">Ideal for local/house assembly elections.</p>
                        <div className="text-4xl font-bold text-primary mb-8">$X,XXX <span className="text-lg font-normal text-textMuted">/ election</span></div>
                        <ul className="space-y-4 mb-8 text-left">
                            <li className="flex items-center gap-2">✓ Up to 500 Agents</li>
                            <li className="flex items-center gap-2">✓ Basic Analytics</li>
                            <li className="flex items-center gap-2">✓ EC8A Form Scanning</li>
                        </ul>
                        <Link href="/login" className="block text-center w-full py-3 rounded-lg border border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all">
                            Choose Standard
                        </Link>
                    </div>
                    {/* Tier 2 */}
                    <div className="p-8 bg-primary text-white rounded-2xl shadow-xl transform md:scale-105">
                        <h3 className="text-2xl font-bold mb-4">Enterprise Command</h3>
                        <p className="text-white/80 mb-6">For State, Federal, or Presidential level.</p>
                        <div className="text-4xl font-bold mb-8">$X,XXX <span className="text-lg font-normal text-white/60">/ election</span></div>
                        <ul className="space-y-4 mb-8 text-left">
                            <li className="flex items-center gap-2">✓ Unlimited Agents</li>
                            <li className="flex items-center gap-2">✓ Advanced Predictive Analytics</li>
                            <li className="flex items-center gap-2">✓ Priority Support</li>
                            <li className="flex items-center gap-2">✓ Custom Hierarchy Setup</li>
                        </ul>
                        <Link href="/login" className="block text-center w-full py-3 rounded-lg bg-accent text-white font-bold hover:bg-green-600 transition-all">
                            Get Enterprise
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 bg-card text-center border-t border-primary/10 text-textMuted">
                <p className="font-semibold text-primary mb-2">NookPoll</p>
                <p className="text-sm">&copy; 2026 NookPoll. All rights reserved.</p>
            </footer>
        </div>
    );
}