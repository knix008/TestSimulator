import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const protectedPaths = [
  "/marketplace/listing/new",
  "/community/post/new",
  "/profile",
]

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const pathname = req.nextUrl.pathname
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtected && !isLoggedIn) {
    const signinUrl = new URL("/signin", req.url)
    signinUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
