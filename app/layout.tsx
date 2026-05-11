import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Orbitron, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import SessionProviderWrapper from "@/components/providers/SessionProviderWrapper";
import { ToastProvider } from "@/components/shared/ToastNotification";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "SS E-Sports",
  description: "SS E-Sports Tournament System",
  icons: {
    icon: "https://i.postimg.cc/90mPCKFd/logo.jpg",
    shortcut: "https://i.postimg.cc/90mPCKFd/logo.jpg",
    apple: "https://i.postimg.cc/90mPCKFd/logo.jpg",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", orbitron.variable, inter.variable)}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#050508] text-white`}
      >
        <SessionProviderWrapper>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
