/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // NookPoll Branding
                primary: {
                    DEFAULT: '#1E3A8A', // Deep Blue for Trust
                    dark: '#172554',
                },
                accent: {
                    DEFAULT: '#16A34A', // Green for Democracy/Growth
                    light: '#DCFCE7',
                },
                gold: {
                    DEFAULT: '#D97706', // Premium Accent
                    light: '#F59E0B',
                },
                background: '#F9FAFB', // Clean Light Gray
                card: '#ffffff',
                textMain: '#111827', // Slate Black
                textMuted: '#6B7280', // Professional Grey
            },
        },
    },
    plugins: [],
};