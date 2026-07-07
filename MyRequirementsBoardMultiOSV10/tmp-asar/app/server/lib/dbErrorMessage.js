export function describeDbError(err) {
  const raw = err.message || String(err);

  if (raw.includes('auth_gssapi_client') || raw.includes('Unknown authentication plugin')) {
    return (
      '이 DB 계정은 GSSAPI(Windows 인증) 방식으로 설정되어 있어 접속할 수 없습니다. '
      + 'MariaDB/MySQL에서 mysql_native_password(또는 caching_sha2_password) 인증 방식을 쓰는 계정을 사용하세요.'
    );
  }
  if (raw.includes('ER_NOT_SUPPORTED_AUTH_MODE')) {
    return '이 DB 계정의 인증 방식을 드라이버가 지원하지 않습니다. mysql_native_password 방식으로 계정을 재설정하세요.';
  }
  if (raw.includes('Access denied')) {
    return '접속이 거부되었습니다. 사용자명/비밀번호 또는 호스트 접속 권한(GRANT)을 확인하세요.';
  }
  if (raw.includes('ECONNREFUSED') || raw.includes("Can't reach database server") || raw.includes('connect ECONNREFUSED')) {
    return 'DB 서버에 연결할 수 없습니다. 호스트/포트가 올바른지, DB 서버가 실행 중인지 확인하세요.';
  }
  if (raw.includes('ETIMEDOUT') || raw.includes('timed out') || raw.includes('timeout')) {
    return 'DB 서버 접속이 시간 초과되었습니다. 호스트/포트, 방화벽 설정을 확인하세요.';
  }
  if (raw.includes('Unknown database') || raw.includes('ER_BAD_DB_ERROR')) {
    return '해당 이름의 데이터베이스가 없습니다. 계정에 CREATE DATABASE 권한이 있는지 확인하세요.';
  }
  if (raw.includes('Login failed for user')) {
    return 'SQL Server 로그인에 실패했습니다. 사용자명/비밀번호와 SQL Server 인증 설정을 확인하세요.';
  }
  if (raw.includes('password authentication failed')) {
    return 'PostgreSQL 인증에 실패했습니다. 사용자명/비밀번호를 확인하세요.';
  }

  return raw.trim() || '알 수 없는 DB 오류입니다.';
}
