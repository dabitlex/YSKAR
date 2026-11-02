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
      /*
        Schriftstufen des YSKAR-Systems (Redesign November 2026). Acht
        Stufen statt der 27 Einzelgroessen von vorher; neue Bildschirme
        nutzen NUR diese. Namen mit "ys-", damit sie nicht mit der Farbe
        "text" kollidieren (text-text ist die Farbe).
      */
      fontSize: {
        'ys-etikett': ['11px', { lineHeight: '1.3', letterSpacing: '0.14em' }],
        'ys-meta': ['12.5px', { lineHeight: '1.4' }],
        'ys-klein': ['14px', { lineHeight: '1.45' }],
        'ys-fliess': ['15px', { lineHeight: '1.5' }],
        'ys-zeile': ['17px', { lineHeight: '1.35' }],
        'ys-abschnitt': ['22px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'ys-seite': ['26px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'ys-anzeige': ['52px', { lineHeight: '1', letterSpacing: '-0.05em' }],
      },
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
