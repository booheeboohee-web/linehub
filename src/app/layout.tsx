import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LineHub - マーケティング自動化ツール',
  description: 'LINE マーケティング自動化ツール',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-slate-50" suppressHydrationWarning>{children}</body>
    </html>
  )
}
