/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#000080", // Navy Blue
                secondary: "#FF0000", // Alert Red
                background: "#E2E8F0", // Slightly darker to make glass "pop"
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'sans-serif'],
            },
            // Glassmorphism helpers
            backgroundImage: {
                'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.1))',
            },
            boxShadow: {
                glass: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
            },
        },
    },
    plugins: [],
}
