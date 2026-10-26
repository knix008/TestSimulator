'use strict';

// z/OS JCL. Credentials in job streams, unlimited resources, clear-text
// transfer, dangerous data set dispositions and hard-coded devices.

const { maker } = require('./util');

const R = maker('jcl', ['jcl']);

R('password-parameter', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /[,\s(]PASSWORD=\(?[^,\s)]{2,}/i,
  ['PASSWORD= in the job stream', 'The password is stored in the JCL and printed in job output.', 'Use surrogate job submission (SURROGAT) or a PassTicket instead.'],
  ['작업 흐름에 PASSWORD=를 씁니다', '비밀번호가 JCL에 저장되고 작업 출력에 찍힙니다.', '대리 제출(SURROGAT)이나 PassTicket을 쓰세요.'],
  '//PAYJOB   JOB (ACCT),\'PAYROLL\',USER=PAYUSR,PASSWORD=SECRET1', '//PAYJOB   JOB (ACCT),\'PAYROLL\',USER=PAYUSR', { sonar: 'S2068' });
R('password-in-parm', 'V', 'CR', 30, ['cwe-798', 'secrets'],
  /\bPARM=.*\b(?:PASS(?:WORD)?|PWD)\s*[=:]\s*[^,\s')]{3,}/i,
  ['Password passed in PARM', 'PARM values appear in job logs and SMF records.', 'Read the secret from a protected data set or a key store.'],
  ['PARM으로 비밀번호를 넘깁니다', 'PARM 값은 작업 로그와 SMF 기록에 나타납니다.', '보호된 데이터 세트나 키 저장소에서 비밀을 읽으세요.'],
  "//STEP1    EXEC PGM=DBLOAD,PARM='USER=APP,PWD=TIGER12'", "//STEP1    EXEC PGM=DBLOAD,PARM='USER=APP'");
R('ftp-cleartext', 'H', 'MA', 15, ['tls', 'cwe-319'],
  /\bEXEC\s+PGM=FTP\b/i,
  ['Clear-text FTP step', 'FTP sends the user id, password and data unencrypted.', 'Use FTPS (SECURE_FTP REQUIRED) or SFTP.'],
  ['평문 FTP 단계입니다', 'FTP는 사용자 ID, 비밀번호, 데이터를 암호화하지 않고 보냅니다.', 'FTPS(SECURE_FTP REQUIRED)나 SFTP를 쓰세요.'],
  "//XFER     EXEC PGM=FTP,PARM='ftp.example.com (EXIT'", '//XFER     EXEC PGM=BPXBATCH', { sonar: 'S5332' });
R('region-unlimited', 'S', 'MA', 10, ['resources'],
  /\bREGION=0[MK]?\b/i,
  ['REGION=0M', 'An unlimited region lets a looping step take all private storage and hurt other work.', 'Request the storage the step needs, such as REGION=256M.'],
  ['REGION=0M을 씁니다', '무제한 영역은 반복하는 단계가 전용 저장소를 다 써서 다른 작업을 해치게 합니다.', 'REGION=256M처럼 단계에 필요한 만큼만 요청하세요.'],
  '//STEP1    EXEC PGM=SORT,REGION=0M', '//STEP1    EXEC PGM=SORT,REGION=256M');
R('time-unlimited', 'S', 'MA', 10, ['resources'],
  /\bTIME=(?:1440|NOLIMIT|MAXIMUM)\b/i,
  ['Unlimited CPU time', 'TIME=1440 / NOLIMIT disables the CPU time limit, so a loop never ends.', 'Set a realistic TIME= limit.'],
  ['CPU 시간 제한이 없습니다', 'TIME=1440 / NOLIMIT은 CPU 시간 제한을 꺼 루프가 끝나지 않습니다.', '현실적인 TIME= 제한을 두세요.'],
  '//STEP2    EXEC PGM=BIGCALC,TIME=1440', '//STEP2    EXEC PGM=BIGCALC,TIME=(5,0)');
R('disp-old', 'H', 'MI', 5, ['concurrency'],
  /\bDISP=\(?OLD\b/i,
  ['DISP=OLD on a data set', 'DISP=OLD takes an exclusive enqueue, so other jobs and users wait for the whole step.', 'Use DISP=SHR for reading; keep OLD only where exclusive update is required.'],
  ['데이터 세트에 DISP=OLD를 씁니다', 'DISP=OLD는 배타적 큐를 잡아 다른 작업과 사용자가 단계 내내 기다립니다.', '읽기에는 DISP=SHR를 쓰고 배타적 갱신이 꼭 필요할 때만 OLD를 쓰세요.'],
  '//INPUT    DD DSN=PROD.MASTER.FILE,DISP=OLD', '//INPUT    DD DSN=PROD.MASTER.FILE,DISP=SHR');
R('system-dataset-update', 'V', 'CR', 30, ['cwe-732', 'privileges'],
  /\bDSN=SYS1\.[\w.]+(?:\([\w#@$]+\))?\s*,\s*DISP=\(?(?:OLD|MOD|NEW)\b/i,
  ['Job updates a SYS1 system data set', 'Writing to SYS1 libraries changes the operating system for every user.', 'Make system changes through change control with SMP/E, not application jobs.'],
  ['작업이 SYS1 시스템 데이터 세트를 갱신합니다', 'SYS1 라이브러리에 쓰면 모든 사용자의 운영체제가 바뀝니다.', '시스템 변경은 애플리케이션 작업이 아니라 SMP/E와 변경 관리로 하세요.'],
  '//OUT      DD DSN=SYS1.PARMLIB,DISP=OLD', '//IN       DD DSN=SYS1.PARMLIB,DISP=SHR');
R('cond-parameter', 'S', 'MI', 5, ['readability'],
  /^\/\/\S*\s+EXEC\s+.*\bCOND=/i,
  ['COND= on an EXEC statement', 'COND logic is inverted (it says when to skip) and is easy to get wrong.', 'Use IF / THEN / ELSE / ENDIF.'],
  ['EXEC 문에 COND=를 씁니다', 'COND 논리는 거꾸로(건너뛸 때를 말함)라 틀리기 쉽습니다.', 'IF / THEN / ELSE / ENDIF를 쓰세요.'],
  '//STEP3    EXEC PGM=REPORT,COND=(4,LT)', '//         IF (STEP2.RC <= 4) THEN');
R('hardcoded-unit-address', 'S', 'MI', 5, ['portability'],
  /\bUNIT=\/?[0-9A-F]{3,4}\b(?!-)/i,
  ['Hard-coded device address', 'A fixed device number breaks when the hardware changes.', 'Use an esoteric or generic unit name such as SYSDA.'],
  ['장치 주소를 코드에 적었습니다', '고정 장치 번호는 하드웨어가 바뀌면 깨집니다.', 'SYSDA 같은 일반 장치 이름을 쓰세요.'],
  '//TAPE     DD UNIT=0A80,DSN=BACKUP.TAPE,DISP=SHR', ['//TAPE     DD UNIT=TAPE,DSN=BACKUP.TAPE,DISP=SHR', '//WORK     DD UNIT=3390,SPACE=(CYL,(5,5))'],
  // Generic device types (3390, 3490 ...) are not addresses.
  { skip: (raw) => /UNIT=(?:SYSDA|SYSALLDA|TAPE|VIO|CART|33[89]0|3[45]90|3480|3592)\b/i.test(raw) });
R('hardcoded-volser', 'S', 'MI', 5, ['portability'],
  /\bVOL(?:UME)?=(?:\(?PRIVATE,)?SER=\(?\w+/i,
  ['Hard-coded volume serial', 'Pinning a data set to a volume bypasses SMS and breaks when volumes move.', 'Let SMS place the data set with STORCLAS / DATACLAS.'],
  ['볼륨 일련번호를 코드에 적었습니다', '데이터 세트를 볼륨에 고정하면 SMS를 우회하고 볼륨이 옮겨지면 깨집니다.', 'STORCLAS / DATACLAS로 SMS가 배치하게 두세요.'],
  '//NEW      DD DSN=APP.DATA,DISP=(NEW,CATLG),VOL=SER=PRD001', '//NEW      DD DSN=APP.DATA,DISP=(NEW,CATLG),STORCLAS=STANDARD');
R('restart-left', 'S', 'MA', 5, ['suspicious'],
  /^\/\/\S+\s+JOB\b.*\bRESTART=/i,
  ['RESTART= left on the JOB card', 'A leftover RESTART skips the first steps on the next normal run.', 'Remove RESTART= after the rerun.'],
  ['JOB 카드에 RESTART=가 남아 있습니다', '남은 RESTART는 다음 정상 실행에서 앞 단계를 건너뜁니다.', '재실행 뒤에는 RESTART=를 지우세요.'],
  "//NIGHTLY  JOB (ACCT),'BATCH',CLASS=A,RESTART=STEP05", "//NIGHTLY  JOB (ACCT),'BATCH',CLASS=A");
R('addrspc-real', 'S', 'MA', 10, ['resources'],
  /\bADDRSPC=REAL\b/i,
  ['ADDRSPC=REAL', 'The step fixes real storage pages and can starve the system.', 'Leave ADDRSPC=VIRT (the default).'],
  ['ADDRSPC=REAL을 씁니다', '단계가 실제 저장소 페이지를 고정해 시스템을 굶길 수 있습니다.', '기본값인 ADDRSPC=VIRT를 두세요.'],
  '//STEP1    EXEC PGM=FASTIO,ADDRSPC=REAL', '//STEP1    EXEC PGM=FASTIO');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '//* TODO: move to the new scheduler', '//* Scheduled by TWS application PAYROLL.', { scope: 'any', sonar: 'S1135' });

module.exports = { RULES: R.rules };
