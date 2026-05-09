import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Orbitron, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import SessionProviderWrapper from "@/components/providers/SessionProviderWrapper";
import { SocketProvider } from "@/components/live/SocketProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
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
  title: "SS E-Sports Dashboard",
  description: "SS E-Sports Tournament Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        orbitron.variable,
        inter.variable
      )}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0f] text-white`}
      >
        <SessionProviderWrapper>
          <SocketProvider>
            <ToastProvider>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                  <TopBar />
                  <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
                    {children}
                  </main>
                </div>
              </div>
              <MobileTabBar />
            </ToastProvider>
          </SocketProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
