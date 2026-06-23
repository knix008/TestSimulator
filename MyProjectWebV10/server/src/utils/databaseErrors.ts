import { isPrismaGenerateLockError } from '../lib/prismaClientFiles.js';

const MARIADB_GSSAPI_HELP =
  'MariaDB 사용자 인증 방식이 auth_gssapi_client로 설정되어 있어 Node.js/Prisma가 연결할 수 없습니다. ' +
  'MariaDB 클라이언트(HeidiSQL 또는 "C:\\Program Files\\MariaDB 12.3\\bin\\mariadb.exe")로 접속한 뒤 ' +
  'server/scripts/fix-mariadb-auth.sql 을 실행하세요. ' +
  'Win 프로그램 DB 연결에 사용하는 비밀번호와 동일하게 설정하세요.';

export function formatDatabaseConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('auth_gssapi_client')) {
    return MARIADB_GSSAPI_HELP;
  }
  if (message.includes('ER_ACCESS_DENIED_ERROR') || message.includes('Access denied')) {
    return `DB 접속이 거부되었습니다. 사용자/비밀번호를 확인하세요. (${message})`;
  }
  if (isPrismaGenerateLockError(error)) {
    return (
      'Prisma 클라이언트 파일이 사용 중입니다. npm run dev를 한 번 종료(Ctrl+C)한 뒤 ' +
      'npm run db:generate 를 실행하고 다시 npm run dev 로 시작하세요. ' +
      '이미 서버가 connected 상태이면 저장은 완료된 것일 수 있으니 새로고침해 보세요.'
    );
  }
  return message;
}
