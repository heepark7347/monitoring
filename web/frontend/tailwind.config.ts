import type { Config } from 'tailwindcss'

const cv = (v: string) => `rgb(var(${v}) / <alpha-value>)`

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: cv('--c-bg'),
          card:    cv('--c-card'),
          border:  cv('--c-border'),
        },
        accent: {
          DEFAULT: cv('--c-accent'),
          glow:    cv('--c-accent-glow'),
        },
        ink: {
          DEFAULT: cv('--c-text'),
          muted:   cv('--c-muted'),
          faint:   cv('--c-faint'),
        },
      },
    },
  },
  plugins: [],
}

export default config
