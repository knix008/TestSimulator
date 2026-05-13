import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { SessionProvider } from "@/components/shared/SessionProvider"

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "마켓플레이스 & 커뮤니티",
  description: "다양한 카테고리의 상품, 디지털 콘텐츠, 서비스를 거래하고 커뮤니티와 소통하세요",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-gray-50 antialiased">
        <SessionProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  )
}
