import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "../../Fonts/Inter/InterV.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const palmore = localFont({
  src: [
    { path: "../../Fonts/Palmore-Font/Palmore Light.otf", weight: "300", style: "normal" },
    { path: "../../Fonts/Palmore-Font/Palmore.otf", weight: "400", style: "normal" },
    { path: "../../Fonts/Palmore-Font/Palmore Semibold.otf", weight: "600", style: "normal" },
    { path: "../../Fonts/Palmore-Font/Palmore Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-palmore",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Woodforest Jayagiri 48 Admin",
  description: "Admin dashboard booking penginapan camping",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${palmore.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
