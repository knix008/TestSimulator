import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { isDbConnected } from "./dbRuntime";

export const authOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // DB가 아직 연결되지 않았다면 admin/admin 부트스트랩 로그인만 허용한다.
        // 이 계정으로 로그인해 /settings에서 DB를 연결하고 테이블을 생성할 수 있다.
        // DB가 연결되면 더 이상 이 경로는 사용되지 않고 실제 User 테이블로 인증한다.
        if (!isDbConnected()) {
          if (credentials.username === "admin" && credentials.password === "admin") {
            return { id: "bootstrap", name: "관리자(DB 설정 전)", username: "admin", role: "ADMIN" };
          }
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: String(user.id), name: user.name, username: user.username, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.role = token.role;
      return session;
    },
  },
};

// 역할 우선순위: ADMIN > EDITOR > VIEWER
const ROLE_RANK = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export function hasRole(userRole, minRole) {
  if (!userRole) return false;
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}
