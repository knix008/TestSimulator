const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (existing) {
    console.log("admin 계정이 이미 존재합니다.");
    return;
  }

  const passwordHash = await bcrypt.hash("admin", 10);
  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash,
      name: "관리자",
      role: "ADMIN",
    },
  });

  console.log("초기 admin 계정 생성 완료 (username: admin / password: admin)");
  console.log("로그인 후 반드시 비밀번호를 변경하세요.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
