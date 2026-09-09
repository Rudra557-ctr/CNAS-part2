/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0e1a',
          800: '#0f1525',
          700: '#151d35',
          600: '#1c2640',
          500: '#243050',
        },
        accent: {
          red:    '#ef4444',
          blue:   '#3b82f6',
          green:  '#22c55e',
          orange: '#f97316',
          yellow: '#eab308',
          purple: '#a855f7',
          cyan:   '#06b6d4',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
