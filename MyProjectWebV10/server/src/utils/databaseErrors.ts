import { isPrismaGenerateLockError } from '../lib/prismaClientFiles.js';

const MARIADB_GSSAPI_HELP =
  'MariaDB 계정에 gssapi 인증이 포함되어 Node.js/Prisma가 연결할 수 없습니다. ' +
  '(PC 호스트명 계정 root@PC이름에 auth_or gssapi가 남아 있을 수 있습니다.) ' +
  'PowerShell에서 server/scripts/fix-mariadb-auth-from-win.ps1 을 실행하세요. ' +
  'Win 프로그램 DB 연결과 동일한 비밀번호를 사용합니다. ' +
  '수동 수정 시 mysql.global_priv의 Priv에 gssapi가 없어야 합니다.';

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
