import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
        rgb(var(--x) / <alpha-value>) statt var(--x): Nur so kann Tailwind
        Deckkraft anwenden. Mit fertigen Farbwerten werden Klassen wie
        bg-dim/70 lautlos verworfen -- die Elemente sind dann unsichtbar,
        ohne dass irgendwo ein Fehler auftaucht.
      */
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sunk: 'rgb(var(--sunk) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        lese: 'rgb(var(--lese) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        work: 'rgb(var(--work) / <alpha-value>)',
        proof: 'rgb(var(--proof) / <alpha-value>)',
        risk: 'rgb(var(--risk) / <alpha-value>)',
        cyan: 'rgb(var(--cyan) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
      },
      borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)' },
      // Geist wirkt ab 700 schnell schwer; die Bildschirme nutzen bold/extrabold
      // fuer Hervorhebung, im neuen Design sitzt die bei 600.
      fontWeight: { bold: '600', extrabold: '600', black: '700' },
      fontFamily: {
        sans: ['var(--font-sans)', 'var(--font-sans-vi)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'var(--font-mono-vi)', 'ui-monospace', 'monospace'],
      },
    },
  },
} satisfies Config;
