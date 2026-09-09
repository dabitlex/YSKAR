import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        line: 'var(--line)',
        text: 'var(--text)',
        dim: 'var(--dim)',
        work: 'var(--work)',
        proof: 'var(--proof)',
        risk: 'var(--risk)',
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
} satisfies Config;
