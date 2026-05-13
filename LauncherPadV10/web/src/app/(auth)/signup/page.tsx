"use client"

import { useState } from "react"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ShoppingBag, User, Mail, Lock, Globe } from "lucide-react"

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || "회원가입에 실패했습니다")
      setLoading(false)
      return
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    setLoading(false)
    if (result?.error) {
      setError("자동 로그인에 실패했습니다. 로그인 페이지로 이동합니다.")
      setTimeout(() => router.push("/signin"), 1500)
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-indigo-600 font-bold text-xl mb-4">
            <ShoppingBag className="w-6 h-6" />
            마켓플레이스
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">회원가입</h1>
          <p className="text-gray-500 mt-1 text-sm">새 계정을 만들어보세요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
          {/* Social Login */}
          <div className="space-y-3">
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Globe className="w-4 h-4 text-blue-500" />
              Google로 시작하기
            </button>
            <button
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Globe className="w-4 h-4 text-gray-700" />
              GitHub로 시작하기
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">
              또는 이메일로 가입
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  minLength={2}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8자 이상"
                  required
                  minLength={8}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400">
            가입하면 서비스 이용약관에 동의하는 것으로 간주됩니다
          </p>

          <p className="text-center text-sm text-gray-500">
            이미 계정이 있으신가요?{" "}
            <Link href="/signin" className="text-indigo-600 font-medium hover:underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
