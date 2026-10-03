import type { Config } from 'tailwindcss';

/**
 * Civic palette sampled from the Indian flag.
 * `saffron` and `indiaGreen` are decorative only: on white they do not reach
 * WCAG AA for body text, so the `-600`/`-700`/`-800` shades are used for text.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        saffron: {
          50: '#FFF8ED',
          100: '#FFEBCF',
          200: '#FFD79F',
          300: '#FFC066',
          400: '#FFA93D',
          500: '#FF9933',
          600: '#C2620A',
          700: '#9A4E07',
          800: '#7C3F09',
          900: '#68340B'
        },
        green: {
          50: '#F1F8EE',
          100: '#DCF0D3',
          200: '#BBE1AB',
          300: '#8FC87A',
          400: '#4FA63C',
          500: '#138808',
          600: '#127006',
          700: '#0F5A05',
          800: '#0D4804',
          900: '#0A3703'
        },
        navy: {
          50: '#F2F4FB',
          100: '#E1E5F4',
          200: '#C4CBE9',
          300: '#98A4D6',
          400: '#6578BB',
          500: '#2C3F8F',
          600: '#1D2E77',
          700: '#141F52',
          800: '#0C1338',
          900: '#000080'
        },
        ink: {
          DEFAULT: '#111827',
          muted: '#4B5563'
        },
        cream: {
          DEFAULT: '#FDFBF6',
          dark: '#F6F1E6',
          border: '#E9E1D1'
        },
        paleblue: {
          DEFAULT: '#EAF1FB',
          border: '#C9D8F0'
        },
        gold: {
          50: '#FBF6E7',
          100: '#F5EAC6',
          500: '#C99A2B',
          600: '#9A7611',
          700: '#7A5D0D'
        }
      },
      fontFamily: {
        sans: ['var(--font-latin)', 'var(--font-deva)', 'var(--font-tamil)', 'var(--font-bengali)', 'var(--font-telugu)', 'system-ui', 'sans-serif']
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }]
      },
      minHeight: {
        touch: '2.75rem'
      },
      minWidth: {
        touch: '2.75rem'
      },
      maxWidth: {
        prose: '65ch'
      }
    }
  },
  plugins: []
};

export default config;