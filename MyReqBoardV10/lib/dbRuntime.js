import { PrismaClient } from "@prisma/client";

// DB 접속 정보는 .env에 저장하지 않고, 서버 프로세스가 실행 중인 동안에만 메모리에 보관한다.
// 서버를 재시작하면 다시 /connect-db 화면에서 접속을 확인해야 한다.
// (Next.js dev 모드에서는 모듈이 재평가될 수 있어 globalThis에 보관해 HMR 중에도 유지되게 한다.)
const g = globalThis;
g.__dbRuntime__ = g.__dbRuntime__ || { client: null, config: null };
const state = g.__dbRuntime__;

export class DbNotConnectedError extends Error {
  constructor() {
    super("DB에 연결되어 있지 않습니다.");
    this.name = "DbNotConnectedError";
  }
}

export function getPrisma() {
  return state.client;
}

export function isDbConnected() {
  return state.client !== null;
}

export function getDbConfig() {
  return state.config;
}

function buildUrl({ host, port, database, user, password }) {
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password || "")}`;
  return `mysql://${auth}@${host}:${port || 3306}/${database}`;
}

function isUnknownDatabaseError(err) {
  const msg = err.message || "";
  return (
    err.code === "P1003" ||
    msg.includes("does not exist on the database server") ||
    msg.includes("Unknown database")
  );
}

// 데이터베이스 자체가 없으면 같은 계정으로 서버에 접속해 CREATE DATABASE를 실행한다.
async function createDatabaseIfMissing({ host, port, database, user, password }) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("데이터베이스명은 영문/숫자/밑줄(_)만 사용할 수 있습니다.");
  }
  const adminUrl = buildUrl({ host, port, database: "information_schema", user, password });
  const adminClient = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await adminClient.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await adminClient.$disconnect().catch(() => {});
  }
}

export async function connectDb(cfg) {
  const url = buildUrl(cfg);
  let candidate = new PrismaClient({ datasources: { db: { url } } });
  try {
    await candidate.$queryRaw`SELECT 1`;
  } catch (err) {
    await candidate.$disconnect().catch(() => {});
    if (!isUnknownDatabaseError(err)) throw err;

    // 데이터베이스가 없으면 만들고 다시 접속을 시도한다.
    await createDatabaseIfMissing(cfg);
    candidate = new PrismaClient({ datasources: { db: { url } } });
    await candidate.$queryRaw`SELECT 1`;
  }

  if (state.client) {
    await state.client.$disconnect().catch(() => {});
  }
  state.client = candidate;
  state.config = { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user };
  return url;
}

// User 테이블 존재 여부로 스키마(테이블)가 이미 만들어져 있는지 확인한다.
export async function hasSchema() {
  if (!state.client) return false;
  try {
    await state.client.user.count();
    return true;
  } catch {
    return false;
  }
}
