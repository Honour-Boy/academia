import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fira Sans', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'Menlo', 'monospace'],
      },
      colors: {
        // Legacy in-app accent (used across dashboard/admin). Left unchanged.
        brand: {
          DEFAULT: '#22C55E',
          dark:    '#16A34A',
          light:   '#86EFAC',
          // ── My Dream College brand palette, extracted from the report sheet ──
          // Primary  : crimson of the header banner / "REPORT SHEET" title
          // Secondary: gold of the "MY DREAM COLLEGE" wordmark
          // Accent   : deep navy of the school crest
          primary: {
            DEFAULT: '#C1121F',
            dark:    '#8A0E17',
            light:   '#FBEAEC',
          },
          secondary: {
            DEFAULT: '#F4B400',
            dark:    '#C98A00',
            light:   '#FEF6E0',
          },
          accent: {
            DEFAULT: '#1E2A52',
            dark:    '#121A36',
          },
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted:   '#F8FAFC',
          border:  '#E2E8F0',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted:   '#475569',
          subtle:  '#94A3B8',
        },
        sidebar: '#0F172A',
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
      },
      // 44px minimum touch targets
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      keyframes: {
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shake': {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'shake': 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
