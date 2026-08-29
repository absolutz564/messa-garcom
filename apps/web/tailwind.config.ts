import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Cor primária do tenant injetada via CSS var (branding por restaurante, RF-14). */
        brand: 'rgb(var(--brand) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
