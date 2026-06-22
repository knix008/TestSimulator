// Prisma/MySQL 접속 에러를 사용자가 이해할 수 있는 한국어 메시지로 변환한다.
export function describeDbError(err) {
  const raw = err.message || String(err);

  if (raw.includes("auth_gssapi_client") || raw.includes("Unknown authentication plugin")) {
    return (
      "이 DB 계정은 GSSAPI(Windows 인증) 방식으로 설정되어 있어 접속할 수 없습니다. " +
      "MariaDB/MySQL에서 mysql_native_password(또는 caching_sha2_password) 인증 방식을 쓰는 계정을 새로 만들어 사용하세요. " +
      "예) CREATE USER 'myreqboard'@'%' IDENTIFIED WITH mysql_native_password BY '비밀번호';"
    );
  }
  if (raw.includes("ER_NOT_SUPPORTED_AUTH_MODE")) {
    return (
      "이 DB 계정의 인증 방식을 드라이버가 지원하지 않습니다. " +
      "mysql_native_password 방식으로 계정을 다시 만들거나 비밀번호를 재설정하세요. " +
      "예) ALTER USER '계정'@'%' IDENTIFIED WITH mysql_native_password BY '비밀번호';"
    );
  }
  if (raw.includes("Access denied")) {
    return "접속이 거부되었습니다 (Access denied). 사용자명/비밀번호 또는 해당 호스트에서의 접속 권한(GRANT)을 확인하세요.";
  }
  if (raw.includes("ECONNREFUSED") || raw.includes("Can't reach database server")) {
    return "DB 서버에 연결할 수 없습니다 (ECONNREFUSED). 호스트/포트가 올바른지, DB 서버가 켜져 있는지 확인하세요.";
  }
  if (raw.includes("ETIMEDOUT") || raw.includes("timed out") || raw.includes("timeout")) {
    return "DB 서버 접속이 시간 초과되었습니다. 호스트/포트, 방화벽 설정을 확인하세요.";
  }
  if (raw.includes("Unknown database") || raw.includes("ER_BAD_DB_ERROR")) {
    return "해당 이름의 데이터베이스가 없습니다. DB 서버에 먼저 데이터베이스를 만들어 두세요 (예: CREATE DATABASE 데이터베이스명;).";
  }
  if (raw.includes("does not exist on the database server") || raw.includes("CREATE DATABASE")) {
    return "데이터베이스가 없어서 자동으로 만들려고 했지만 실패했습니다. 입력한 계정에 CREATE DATABASE 권한이 있는지 확인하세요.";
  }

  // Prisma 에러는 보통 "Invalid `prisma.xxx()` invocation:" 같은 의미 없는 첫 줄 뒤에
  // 실제 원인이 들어있다. "Error querying the database:" 뒤쪽을 우선 찾아서 보여준다.
  const dbErrorMarker = "Error querying the database:";
  if (raw.includes(dbErrorMarker)) {
    const after = raw.split(dbErrorMarker)[1];
    const firstLine = after.split("\n").find((line) => line.trim());
    if (firstLine) return firstLine.trim();
  }

  const meaningfulLines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Invalid `") && !l.startsWith("In ") && l !== "DB 접속");

  if (meaningfulLines.length > 0) {
    return meaningfulLines[meaningfulLines.length - 1];
  }

  return raw.trim() || "알 수 없는 오류입니다.";
}
