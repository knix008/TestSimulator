"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { useState } from "react"
import {
  ShoppingBag,
  Users,
  LogIn,
  LogOut,
  User,
  Plus,
  Menu,
  X,
  Home,
} from "lucide-react"

export function Navbar() {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600">
            <ShoppingBag className="w-6 h-6" />
            <span>마켓플레이스</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="flex items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors">
              <Home className="w-4 h-4" />
              홈
            </Link>
            <Link href="/marketplace" className="flex items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors">
              <ShoppingBag className="w-4 h-4" />
              마켓플레이스
            </Link>
            <Link href="/community" className="flex items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors">
              <Users className="w-4 h-4" />
              커뮤니티
            </Link>
          </nav>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <>
                <Link
                  href="/marketplace/listing/new"
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  등록하기
                </Link>
                <Link
                  href={`/profile/${session.user?.id}`}
                  className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 transition-colors"
                >
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? ""}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-indigo-600" />
                    </div>
                  )}
                  <span className="text-sm font-medium">{session.user?.name}</span>
                </Link>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  회원가입
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-600"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 space-y-3">
          <Link href="/" className="flex items-center gap-2 text-gray-700 hover:text-indigo-600" onClick={() => setMenuOpen(false)}>
            <Home className="w-4 h-4" /> 홈
          </Link>
          <Link href="/marketplace" className="flex items-center gap-2 text-gray-700 hover:text-indigo-600" onClick={() => setMenuOpen(false)}>
            <ShoppingBag className="w-4 h-4" /> 마켓플레이스
          </Link>
          <Link href="/community" className="flex items-center gap-2 text-gray-700 hover:text-indigo-600" onClick={() => setMenuOpen(false)}>
            <Users className="w-4 h-4" /> 커뮤니티
          </Link>
          <div className="border-t border-gray-100 pt-3">
            {session ? (
              <div className="space-y-3">
                <Link href="/marketplace/listing/new" className="flex items-center gap-2 text-indigo-600" onClick={() => setMenuOpen(false)}>
                  <Plus className="w-4 h-4" /> 등록하기
                </Link>
                <Link href={`/profile/${session.user?.id}`} className="flex items-center gap-2 text-gray-700" onClick={() => setMenuOpen(false)}>
                  <User className="w-4 h-4" /> {session.user?.name}
                </Link>
                <button onClick={() => { signOut(); setMenuOpen(false) }} className="flex items-center gap-2 text-red-500">
                  <LogOut className="w-4 h-4" /> 로그아웃
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Link href="/signin" className="block text-center py-2 border border-indigo-600 text-indigo-600 rounded-lg" onClick={() => setMenuOpen(false)}>
                  로그인
                </Link>
                <Link href="/signup" className="block text-center py-2 bg-indigo-600 text-white rounded-lg" onClick={() => setMenuOpen(false)}>
                  회원가입
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
