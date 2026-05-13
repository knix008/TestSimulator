import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const protectedPaths = [
  "/marketplace/listing/new",
  "/community/post/new",
  "/profile",
]

export default auth((req: NextRequest & { auth: unknown }) => {
  const isLoggedIn = !!(req as { auth?: unknown }).auth
  const pathname = req.nextUrl.pathname

  const isProtected = protectedPaths.some((path) => pathname.startsWith(path))

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
