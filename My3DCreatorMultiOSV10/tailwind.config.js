/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          950: '#0d0f12',
          900: '#14171d',
          850: '#1a1e26',
          800: '#222732',
          700: '#2e3544',
          600: '#3f475a',
          500: '#545f77',
          accent: '#3b82f6',
          'accent-hover': '#2563eb',
        }
      }
    },
  },
  plugins: [],
}
