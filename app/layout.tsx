import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Comparinator — Image Region Comparator",
    template: "%s | Comparinator",
  },
  description:
    "Browser-local image region comparator: upload two images, draw bounding boxes, and get hybrid similarity scores with Transformers.js — no server required.",
  keywords: [
    "image comparison",
    "ROI",
    "region of interest",
    "Transformers.js",
    "vision model",
    "embedding similarity",
    "browser ML",
  ],
  authors: [{ name: "Comparinator" }],
  creator: "Comparinator",
  openGraph: {
    title: "Comparinator — Image Region Comparator",
    description:
      "Browser-local image region comparator with vision embeddings and pixel analysis. No server-side inference.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Comparinator — Image Region Comparator",
    description: "Compare image regions in the browser with Transformers.js.",
  },
  robots: "index, follow",
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
