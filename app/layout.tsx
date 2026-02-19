import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Comparinator ROI",
  description: "Browser-local ROI image comparator with Transformers.js",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
