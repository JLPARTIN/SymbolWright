import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'CodeMind Operator Console',
  description: 'Standalone CodeMind browser workspace and CodeMode console.',
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
