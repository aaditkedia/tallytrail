import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "TallyTrail · emissions with an evidence trail", description: "Review sourced emissions calculations, preserve bill fingerprints, and inspect a transparent local verification receipt." };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
