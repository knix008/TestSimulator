import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/requirements/:path*",
    "/testcases/:path*",
    "/import/:path*",
    "/export/:path*",
    "/users/:path*",
    "/account/:path*",
    "/settings/:path*",
    "/api/requirements/:path*",
    "/api/testcases/:path*",
    "/api/import/:path*",
    "/api/export/:path*",
    "/api/users/:path*",
    "/api/account/:path*",
    "/api/registration-requests/:path*",
  ],
};
