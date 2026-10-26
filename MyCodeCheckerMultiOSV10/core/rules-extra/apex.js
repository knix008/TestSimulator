'use strict';

// Salesforce Apex (classes and triggers). Governor-limit bugs (SOQL / DML in
// loops), sharing and CRUD security, SOQL injection and debug leftovers.

const { maker } = require('./util');

const R = maker('apex', ['apex']);

// ── Bugs ─────────────────────────────────────────────────────
R('soql-in-loop', 'B', 'CR', 20, ['governor-limits', 'performance'],
  /\b(?:for|while)\s*\([^)]*\)\s*\{[^}]*\[\s*SELECT\b/i,
  ['SOQL query inside a loop', 'Each iteration runs a query; more than 100 queries hit the governor limit.', 'Query once before the loop and use a Map.'],
  ['루프 안에서 SOQL 질의를 합니다', '반복마다 질의가 돌아 100개를 넘으면 거버너 한도에 걸립니다.', '루프 전에 한 번 질의하고 Map을 쓰세요.'],
  'for (Contact c : contacts) { Account a = [SELECT Id FROM Account WHERE Id = :c.AccountId]; }', 'Map<Id, Account> accounts = new Map<Id, Account>([SELECT Id FROM Account WHERE Id IN :ids]);');
R('dml-in-loop', 'B', 'CR', 20, ['governor-limits', 'performance'],
  /\b(?:for|while)\s*\([^)]*\)\s*\{[^}]*(?:\b(?:insert|update|upsert|delete|undelete|merge)\s+\w+\s*;|\bDatabase\.(?:insert|update|upsert|delete)\s*\()/i,
  ['DML statement inside a loop', 'Each iteration runs a DML statement; more than 150 hit the governor limit.', 'Collect the records in a list and run one DML after the loop.'],
  ['루프 안에서 DML 문을 실행합니다', '반복마다 DML이 돌아 150개를 넘으면 거버너 한도에 걸립니다.', '레코드를 리스트에 모아 루프 뒤에 DML을 한 번 실행하세요.'],
  'for (Account a : accounts) { a.Rating = \'Hot\'; update a; }', 'for (Account a : accounts) { a.Rating = \'Hot\'; } update accounts;');
R('future-in-loop', 'B', 'MA', 15, ['governor-limits', 'async'],
  /\b(?:for|while)\s*\([^)]*\)\s*\{[^}]*\b(?:System\.enqueueJob|Database\.executeBatch)\s*\(/i,
  ['Asynchronous job started inside a loop', 'Enqueuing per record hits the limit of 50 jobs per transaction.', 'Pass the whole collection to one job.'],
  ['루프 안에서 비동기 작업을 시작합니다', '레코드마다 작업을 넣으면 트랜잭션당 50개 한도에 걸립니다.', '컬렉션 전체를 작업 하나에 넘기세요.'],
  'for (Id i : ids) { System.enqueueJob(new SyncJob(i)); }', 'System.enqueueJob(new SyncJob(ids));');
