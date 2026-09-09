/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy dark scale (kept for the 3D canvas + map tiles)
        dark: {
          900: '#0a0e1a',
          800: '#0f1525',
          700: '#151d35',
          600: '#1c2640',
          500: '#243050',
        },
        // Gov light theme — official-portal feel
        gov: {
          bg:      '#F4F5F7', // page ground (ivory)
          surface: '#FFFFFF', // cards
          border:  '#D9DEE7', // hairlines
          borderd: '#B9C2D2', // stronger borders (inputs, focus)
          ink:     '#16233B', // primary text (near-black slate)
          muted:   '#5B6B85', // secondary text
          faint:   '#8A97AD', // tertiary text
          wash:    '#EDF1F7', // subtle fills (hover, wells)
          navy:    '#1B3A6B', // primary actions, active nav
          navydeep:'#12294F', // hover state
          saffron: '#E8762D', // warnings, key CTAs
          igreen:  '#1E7E46', // success
          red:     '#B42318', // danger (light-safe)
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
      boxShadow: {
        gov: '0 1px 2px rgba(22, 35, 59, 0.06), 0 1px 3px rgba(22, 35, 59, 0.08)',
      },
    },
  },
  plugins: [],
}
