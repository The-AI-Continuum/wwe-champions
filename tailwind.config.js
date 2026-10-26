/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#09090a',
          900: '#111113',
          850: '#18181b',
          800: '#202024',
          700: '#2d2d32',
        },
        gold: {
          300: '#f8d77a',
          500: '#d8a72f',
        },
        // Arena Scoreboard surfaces and text tones (JOS-719, ADR 0001).
        arena: {
          card: '#141419',
          field: '#121216',
          muted: '#8b8b96',
          value: '#d4d4d8',
        },
      },
      boxShadow: {
        card: '0 18px 60px rgba(0, 0, 0, 0.26)',
      },
    },
  },
  plugins: [],
};
