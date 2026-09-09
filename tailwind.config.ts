import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#151313',
        brick: '#B3492F',
        'brick-dark': '#8A3620',
        gold: '#C9A24B',
        cream: '#F6F3EE',
        slate: '#3D4A4A',
      },
      fontFamily: {
        heading: ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
