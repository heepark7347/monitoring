import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'CONB Monitoring',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-surface text-slate-100">
        <Sidebar />
        <main className="ml-52 min-h-screen p-6">{children}</main>
      </body>
    </html>
  )
}