R('future-method-call-loop', 'B', 'MA', 15, ['governor-limits', 'async'],
  /\b(?:for|while)\s*\([^)]*\)\s*\{\s*\w+\.\w*(?:Async|Future)\w*\s*\(/,
  ['@future method called inside a loop', 'Each @future call counts toward the limit of 50 per transaction.', 'Make the future method take a list and call it once.'],
  ['루프 안에서 @future 메서드를 부릅니다', '@future 호출마다 트랜잭션당 50개 한도에 셉니다.', 'future 메서드가 리스트를 받게 하고 한 번만 부르세요.'],
  'for (Id i : ids) { Callout.sendFuture(i); }', 'Callout.sendFuture(ids);');
R('hardcoded-id', 'B', 'MA', 10, ['portability'],
  /'(?=[a-zA-Z0-9]*\d{4})[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?'/,
  ['Hard-coded record Id', 'Record Ids differ between orgs and sandboxes, so the code breaks after deployment.', 'Query by DeveloperName or use custom metadata.'],
  ['레코드 Id를 코드에 적었습니다', '레코드 Id는 조직과 샌드박스마다 달라 배포 뒤 코드가 깨집니다.', 'DeveloperName으로 질의하거나 사용자 정의 메타데이터를 쓰세요.'],
  "Id ownerId = '005000000000001AAA';", "Id ownerId = [SELECT Id FROM User WHERE Username = :name].Id;",
  { code: /=\s*'|\(\s*'|,\s*'/ });
R('trigger-logic', 'S', 'MA', 30, ['design'],
  /^\s*trigger\s+\w+\s+on\s+\w+\s*\([^)]*\)\s*\{\s*\S/i,
  ['Logic written directly in a trigger', 'Trigger bodies cannot be reused or unit-tested well and cause order problems.', 'Delegate to a handler class.'],
  ['트리거에 로직을 바로 씁니다', '트리거 본문은 재사용과 단위 테스트가 어렵고 순서 문제를 일으킵니다.', '처리기 클래스에 맡기세요.'],
  'trigger AccountTrigger on Account (before insert) { for (Account a : Trigger.new) { a.Name = a.Name.trim(); } }', 'trigger AccountTrigger on Account (before insert) {',
  { skip: (raw) => /Handler\s*\(|\.run\s*\(|\.handle\s*\(/.test(raw) });
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/i,
  ['Empty catch block', 'The exception is silently ignored.', 'Log or handle the exception.'],
  ['빈 catch 블록입니다', '예외를 아무 말 없이 무시합니다.', '예외를 기록하거나 처리하세요.'],
  '} catch (DmlException e) {}', '} catch (DmlException e) { Logger.error(e); }', { sonar: 'S108' });
R('catch-exception', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /\bcatch\s*\(\s*Exception\s+\w+\s*\)/i,
  ['Catching the generic Exception', 'A broad catch hides programming errors and limit exceptions.', 'Catch DmlException, QueryException or the type you expect.'],
  ['일반 Exception을 잡습니다', '넓은 catch는 프로그래밍 오류와 한도 예외를 숨깁니다.', 'DmlException, QueryException 등 예상하는 타입을 잡으세요.'],
  '} catch (Exception e) {', '} catch (DmlException e) {');
R('test-without-asserts', 'S', 'MA', 10, ['tests'],
  /@isTest\s+static\s+void\s+\w+\s*\(\s*\)\s*\{[^}]*\}/i,
  ['Test method without assertions', 'A test that asserts nothing only raises coverage.', 'Assert the expected outcome with Assert or System.assertEquals.'],
  ['단언 없는 테스트 메서드입니다', '아무것도 단언하지 않는 테스트는 커버리지만 올립니다.', 'Assert나 System.assertEquals로 기대 결과를 단언하세요.'],
  '@isTest static void createsAccount() { AccountService.create(\'A\'); }', '@isTest static void createsAccount() { AccountService.create(\'A\'); Assert.areEqual(1, [SELECT COUNT() FROM Account]); }',
  { skip: (raw) => /\bAssert\.|System\.assert/i.test(raw) });
R('see-all-data', 'S', 'MA', 10, ['tests'],
  /@isTest\s*\(\s*SeeAllData\s*=\s*true\s*\)/i,
  ['Test reads all org data', 'SeeAllData=true makes tests depend on data that differs between orgs.', 'Create test data in the test or a @TestSetup method.'],
  ['테스트가 조직 데이터 전체를 읽습니다', 'SeeAllData=true는 조직마다 다른 데이터에 테스트를 기대게 합니다.', '테스트나 @TestSetup 메서드에서 테스트 데이터를 만드세요.'],
  '@isTest(SeeAllData=true)', '@isTest');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('soql-injection', 'V', 'BL', 30, ['sql', 'cwe-89', 'owasp-a03'],
  /\bDatabase\.(?:query|countQuery|getQueryLocator)\s*\([^)]*['"]\s*\+\s*(?!String\.escapeSingleQuotes)\w/i,
  ['SOQL built by concatenation', 'Concatenated values can change the dynamic query.', 'Use bind variables (:var) or Database.queryWithBinds; escape with String.escapeSingleQuotes as a last resort.'],
  ['문자열을 이어 SOQL을 만듭니다', '이어 붙인 값이 동적 질의를 바꿀 수 있습니다.', '바인드 변수(:var)나 Database.queryWithBinds를 쓰고 최후 수단으로 String.escapeSingleQuotes를 쓰세요.'],
  "List<Account> rows = Database.query('SELECT Id FROM Account WHERE Name = \\'' + name + '\\'');", "List<Account> rows = Database.queryWithBinds('SELECT Id FROM Account WHERE Name = :name', binds, AccessLevel.USER_MODE);", { sonar: 'S2077' });
R('without-sharing', 'V', 'CR', 15, ['cwe-284', 'owasp-a01', 'sharing'],
  /\bwithout\s+sharing\b/i,
  ['Class runs without sharing', 'The code ignores record-level sharing and can expose records the user may not see.', 'Use with sharing or inherited sharing; isolate system-mode work.'],
  ['클래스가 공유 규칙 없이 실행됩니다', '코드가 레코드 수준 공유를 무시해 사용자가 보면 안 되는 레코드를 드러낼 수 있습니다.', 'with sharing이나 inherited sharing을 쓰고 시스템 모드 작업은 따로 떼세요.'],
  'public without sharing class AccountService {', 'public with sharing class AccountService {');
R('missing-sharing', 'H', 'MA', 10, ['cwe-284', 'owasp-a01', 'sharing'],
  /^\s*(?:global|public)\s+(?:virtual\s+|abstract\s+)?class\s+\w+/i,
  ['Class without a sharing declaration', 'A class with no sharing keyword runs in the sharing mode of its caller, often system mode.', 'Declare with sharing, without sharing or inherited sharing explicitly.'],
  ['공유 선언 없는 클래스입니다', '공유 키워드가 없는 클래스는 호출자의 공유 모드, 흔히 시스템 모드로 실행됩니다.', 'with sharing, without sharing, inherited sharing 중 하나를 명시하세요.'],
  'public class AccountService {', 'public inherited sharing class AccountService {',
  { skip: (raw) => /\bsharing\b|\bclass\s+\w+\s+extends\s+Exception\b|@isTest/i.test(raw) });
R('crud-unchecked-soql', 'H', 'MA', 10, ['cwe-862', 'owasp-a01', 'crud'],
  /\[\s*SELECT\b(?![^\]]*\bWITH\s+(?:SECURITY_ENFORCED|USER_MODE)\b)[^\]]*\bFROM\b[^\]]*\]/i,
  ['SOQL without field-level security enforcement', 'Apex runs in system mode and returns fields the user is not allowed to read.', 'Add WITH USER_MODE (or WITH SECURITY_ENFORCED), or strip with Security.stripInaccessible.'],
  ['필드 수준 보안을 강제하지 않는 SOQL입니다', 'Apex는 시스템 모드로 돌아 사용자가 읽으면 안 되는 필드까지 돌려줍니다.', 'WITH USER_MODE(또는 WITH SECURITY_ENFORCED)를 넣거나 Security.stripInaccessible로 거르세요.'],
  'List<Contact> cs = [SELECT Id, Email FROM Contact WHERE AccountId = :id];', 'List<Contact> cs = [SELECT Id, Email FROM Contact WHERE AccountId = :id WITH USER_MODE];');
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*=\s*'[^'\s]{4,}'/i,
  ['Hard-coded credential', 'Anyone who can view the class can read the secret.', 'Use Named Credentials or protected custom metadata.'],
  ['자격 증명을 코드에 적었습니다', '클래스를 볼 수 있는 누구나 비밀을 읽을 수 있습니다.', 'Named Credential이나 보호된 사용자 정의 메타데이터를 쓰세요.'],
  "String apiKey = 'sk_live_abc123';", "req.setEndpoint('callout:Payments/charges');", { sonar: 'S2068' });
