// tailwind.config.js
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
                primary: {
                    DEFAULT: '#9A6749', // Warm Oak / Lighter Walnut Brown  // Soft Camel/Tan Accent
                },
                accent: {
                    DEFAULT: '#15803d', // Deep Emerald Green
                    light: '#d1fae5',   // Mint hint for success badges
                },
                danger: '#dc2626',    // Clean Red
                warning: '#ea580c',   // Burnt Orange
                background: '#FAF6F0',// Warm Linen Ivory White
                card: '#ffffff',      // Crisp White
                textMain: '#291C14',  // Deep Espresso
                textMuted: '#8A7968', // Muted Taupe Grey
            },
        },
    },
    plugins: [],
};