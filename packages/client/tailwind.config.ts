import type { Config } from 'tailwindcss';

/**
 * "Retro Internet Party" design tokens (from the design handoff README).
 * Y2K sticker aesthetic: chunky outlines + hard offset shadows, acid/neon
 * palette on dark grape-ink.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#100619',
        screen: '#15091f',
        panel: '#1a0d2c',
        panel2: '#1d0f30',
        inset: '#120720',
        outline: '#160826',
        hairline: '#2c1a42',
        hairline2: '#34204e',
        hairline3: '#2a1842',
        pink: '#FF3DA5',
        'pink-light': '#FF8FC8',
        cyan: '#29D6FF',
        'cyan-light': '#7FE6FF',
        lime: '#BFFB4B',
        'lime-light': '#D2FB7E',
        gold: '#FFD23F',
        'gold-light': '#FFD27A',
        mint: '#36E5A0',
        'mint-light': '#8FF0C8',
        coral: '#FF5468',
        orange: '#FFB02E',
        paper: '#FFF1FA',
        'text-2': '#D6C6EC',
        'text-3': '#C9B8E8',
        muted: '#B79FD4',
        'muted-2': '#9d86bd',
        'muted-3': '#8a72ab',
        'muted-4': '#7c64a0',
        'muted-5': '#5a3c78',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Noto Color Emoji"', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', '"Noto Color Emoji"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', '"Noto Color Emoji"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sticker: '16px',
        tile: '12px',
        card: '20px',
        pill: '24px',
      },
      boxShadow: {
        'sticker-sm': '3px 3px 0 #160826',
        sticker: '4px 4px 0 #160826',
        'sticker-lg': '5px 5px 0 #160826',
        'sticker-hover': '6px 6px 0 #160826',
        'sticker-press': '1px 1px 0 #160826',
      },
      keyframes: {
        // Entry animations use scale only (never opacity:0) per the handoff.
        'moji-pop': {
          '0%': { transform: 'scale(.965)' },
          '60%': { transform: 'scale(1.012)' },
          '100%': { transform: 'scale(1)' },
        },
        'moji-tilebob': {
          '0%': { transform: 'scale(.6) rotate(-6deg)' },
          '60%': { transform: 'scale(1.12) rotate(2deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        'moji-float': {
          '0%, 100%': { transform: 'translateY(-7px)' },
          '50%': { transform: 'translateY(7px)' },
        },
        'moji-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
        'moji-count': {
          '0%': { transform: 'scale(1.6)', opacity: '0' },
          '40%': { opacity: '1' },
          '100%': { transform: 'scale(.8)', opacity: '0' },
        },
        'moji-confetti': {
          '0%': { transform: 'translateY(-10px) rotate(0deg)' },
          '100%': { transform: 'translateY(760px) rotate(560deg)' },
        },
      },
      animation: {
        'moji-pop': 'moji-pop .38s cubic-bezier(.2,.9,.3,1.2)',
        'moji-tilebob': 'moji-tilebob .32s ease-out',
        'moji-float': 'moji-float 2.6s ease-in-out infinite',
        'moji-pulse': 'moji-pulse 1s infinite',
        'moji-count': 'moji-count .8s ease-out',
        'moji-confetti': 'moji-confetti 2s linear forwards',
      },
    },
  },
  plugins: [],
} satisfies Config;
