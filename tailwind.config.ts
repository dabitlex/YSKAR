import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080B14',
        line: '#1B2334',
        fg: '#E9EDF5',
        muted: '#77839A',
        accent: '#3B82F6',
        warn: '#E0A030',
      },
    },
  },
} satisfies Config;
