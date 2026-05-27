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
        brand: {
          DEFAULT: '#22C55E',
          dark:    '#16A34A',
          light:   '#86EFAC',
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
    },
  },
  plugins: [],
}

export default config
