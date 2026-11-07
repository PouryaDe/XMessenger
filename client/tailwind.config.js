/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        vazir: ['Vazirmatn', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        sans: ['var(--font-family)', 'Inter', 'Vazirmatn', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        cream: {
          50: '#FAF6EE',
          100: '#F7F1E5',
          200: '#EFE6D5',
          300: '#E5D7BF',
          400: '#D7C4A5',
        },
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        brand: {
          dark: '#0B0F17',
          surface: '#162032',
          card: '#1E293B',
          border: '#334155',
          accent: '#3b82f6',
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'floating': '0 10px 30px -4px rgba(0, 0, 0, 0.08)',
        'pill': '0 6px 24px -2px rgba(0, 0, 0, 0.07)',
      },
      borderRadius: {
        '4xl': '2rem',
        '3xl': '1.75rem',
      }
    },
  },
  plugins: [],
}
