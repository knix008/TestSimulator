import { getPrisma, DbNotConnectedError } from "./dbRuntime";

// 기존 코드들이 `import prisma from "./prisma"` 후 prisma.requirement.findMany(...) 형태로 쓰던 것을
// 그대로 유지하면서, 실제로는 메모리에 보관된 현재 연결을 통해 위임한다.
// DB가 아직 연결되지 않은 상태에서 사용하면 DbNotConnectedError를 던진다.
const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getPrisma();
      if (!client) throw new DbNotConnectedError();
      return client[prop];
    },
  }
);

export default prisma;
