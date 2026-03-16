import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CONB Monitoring',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark">
      <body className={`${jetbrainsMono.variable} bg-surface text-ink`}>
        <ThemeProvider>
          <Sidebar />
          <main className="ml-52 min-h-screen p-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