R('http-endpoint', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /'http:\/\/(?!localhost)[\w.-]+/i,
  ['Clear-text HTTP endpoint', 'Callouts over http:// can be read and changed on the network.', 'Use https:// through a Named Credential.'],
  ['평문 HTTP 엔드포인트입니다', 'http:// 콜아웃은 네트워크에서 읽고 바꿀 수 있습니다.', 'Named Credential을 통해 https://를 쓰세요.'],
  "req.setEndpoint('http://api.example.com/v1');", "req.setEndpoint('callout:Example/v1');", { sonar: 'S5332' });
R('weak-crypto', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /\bCrypto\.generateDigest\s*\(\s*'(?:MD5|SHA1)'/i,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use SHA-256 or SHA-512.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'SHA-256이나 SHA-512를 쓰세요.'],
  "Blob h = Crypto.generateDigest('MD5', Blob.valueOf(s));", "Blob h = Crypto.generateDigest('SHA-256', Blob.valueOf(s));", { sonar: 'S4790' });
R('open-redirect', 'V', 'MA', 15, ['cwe-601', 'owasp-a01'],
  /\bnew\s+PageReference\s*\(\s*(?:ApexPages\.currentPage\(\)\.getParameters\(\)\.get|\w+Param|url)\b/i,
  ['Redirect to a URL taken from the request', 'A URL from a parameter can send users to a phishing site.', 'Redirect only to known pages or validate the target.'],
  ['요청에서 받은 URL로 리디렉트합니다', '매개변수에서 온 URL은 사용자를 피싱 사이트로 보낼 수 있습니다.', '알려진 페이지로만 리디렉트하거나 대상을 검증하세요.'],
  "return new PageReference(ApexPages.currentPage().getParameters().get('retURL'));", 'return Page.AccountDetail;');
R('cookie-not-secure', 'H', 'MI', 5, ['cwe-614', 'owasp-a05'],
  /\bnew\s+Cookie\s*\((?:[^,()]*,){4}\s*false\s*\)/i,
  ['Cookie without the secure flag', 'The cookie can travel over plain HTTP and be read on the network.', 'Pass true for isSecure.'],
  ['secure 플래그 없는 쿠키입니다', '쿠키가 평문 HTTP로 오가며 네트워크에서 읽힐 수 있습니다.', 'isSecure에 true를 넘기세요.'],
  "Cookie c = new Cookie('session', v, null, -1, false);", "Cookie c = new Cookie('session', v, null, -1, true);");

// ── Code smells ──────────────────────────────────────────────
R('system-debug', 'S', 'MI', 2, ['debug'],
  /\bSystem\.debug\s*\(/i,
  ['System.debug left in the code', 'Debug statements cost CPU time even when logs are off and may leak data.', 'Remove them or use a logging framework with levels.'],
  ['System.debug가 남아 있습니다', 'debug 문은 로그를 꺼도 CPU 시간을 쓰고 데이터를 흘릴 수 있습니다.', '지우거나 수준이 있는 로깅 프레임워크를 쓰세요.'],
  "System.debug('acc=' + acc);", 'Logger.debug(acc.Id);', { sonar: 'S106' });
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '// TODO: bulkify', '// Bulkified in AccountService.', { scope: 'any', sonar: 'S1135' });
R('global-modifier', 'S', 'MI', 5, ['design'],
  /^\s*global\s+(?:with\s+sharing\s+|without\s+sharing\s+|inherited\s+sharing\s+)?class\b/i,
  ['global class', 'global exposes the class outside the package forever; it can never be removed.', 'Use public unless the class is a managed-package API.'],
  ['global 클래스입니다', 'global은 클래스를 패키지 밖에 영구히 노출해 다시 지울 수 없습니다.', '관리 패키지 API가 아니면 public을 쓰세요.'],
  'global with sharing class Util {', 'public with sharing class Util {');

module.exports = { RULES: R.rules };
