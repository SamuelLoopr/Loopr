import type { Metadata } from 'next'
import './globals.css'
import ColorBends from './components/ColorBends'

export const metadata: Metadata = {
  title: 'Loopr — AI-receptionist & Recensionsautomation',
  description: 'Plattform för AI-receptionister och recensionsautomation för lokala servicebolag i Sverige.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      {/* No inline style here — see the `body` rule in globals.css. */}
      <body>
        {/* Animated background — fixed, behind everything */}
        <ColorBends
          color="#A855F7"
          speed={0.2}
          frequency={1.0}
          noise={0.15}
          bandWidth={0.14}
          rotation={90}
          fadeTop={0.75}
          iterations={1}
          intensity={1.3}
        />

        {/* All page content sits above the background */}
        <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
