import '@/styles/globals.css'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import { Header } from '@/components/header'

export const metadata = {
  title: 'Audiobook Generator',
  description: 'Convert PDF files to audiobooks',
}

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased dark`}>
        <Providers>
          <div className="flex min-h-svh flex-col">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}