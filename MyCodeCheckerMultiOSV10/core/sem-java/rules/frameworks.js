'use strict';

// Framework rules: Spring, Jakarta/Servlet, JPA/Hibernate, JUnit 4/5,
// TestNG, AssertJ and Mockito (SonarJava / sonar-kotlin scope).

const { rule, jm, jc, km, kc } = require('./core');
const A = require('../ast');
const H = require('./h');

const JK = ['java', 'kt'];

// ── helpers ──
const STEREOTYPES = ['Component', 'Service', 'Repository', 'Controller', 'RestController'];
const INJECT_ANNOS = ['Autowired', 'Inject', 'Resource', 'Value', 'PersistenceContext', 'PersistenceUnit', 'EJB', 'Qualifier', 'MockBean', 'SpyBean', 'Mock', 'InjectMocks'];
const MAPPINGS = ['RequestMapping', 'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping'];
const PROXY_ANNOS = ['Transactional', 'Async', 'Cacheable', 'CachePut', 'CacheEvict', 'Retryable'];
const TEST_ANNOS = ['Test', 'ParameterizedTest', 'RepeatedTest', 'TestFactory', 'TestTemplate', 'Property'];

function isPrivate(m) {
  return !!(m && m.mods && m.mods.has('private'));
}

function isStaticMember(m) {
  return !!(m && m.mods && (m.mods.has('static') || m.mods.has('const')));
}

function ctors(cls) {
  return cls.members.filter((m) => m.k === 'Method' && m.ctor);
}

function namePos(n) {
  return { line: n.nameLine || n.line, col: n.nameCol || n.col };
}

function annoStrings(a, names) {
  const out = [];
  for (const p of (a && a.args) || []) {
    if (!names.includes(p.name)) continue;
    const v = p.value;
    if (!v) continue;
    for (const l of A.findAll(v, (x) => x.k === 'Lit' && x.t === 'str')) out.push(String(l.v));
    if (v.k === 'Lit' && v.t === 'str' && !out.includes(String(v.v))) out.push(String(v.v));
  }
  return out;
}

function isTestPath(p) {
  return /(^|\/)(test|tests|androidTest|testFixtures|it)\//.test(p) || /(Test|Tests|IT|Spec)\.(java|kt)$/.test(p);
}

function isJUnit5(cx) {
  return /org\.junit\.jupiter/.test(cx.src);
}

function isTestMethod(m) {
  return m && m.k === 'Method' && A.hasAnno(m, TEST_ANNOS);
}

const TEST_PATH = { java: 'src/test/java/T.java', kt: 'src/test/kotlin/T.kt' };

// ── Spring ──
rule({
  id: 'field-injection', langs: JK, type: 'S', sev: 'MA', debt: 5, tags: ['spring', 'design'], sonar: 'S6813', ktSonar: 'S6813',
  en: ['Field dependency injection should be avoided', 'Injected fields hide the dependencies of a class, cannot be final and force tests to use reflection or a container.', 'Inject dependencies through the constructor.'],
  ko: ['필드 의존성 주입은 피해야 합니다', '필드 주입은 클래스의 의존성을 숨기고 final로 만들 수 없으며 테스트가 리플렉션이나 컨테이너에 의존하게 만듭니다.', '생성자를 통해 의존성을 주입하세요.'],
  msg: ['Remove this field injection of "{0}" and use constructor injection instead.', '"{0}"의 필드 주입을 없애고 생성자 주입을 쓰세요.'],
  on: {
    Field(n, cx) {
      if (!A.hasAnno(n, ['Autowired', 'Inject']) || cx.isTestClass()) return;
      for (const v of n.vars) cx.report(v, [v.name]);
    },
  },
  bad: {
    java: jc(`  @org.springframework.beans.factory.annotation.Autowired
  private OrderRepository repo; // Noncompliant`),
    kt: kc(`  @Autowired
  lateinit var repo: OrderRepository // Noncompliant`),
  },
  good: {
    java: jc(`  private final OrderRepository repo;
  T(OrderRepository repo) { this.repo = repo; }`),
    kt: `class T(private val repo: OrderRepository)
`,
  },
});

rule({
  id: 'proxy-annotation-on-private', langs: JK, type: 'B', sev: 'CR', debt: 5, tags: ['spring'], sonar: 'S2230', ktSonar: 'S2230',
  en: ['Methods with Spring proxy annotations should not be private', 'Spring applies @Transactional, @Async and the cache annotations through proxies, which cannot intercept private methods; the annotation silently does nothing.', 'Make the method public (and call it through the bean), or remove the annotation.'],
  ko: ['Spring 프록시 어노테이션이 붙은 메서드는 private이면 안 됩니다', 'Spring은 @Transactional, @Async, 캐시 어노테이션을 프록시로 적용하는데 private 메서드는 가로챌 수 없어 어노테이션이 조용히 무시됩니다.', '메서드를 public으로 만들어 빈을 통해 호출하거나 어노테이션을 지우세요.'],
  msg: ['Make this method non-private or remove the "@{0}" annotation.', '이 메서드를 private이 아니게 하거나 "@{0}" 어노테이션을 지우세요.'],
  on: {
    Method(n, cx) {
      if (!isPrivate(n)) return;
      const a = (n.annos || []).find((x) => PROXY_ANNOS.includes(A.annoName(x)));
      if (a) cx.report(namePos(n), [A.annoName(a)]);
    },
  },
  bad: {
    java: jc(`  @org.springframework.transaction.annotation.Transactional
  private void save(Object o) { } // Noncompliant`),
    kt: kc(`  @Async
  private fun send(o: Any) { } // Noncompliant`),
  },
  good: {
    java: jc(`  @org.springframework.transaction.annotation.Transactional
  public void save(Object o) { }`),
    kt: kc(`  @Async
  fun send(o: Any) { }`),
  },
});

rule({
  id: 'proxy-self-invocation', langs: JK, type: 'B', sev: 'MA', debt: 15, tags: ['spring'], sonar: 'S2229', ktSonar: 'S2229',
  en: ['Methods should not call same-class methods that rely on Spring proxies', 'A call through "this" bypasses the Spring proxy, so the @Transactional, @Async or cache behaviour of the callee is not applied.', 'Move the annotated method to another bean, inject the proxy of this bean, or annotate the caller.'],
  ko: ['Spring 프록시에 의존하는 같은 클래스의 메서드를 직접 호출하면 안 됩니다', 'this를 통한 호출은 Spring 프록시를 거치지 않아 호출된 메서드의 @Transactional, @Async, 캐시 동작이 적용되지 않습니다.', '어노테이션이 붙은 메서드를 다른 빈으로 옮기거나 이 빈의 프록시를 주입하거나 호출하는 쪽에 어노테이션을 붙이세요.'],
  msg: ['"{0}" is annotated with "@{1}", which is ignored when called from within the same class.', '"{0}"에는 "@{1}"이(가) 있지만 같은 클래스 안에서 호출하면 무시됩니다.'],
  on: {
    Call(n, cx) {
      if (n.o && !(n.o.k === 'This' && !n.o.q)) return;
      const m = cx.method;
      const c = cx.cls;
      if (!m || !c || m.name === n.id) return;
      if (cx.enclosing(['Lambda']) || (cx.cls && cx.cls.anon)) return;
      const target = H.classMethods(c).find((x) => x.name === n.id && x.params.length === n.args.length);
      if (!target) return;
      const a = (target.annos || []).find((x) => PROXY_ANNOS.includes(A.annoName(x)));
      if (!a) return;
      const name = A.annoName(a);
      if (A.hasAnno(m, name) || (name === 'Transactional' && A.hasAnno(c, 'Transactional'))) return;
      cx.report(n, [n.id, name]);
    },
  },
  bad: {
    java: jc(`  public void importAll(java.util.List<String> rows) {
    for (String r : rows) { importOne(r); } // Noncompliant
  }
  @org.springframework.transaction.annotation.Transactional
  public void importOne(String row) { }`),
    kt: kc(`  fun notifyAll(users: List<String>) {
    users.forEach { u -> println(u) }
    sendMail("all") // Noncompliant
  }
  @Async
  fun sendMail(to: String) { }`),
  },
  good: {
    java: jc(`  @org.springframework.transaction.annotation.Transactional
  public void importAll(java.util.List<String> rows) {
    for (String r : rows) { importOne(r); }
  }
  @org.springframework.transaction.annotation.Transactional
  public void importOne(String row) { }`),
    kt: kc(`  fun notifyAll(users: List<String>, mailer: Mailer) {
    mailer.sendMail("all")
  }`),
  },
});

function stereotype(c) {
  return !!c && A.hasAnno(c, STEREOTYPES) && !A.hasAnno(c, ['ConfigurationProperties', 'Configuration']) &&
    !annoStrings(A.getAnno(c, 'Scope'), ['value', 'scopeName']).some((s) => /prototype|request|session/.test(s)) &&
    !(A.getAnno(c, 'Scope') && /SCOPE_(PROTOTYPE|REQUEST|SESSION)/.test(JSON.stringify(A.getAnno(c, 'Scope').args.map((p) => A.dotted(p.value)))));
}

rule({
  id: 'spring-component-mutable-field', langs: JK, type: 'B', sev: 'MA', debt: 15, tags: ['spring', 'multi-threading'], sonar: 'S3749', ktSonar: 'S3749',
  en: ['Members of Spring components should be injected', 'Spring components are singletons shared by all requests and threads; a mutable field that is not injected holds state that leaks between users and races.', 'Inject the member, make it final/immutable, or keep the state in local variables.'],
  ko: ['Spring 컴포넌트의 멤버는 주입되어야 합니다', 'Spring 컴포넌트는 모든 요청과 스레드가 공유하는 싱글턴이라 주입되지 않은 가변 필드는 사용자 사이에 상태가 새고 경쟁 상태가 생깁니다.', '멤버를 주입하거나 final/불변으로 만들거나 상태를 지역 변수에 두세요.'],
  msg: ['Annotate this member "{0}" with "@Autowired", "@Resource", "@Inject" or "@Value", or remove it.', '멤버 "{0}"에 @Autowired, @Resource, @Inject, @Value를 붙이거나 지우세요.'],
  on: {
    Field(n, cx) {
      const c = cx.cls;
      if (!c || cx.parent(1) !== c || !stereotype(c) || isStaticMember(n) || A.hasAnno(n, INJECT_ANNOS)) return;
      if (cx.kt ? !n.mutable : (n.mods && n.mods.has('final'))) return;
      for (const v of n.vars) cx.report(v, [v.name]);
    },
  },
  bad: {
    java: `@org.springframework.stereotype.Service
class OrderService {
  private String lastCustomer; // Noncompliant
  @org.springframework.beans.factory.annotation.Autowired private OrderRepository repo;
}
`,
    kt: `@Service
class OrderService(private val repo: OrderRepository) {
  private var lastCustomer: String? = null // Noncompliant
}
`,
  },
  good: {
    java: `@org.springframework.stereotype.Service
class OrderService {
  private static final int LIMIT = 10;
  private final OrderRepository repo;
  @org.springframework.beans.factory.annotation.Value("\${orders.prefix}") private String prefix;
  OrderService(OrderRepository repo) { this.repo = repo; }
}
`,
    kt: `@Service
class OrderService(private val repo: OrderRepository) {
  private val limit = 10
}
`,
  },
});

rule({
  id: 'request-mapping-without-method', langs: JK, type: 'H', sev: 'MI', debt: 2, tags: ['spring', 'cwe-352', 'owasp-a1'], sonar: 'S3752', ktSonar: 'S3752', owasp: ['A01'],
  en: ['Allowing both safe and unsafe HTTP methods is security-sensitive', '@RequestMapping without "method" accepts GET as well as POST, PUT and DELETE, so state-changing handlers can be triggered by links and bypass CSRF checks that only cover unsafe methods.', 'Use @GetMapping, @PostMapping ... or set "method" explicitly.'],
  ko: ['안전한 HTTP 메서드와 안전하지 않은 메서드를 모두 허용하는 것은 보안에 민감합니다', 'method 없는 @RequestMapping은 GET과 POST·PUT·DELETE를 모두 받아 상태를 바꾸는 핸들러가 링크로 실행되고 안전하지 않은 메서드만 보는 CSRF 검사를 우회할 수 있습니다.', '@GetMapping, @PostMapping 등을 쓰거나 method를 명시하세요.'],
  on: {
    Method(n, cx) {
      const a = A.getAnno(n, 'RequestMapping');
      if (!a) return;
      const m = A.annoArg(a, 'method');
      if (!m) { cx.report(a); return; }
      const txt = cx.text(m);
      if (/\bGET\b/.test(txt) && /\b(POST|PUT|DELETE|PATCH)\b/.test(txt)) cx.report(a);
    },
  },
  bad: {
    java: jc(`  @org.springframework.web.bind.annotation.RequestMapping("/delete") // Noncompliant
  String delete(String id) { return "ok"; }`),
    kt: kc(`  @RequestMapping("/delete", method = [RequestMethod.GET, RequestMethod.POST]) // Noncompliant
  fun delete(id: String) = "ok"`),
  },
  good: {
    java: jc(`  @org.springframework.web.bind.annotation.RequestMapping(value = "/delete", method = org.springframework.web.bind.annotation.RequestMethod.POST)
  String delete(String id) { return "ok"; }`),
    kt: kc(`  @PostMapping("/delete")
  fun delete(id: String) = "ok"`),
  },
});

rule({
  id: 'request-mapping-private', langs: JK, type: 'B', sev: 'MA', debt: 2, tags: ['spring'], sonar: 'S3751', ktSonar: 'S3751',
  en: ['"@RequestMapping" methods should not be "private"', 'Private handler methods are still mapped by Spring but are not proxied, so security and transaction annotations around them do not apply.', 'Make the handler method public.'],
  ko: ['@RequestMapping 메서드는 private이면 안 됩니다', 'private 핸들러도 Spring이 매핑하지만 프록시를 거치지 않아 보안·트랜잭션 어노테이션이 적용되지 않습니다.', '핸들러 메서드를 public으로 만드세요.'],
  on: {
    Method(n, cx) { if (isPrivate(n) && A.hasAnno(n, MAPPINGS)) cx.report(namePos(n)); },
  },
  bad: {
    java: jc(`  @org.springframework.web.bind.annotation.GetMapping("/hello")
  private String hello() { return "hi"; } // Noncompliant`),
    kt: kc(`  @GetMapping("/hello")
  private fun hello() = "hi" // Noncompliant`),
  },
  good: {
    java: jc(`  @org.springframework.web.bind.annotation.GetMapping("/hello")
  public String hello() { return "hi"; }`),
    kt: kc(`  @GetMapping("/hello")
  fun hello() = "hi"`),
  },
});

rule({
  id: 'path-variable-missing', langs: JK, type: 'B', sev: 'MA', debt: 5, tags: ['spring'], sonar: 'S6856', ktSonar: 'S6856',
  en: ['"@PathVariable" annotation should be present if a path variable is used', 'A {placeholder} in the mapping path without a matching @PathVariable parameter is never bound; the handler cannot read it and Spring may reject the request.', 'Add a parameter annotated with @PathVariable("name") for every template variable.'],
  ko: ['경로 변수를 쓰면 @PathVariable 어노테이션이 있어야 합니다', '매핑 경로의 {자리표시자}에 맞는 @PathVariable 매개변수가 없으면 값이 바인딩되지 않아 핸들러가 읽을 수 없고 Spring이 요청을 거부할 수 있습니다.', '템플릿 변수마다 @PathVariable("name") 매개변수를 추가하세요.'],
  msg: ['Bind template variable "{0}" to a method parameter.', '템플릿 변수 "{0}"을(를) 메서드 매개변수에 바인딩하세요.'],
  on: {
    Method(n, cx) {
      const a = (n.annos || []).find((x) => MAPPINGS.includes(A.annoName(x)));
      if (!a) return;
      const paths = annoStrings(a, ['value', 'path']);
      const vars = new Set();
      for (const p of paths) for (const m of p.matchAll(/\{([A-Za-z_]\w*)(?::[^}]*)?\}/g)) vars.add(m[1]);
      if (!vars.size) return;
      const bound = new Set();
      for (const p of n.params) {
        const pv = A.getAnno(p, 'PathVariable');
        if (!pv) continue;
        if (/^(Map|MultiValueMap|MutableMap)$/.test(A.typeName(p.type))) return;
        const names = annoStrings(pv, ['value', 'name']);
        if (names.length) names.forEach((x) => bound.add(x)); else bound.add(p.name);
      }
      for (const v of vars) if (!bound.has(v)) cx.report(a, [v]);
    },
  },
  bad: {
    java: jc(`  @org.springframework.web.bind.annotation.GetMapping("/orders/{id}/items/{item}") // Noncompliant
  String item(@org.springframework.web.bind.annotation.PathVariable String id) { return id; }`),
    kt: kc(`  @GetMapping("/users/{userId}") // Noncompliant
  fun user(@PathVariable("id") id: String) = id`),
  },
  good: {
    java: jc(`  @org.springframework.web.bind.annotation.GetMapping("/orders/{id}/items/{item}")
  String item(@org.springframework.web.bind.annotation.PathVariable String id, @org.springframework.web.bind.annotation.PathVariable("item") String it) { return id + it; }`),
    kt: kc(`  @GetMapping("/users/{userId}")
  fun user(@PathVariable userId: String) = userId`),
  },
});

function isEntityClass(cx, t) {
  const info = cx.proj.info(t);
  return !!(info && A.hasAnno(info.decl, ['Entity', 'Document']));
}

rule({
  id: 'entity-as-request-parameter', langs: JK, type: 'V', sev: 'CR', debt: 15, tags: ['spring', 'jpa', 'cwe-915', 'owasp-a8'], sonar: 'S4684', ktSonar: 'S4684', owasp: ['A08'],
  en: ['Persistent entities should not be used as arguments of "@RequestMapping" methods', 'Binding a request directly to a JPA entity lets the client set any persistent field, including ids, roles or prices (mass assignment).', 'Bind requests to a dedicated DTO and copy the allowed fields to the entity.'],
  ko: ['영속 엔터티를 @RequestMapping 메서드의 인자로 쓰면 안 됩니다', '요청을 JPA 엔터티에 바로 바인딩하면 클라이언트가 ID·권한·가격 같은 영속 필드를 마음대로 정할 수 있습니다(대량 할당).', '요청은 전용 DTO에 바인딩하고 허용된 필드만 엔터티로 복사하세요.'],
  msg: ['Replace this persistent entity "{0}" with a simple POJO or DTO object.', '영속 엔터티 "{0}"을(를) 단순 POJO나 DTO로 바꾸세요.'],
  samplePath: { java: 'src/main/java/T.java', kt: 'src/main/kotlin/T.kt' },
  on: {
    Method(n, cx) {
      if (!A.hasAnno(n, MAPPINGS)) return;
      for (const p of n.params) {
        if (A.hasAnno(p, ['PathVariable', 'RequestHeader', 'CookieValue'])) continue;
        const t = A.typeName(p.type);
        if (t && isEntityClass(cx, t)) cx.report(p, [t]);
      }
    },
  },
  bad: {
    java: `@javax.persistence.Entity
class Account { @javax.persistence.Id Long id; String role; }
class AccountController {
  @org.springframework.web.bind.annotation.PostMapping("/accounts")
  void save(Account account) { } // Noncompliant
}
`,
    kt: `@Entity
class Account(@Id var id: Long = 0, var role: String = "")
class AccountController {
  @PostMapping("/accounts")
  fun save(@RequestBody account: Account) { } // Noncompliant
}
`,
  },
  good: {
    java: `@javax.persistence.Entity
class Account { @javax.persistence.Id Long id; String role; }
class AccountForm { String name; }
class AccountController {
  @org.springframework.web.bind.annotation.PostMapping("/accounts")
  void save(AccountForm form) { }
}
`,
    kt: `@Entity
class Account(@Id var id: Long = 0, var role: String = "")
class AccountForm(val name: String)
class AccountController {
  @PostMapping("/accounts")
  fun save(@RequestBody form: AccountForm) { }
}
`,
  },
});

rule({
  id: 'value-without-placeholder', langs: JK, type: 'S', sev: 'MI', debt: 5, tags: ['spring', 'confusing'], sonar: 'S6804', ktSonar: 'S6804',
  en: ['"@Value" should inject a property or a SpEL expression', '@Value("literal") without ${...} or #{...} injects the literal text itself, which is a hard-coded value disguised as configuration.', 'Use "${property.name}" or "#{expression}", or assign the constant directly.'],
  ko: ['@Value는 속성이나 SpEL 식을 주입해야 합니다', '${...}나 #{...} 없는 @Value("값")은 그 글자 자체를 주입하므로 설정처럼 보이는 하드코딩 값입니다.', '"${property.name}"이나 "#{expression}"을 쓰거나 상수를 직접 대입하세요.'],
  on: {
    Anno(n, cx) {
      if (A.annoName(n) !== 'Value' || !n.args || n.args.length !== 1) return;
      const v = A.strip(n.args[0].value);
      if (!v || v.k !== 'Lit' || v.t !== 'str') return;
      if (!/\$\{|#\{/.test(String(v.v))) cx.report(n);
    },
  },
  bad: {
    java: jc(`  @org.springframework.beans.factory.annotation.Value("orders") // Noncompliant
  private String queue;`),
    kt: kc(`  @Value("30") // Noncompliant
  private var timeout: Int = 0`),
  },
  good: {
    java: jc(`  @org.springframework.beans.factory.annotation.Value("\${orders.queue}")
  private String queue;`),
    kt: kc(`  @Value("#{systemProperties['timeout']}")
  private var timeout: Int = 0`),
  },
});

rule({
  id: 'autowired-multiple-constructors', type: 'B', sev: 'MA', debt: 5, tags: ['spring'], sonar: 'S6829',
  en: ['"@Autowired" should only be used on a single constructor', 'Spring refuses to start when more than one constructor is marked @Autowired (required), so the context fails at run time.', 'Keep @Autowired on the constructor Spring should use.'],
  ko: ['@Autowired는 생성자 하나에만 써야 합니다', '@Autowired(required) 생성자가 둘 이상이면 Spring이 시작을 거부해 실행 시점에 컨텍스트가 실패합니다.', 'Spring이 써야 할 생성자에만 @Autowired를 두세요.'],
  on: {
    Class(n, cx) {
      const auto = ctors(n).filter((c) => A.hasAnno(c, 'Autowired') && !A.isBoolLit(A.annoArg(A.getAnno(c, 'Autowired'), 'required'), false));
      if (auto.length > 1) for (const c of auto.slice(1)) cx.report(namePos(c));
    },
  },
  bad: {
    java: jc(`  @org.springframework.beans.factory.annotation.Autowired
  T(String a) { }
  @org.springframework.beans.factory.annotation.Autowired
  T(String a, int b) { } // Noncompliant`),
  },
  good: {
    java: jc(`  @org.springframework.beans.factory.annotation.Autowired
  T(String a) { }
  T(String a, int b) { }`),
  },
});

rule({
  id: 'autowired-single-constructor', type: 'S', sev: 'MI', debt: 1, tags: ['spring', 'clumsy'], sonar: 'S6818',
  en: ['"@Autowired" should be removed from the only constructor of a class', 'Since Spring 4.3 a class with a single constructor uses it for injection automatically; the annotation is noise.', 'Remove the @Autowired annotation.'],
  ko: ['생성자가 하나뿐인 클래스에서는 @Autowired를 지워야 합니다', 'Spring 4.3부터 생성자가 하나뿐이면 자동으로 그 생성자로 주입하므로 어노테이션이 불필요합니다.', '@Autowired 어노테이션을 지우세요.'],
  on: {
    Class(n, cx) {
      const cs = ctors(n);
      if (cs.length === 1 && A.hasAnno(cs[0], 'Autowired') && A.hasAnno(n, STEREOTYPES.concat(['Configuration']))) cx.report(A.getAnno(cs[0], 'Autowired'));
    },
  },
  bad: {
    java: `@org.springframework.stereotype.Service
class OrderService {
  private final OrderRepository repo;
  @org.springframework.beans.factory.annotation.Autowired // Noncompliant
  OrderService(OrderRepository repo) { this.repo = repo; }
}
`,
  },
  good: {
    java: `@org.springframework.stereotype.Service
class OrderService {
  private final OrderRepository repo;
  OrderService(OrderRepository repo) { this.repo = repo; }
}
`,
  },
});

rule({
  id: 'async-in-configuration', langs: JK, type: 'B', sev: 'MA', debt: 5, tags: ['spring'], sonar: 'S6817', ktSonar: 'S6817',
  en: ['"@Async" should not be used on methods of "@Configuration" classes', '@Configuration classes are processed before async support is set up and their @Bean methods are called by Spring itself, so @Async there does not behave as expected.', 'Move the asynchronous method to a regular @Component or @Service.'],
  ko: ['@Configuration 클래스의 메서드에 @Async를 쓰면 안 됩니다', '@Configuration 클래스는 비동기 지원이 준비되기 전에 처리되고 @Bean 메서드는 Spring이 직접 호출하므로 @Async가 기대대로 동작하지 않습니다.', '비동기 메서드를 일반 @Component나 @Service로 옮기세요.'],
  on: {
    Method(n, cx) { if (A.hasAnno(n, 'Async') && cx.cls && A.hasAnno(cx.cls, 'Configuration')) cx.report(A.getAnno(n, 'Async')); },
  },
  bad: {
    java: `@org.springframework.context.annotation.Configuration
class AppConfig {
  @org.springframework.scheduling.annotation.Async // Noncompliant
  public void warmUp() { }
}
`,
    kt: `@Configuration
class AppConfig {
  @Async // Noncompliant
  fun warmUp() { }
}
`,
  },
  good: {
    java: `@org.springframework.stereotype.Service
class Warmer {
  @org.springframework.scheduling.annotation.Async
  public void warmUp() { }
}
`,
    kt: `@Service
class Warmer {
  @Async
  fun warmUp() { }
}
`,
  },
});

rule({
  id: 'controller-with-scope', langs: JK, type: 'S', sev: 'MA', debt: 2, tags: ['spring'], sonar: 'S3750', ktSonar: 'S3750',
  en: ['Spring "@Controller" classes should not use "@Scope"', 'Controllers are meant to be stateless singletons; a request or session scope creates a controller per request and usually hides state that belongs in the model or session.', 'Remove @Scope and keep per-user state in the session or model.'],
  ko: ['Spring @Controller 클래스에 @Scope를 쓰면 안 됩니다', '컨트롤러는 상태 없는 싱글턴이어야 하며 request나 session 범위는 요청마다 컨트롤러를 만들고 모델이나 세션에 있어야 할 상태를 숨깁니다.', '@Scope를 지우고 사용자별 상태는 세션이나 모델에 두세요.'],
  on: {
    Class(n, cx) { if (A.hasAnno(n, ['Controller', 'RestController']) && A.hasAnno(n, 'Scope')) cx.report(A.getAnno(n, 'Scope')); },
  },
  bad: {
    java: `@org.springframework.stereotype.Controller
@org.springframework.context.annotation.Scope("session") // Noncompliant
class CartController { }
`,
    kt: `@RestController
@Scope("request") // Noncompliant
class CartController
`,
  },
  good: {
    java: `@org.springframework.stereotype.Controller
class CartController { }
`,
    kt: `@RestController
class CartController
`,
  },
});

rule({
  id: 'spring-default-package', langs: JK, type: 'B', sev: 'CR', debt: 5, tags: ['spring'], sonar: 'S4602', ktSonar: 'S4602',
  en: ['"@SpringBootApplication" and "@ComponentScan" should not be used in the default package', 'Scanning from the default package scans every class of every jar on the class path, which slows start-up dramatically and may pick up unwanted beans.', 'Move the class into a named package.'],
  ko: ['@SpringBootApplication과 @ComponentScan을 기본 패키지에서 쓰면 안 됩니다', '기본 패키지에서 스캔하면 클래스 경로의 모든 jar 클래스를 살펴 시작이 크게 느려지고 원치 않는 빈이 잡힐 수 있습니다.', '클래스를 이름 있는 패키지로 옮기세요.'],
  on: {
    Class(n, cx) {
      if (cx.unit.pkg || cx.parent(1) !== cx.unit) return;
      const a = (n.annos || []).find((x) => ['SpringBootApplication', 'ComponentScan'].includes(A.annoName(x)));
      if (a) cx.report(a);
    },
  },
  bad: {
    java: `@org.springframework.boot.autoconfigure.SpringBootApplication // Noncompliant
class App { }
`,
    kt: `@SpringBootApplication // Noncompliant
class App
`,
  },
  good: {
    java: `package com.example.app;
@org.springframework.boot.autoconfigure.SpringBootApplication
class App { }
`,
    kt: `package com.example.app
@SpringBootApplication
class App
`,
  },
});

rule({
  id: 'any-request-before-matchers', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['spring', 'owasp-a1'], sonar: 'S4601', ktSonar: 'S4601', owasp: ['A01'],
  en: ['"HttpSecurity" URL patterns should be correctly ordered', 'Spring Security evaluates matchers in order; rules registered after anyRequest() are never reached, so the intended restrictions do not apply.', 'Declare specific matchers first and anyRequest() last.'],
  ko: ['HttpSecurity URL 패턴은 올바른 순서여야 합니다', 'Spring Security는 매처를 순서대로 평가하므로 anyRequest() 뒤에 등록한 규칙은 도달하지 않아 의도한 제한이 적용되지 않습니다.', '구체적인 매처를 먼저 두고 anyRequest()는 마지막에 두세요.'],
  on: {
    Call(n, cx) {
      if (!/^(antMatchers|requestMatchers|mvcMatchers|regexMatchers)$/.test(n.id)) return;
      for (let x = A.strip(n.o); x && x.k === 'Call'; x = A.strip(x.o)) if (x.id === 'anyRequest') { cx.report(n); return; }
    },
  },
  bad: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.authorizeRequests()
        .anyRequest().authenticated()
        .antMatchers("/admin/**").hasRole("ADMIN"); // Noncompliant
  }`),
    kt: kc(`  fun configure(http: HttpSecurity) {
    http.authorizeRequests()
      .anyRequest().permitAll()
      .requestMatchers("/admin/**").hasRole("ADMIN") // Noncompliant
  }`),
  },
  good: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.authorizeRequests()
        .antMatchers("/admin/**").hasRole("ADMIN")
        .anyRequest().authenticated();
  }`),
    kt: kc(`  fun configure(http: HttpSecurity) {
    http.authorizeRequests()
      .requestMatchers("/admin/**").hasRole("ADMIN")
      .anyRequest().authenticated()
  }`),
  },
});

// ── JPA / Hibernate ──
rule({
  id: 'entity-without-default-constructor', type: 'B', sev: 'MA', debt: 5, tags: ['jpa', 'hibernate'],
  en: ['JPA entities should have a no-argument constructor', 'The JPA provider instantiates entities through a public or protected no-argument constructor; without one loading fails at run time.', 'Add a protected no-argument constructor.'],
  ko: ['JPA 엔터티에는 인자 없는 생성자가 있어야 합니다', 'JPA 구현체는 public이나 protected 인자 없는 생성자로 엔터티를 만들기 때문에 없으면 조회가 실행 시점에 실패합니다.', 'protected 인자 없는 생성자를 추가하세요.'],
  on: {
    Class(n, cx) {
      if (!A.hasAnno(n, 'Entity')) return;
      const cs = ctors(n);
      if (cs.length && !cs.some((c) => c.params.length === 0 && !isPrivate(c))) cx.report(namePos(n));
    },
  },
  bad: {
    java: `@javax.persistence.Entity
class Customer { // Noncompliant
  @javax.persistence.Id Long id;
  String name;
  Customer(String name) { this.name = name; }
}
`,
  },
  good: {
    java: `@javax.persistence.Entity
class Customer {
  @javax.persistence.Id Long id;
  String name;
  protected Customer() { }
  Customer(String name) { this.name = name; }
}
`,
  },
});

rule({
  id: 'entity-final-class', type: 'B', sev: 'MA', debt: 5, tags: ['jpa', 'hibernate'],
  en: ['JPA entities should not be final', 'Hibernate creates lazy-loading proxies by subclassing entities; a final entity cannot be proxied, which disables lazy loading or fails at start-up.', 'Remove the final modifier from the entity class.'],
  ko: ['JPA 엔터티는 final이면 안 됩니다', 'Hibernate는 엔터티를 상속해 지연 로딩 프록시를 만드는데 final 엔터티는 프록시를 만들 수 없어 지연 로딩이 꺼지거나 시작에 실패합니다.', '엔터티 클래스에서 final을 지우세요.'],
  on: { Class(n, cx) { if (A.hasAnno(n, 'Entity') && n.mods && n.mods.has('final')) cx.report(namePos(n)); } },
  bad: {
    java: `@javax.persistence.Entity
final class Invoice { // Noncompliant
  @javax.persistence.Id Long id;
}
`,
  },
  good: {
    java: `@javax.persistence.Entity
class Invoice {
  @javax.persistence.Id Long id;
}
`,
  },
});

rule({
  id: 'entity-data-class', langs: ['kt'], type: 'B', sev: 'MA', debt: 10, tags: ['jpa', 'hibernate'],
  en: ['JPA entities should not be data classes', 'The generated equals/hashCode/toString of a data class read every property, which triggers lazy loading, breaks when the id is assigned on save and can recurse through relations.', 'Use a regular class with equals/hashCode based on the identifier.'],
  ko: ['JPA 엔터티를 data class로 만들면 안 됩니다', 'data class가 만드는 equals/hashCode/toString은 모든 속성을 읽어 지연 로딩을 일으키고 저장 시 ID가 정해지면 깨지며 연관 관계를 따라 무한 재귀할 수 있습니다.', '일반 클래스로 만들고 식별자를 기준으로 equals/hashCode를 구현하세요.'],
  on: { Class(n, cx) { if (n.mods && n.mods.has('data') && A.hasAnno(n, 'Entity')) cx.report(namePos(n)); } },
  bad: { kt: `@Entity
data class Customer(@Id var id: Long? = null, var name: String = "") // Noncompliant
` },
  good: { kt: `@Entity
class Customer(@Id var id: Long? = null, var name: String = "")
` },
});

rule({
  id: 'eager-fetch', langs: JK, type: 'S', sev: 'MA', debt: 15, tags: ['jpa', 'performance'],
  en: ['Associations should not be fetched eagerly', 'FetchType.EAGER loads the association every time the entity is read, often through extra queries (N+1), even when it is not needed.', 'Use LAZY fetching and load the association explicitly (join fetch, entity graph) where it is needed.'],
  ko: ['연관 관계를 즉시 로딩하면 안 됩니다', 'FetchType.EAGER는 필요 없을 때도 엔터티를 읽을 때마다 연관 관계를 추가 쿼리(N+1)로 읽습니다.', 'LAZY로 두고 필요한 곳에서 join fetch나 엔터티 그래프로 명시적으로 읽으세요.'],
  on: {
    Anno(n, cx) {
      if (!['OneToMany', 'ManyToMany', 'ManyToOne', 'OneToOne', 'ElementCollection'].includes(A.annoName(n))) return;
      const f = A.annoArg(n, 'fetch');
      if (f && /EAGER$/.test(A.dotted(f) || '')) cx.report(n);
    },
  },
  bad: {
    java: jc(`  @javax.persistence.OneToMany(fetch = javax.persistence.FetchType.EAGER) // Noncompliant
  java.util.List<Object> lines;`),
    kt: kc(`  @ManyToMany(fetch = FetchType.EAGER) // Noncompliant
  var tags: MutableSet<Tag> = mutableSetOf()`),
  },
  good: {
    java: jc(`  @javax.persistence.OneToMany(fetch = javax.persistence.FetchType.LAZY)
  java.util.List<Object> lines;`),
    kt: kc(`  @ManyToMany
  var tags: MutableSet<Tag> = mutableSetOf()`),
  },
});

// ── Servlet ──
rule({
  id: 'servlet-mutable-field', langs: JK, type: 'B', sev: 'MA', debt: 15, tags: ['cert', 'multi-threading', 'struts'], sonar: 'S2226', ktSonar: 'S2226',
  en: ['Servlets should not have mutable instance fields', 'The container uses a single servlet instance for all concurrent requests, so instance fields are shared between users and threads.', 'Keep request data in local variables or request attributes; make shared fields final and thread-safe.'],
  ko: ['서블릿에 가변 인스턴스 필드를 두면 안 됩니다', '컨테이너는 동시에 들어오는 모든 요청에 서블릿 인스턴스 하나를 쓰므로 인스턴스 필드가 사용자와 스레드 사이에 공유됩니다.', '요청 데이터는 지역 변수나 요청 속성에 두고 공유 필드는 final이면서 스레드 안전하게 만드세요.'],
  msg: ['Remove this misleading mutable servlet instance field "{0}" or make it "static" and/or "final".', '오해를 부르는 가변 서블릿 인스턴스 필드 "{0}"을(를) 지우거나 static 또는 final로 만드세요.'],
  on: {
    Field(n, cx) {
      const c = cx.cls;
      if (!c || cx.parent(1) !== c || isStaticMember(n) || A.hasAnno(n, INJECT_ANNOS)) return;
      if (cx.kt ? !n.mutable : (n.mods && n.mods.has('final'))) return;
      if (!H.implementsAny(cx, c, ['HttpServlet', 'GenericServlet', 'Servlet', 'Action'])) return;
      for (const v of n.vars) cx.report(v, [v.name]);
    },
  },
  bad: {
    java: `class OrderServlet extends javax.servlet.http.HttpServlet {
  private String user; // Noncompliant
  private static final long serialVersionUID = 1L;
}
`,
    kt: `class OrderServlet : HttpServlet() {
  private var user: String? = null // Noncompliant
}
`,
  },
  good: {
    java: `class OrderServlet extends javax.servlet.http.HttpServlet {
  private static final long serialVersionUID = 1L;
  private final java.util.concurrent.atomic.AtomicLong hits = new java.util.concurrent.atomic.AtomicLong();
}
`,
    kt: `class OrderServlet : HttpServlet() {
  private val hits = java.util.concurrent.atomic.AtomicLong()
}
`,
  },
});

// ── tests ──
const ASSERT_CALL = /^(assert|verify|expect|fail|should|check|then|validate|must|await)/i;
const ASSERT_HOLDERS = /^(Assert|Assertions|MatcherAssert|AssertJUnit|Truth|Mockito|BDDMockito|BDDAssertions|StepVerifier|WithAssertions|SoftAssertions)$/;

function hasAssertion(cls, body, depth = 0) {
  return !!A.find(body, (x) => {
    if (x.k === 'Assert' || x.k === 'Throw') return true;
    if (x.k !== 'Call' || !x.id) return false;
    if (ASSERT_CALL.test(x.id)) return true;
    if (depth < 2 && !x.o && cls) {
      const m = H.classMethods(cls).find((y) => y.name === x.id && y.body && !isTestMethod(y));
      if (m && hasAssertion(cls, m.body, depth + 1)) return true;
    }
    return false;
  });
}

function assertCall(n, ids) {
  if (!ids.includes(n.id)) return false;
  if (!n.o) return true;
  return ASSERT_HOLDERS.test(A.simpleName(A.dotted(n.o) || ''));
}

rule({
  id: 'test-without-assertion', langs: JK, type: 'S', sev: 'BL', debt: 10, tags: ['tests'], sonar: 'S2699', ktSonar: 'S2699',
  en: ['Tests should include assertions', 'A test without any assertion only checks that no exception is thrown and passes even when the code under test returns wrong results.', 'Add assertions that check the result or the interactions of the code under test.'],
  ko: ['테스트에는 단언문이 있어야 합니다', '단언문 없는 테스트는 예외가 없는지만 확인해 테스트 대상이 틀린 결과를 내도 통과합니다.', '테스트 대상의 결과나 상호작용을 확인하는 단언문을 추가하세요.'],
  samplePath: TEST_PATH,
  on: {
    Method(n, cx) {
      if (!n.body || !A.hasAnno(n, ['Test', 'ParameterizedTest', 'RepeatedTest'])) return;
      const t = A.getAnno(n, 'Test');
      if (t && (A.annoArg(t, 'expected') || A.annoArg(t, 'expectedExceptions'))) return;
      if (hasAssertion(cx.cls, n.body)) return;
      cx.report(namePos(n));
    },
  },
  bad: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  @Test void total() { // Noncompliant
    Order o = new Order();
    o.add(3);
  }
}
`,
    kt: `import org.junit.jupiter.api.Test
class OrderTest {
  @Test fun total() { // Noncompliant
    val o = Order()
    o.add(3)
  }
}
`,
  },
  good: {
    java: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class OrderTest {
  @Test void total() {
    Order o = new Order();
    o.add(3);
    assertEquals(3, o.total());
  }
  @Test void helper() { checkEmpty(new Order()); }
  private void checkEmpty(Order o) { assertEquals(0, o.total()); }
  @org.junit.Test(expected = IllegalStateException.class) public void fails() { new Order().close(); }
}
`,
    kt: `import org.junit.jupiter.api.Test
class OrderTest {
  @Test fun total() {
    val o = Order()
    o.add(3)
    o.total() shouldBe 3
  }
}
`,
  },
});

const EQ_ASSERTS = ['assertEquals', 'assertNotEquals', 'assertSame', 'assertNotSame', 'assertArrayEquals', 'assertIterableEquals', 'assertLinesMatch'];

function expectedActual(n) {
  const a = n.args.filter((x) => !(x.k === 'Lambda'));
  if (a.length < 2) return null;
  if (a.length >= 3 && A.isStrLit(a[0]) && !A.isStrLit(a[a.length - 1])) return [a[1], a[2]];
  return [a[0], a[1]];
}

rule({
  id: 'assertion-arguments-order', langs: JK, type: 'S', sev: 'MA', debt: 2, tags: ['tests'], sonar: 'S3415', ktSonar: 'S3415',
  en: ['Assertion arguments should be passed in the correct order', 'JUnit and kotlin.test expect (expected, actual); swapped arguments produce failure messages that say the opposite of what happened.', 'Pass the expected value first and the computed value second.'],
  ko: ['단언문 인자는 올바른 순서로 넘겨야 합니다', 'JUnit과 kotlin.test는 (expected, actual) 순서를 기대하므로 순서가 바뀌면 실패 메시지가 실제와 반대로 나옵니다.', '기대값을 먼저, 계산된 값을 두 번째로 넘기세요.'],
  msg: ['Swap these 2 arguments so they are in the correct order: expected value, actual value.', '두 인자를 기대값, 실제값의 올바른 순서로 바꾸세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!assertCall(n, EQ_ASSERTS) || /org\.testng/.test(cx.src)) return;
      const ea = expectedActual(n);
      if (!ea) return;
      const isConst = (x) => { x = A.strip(x); return A.isLit(x) || cx.constValue(x) !== undefined || (x && x.k === 'Name' && /^[A-Z][A-Z0-9_]+$/.test(x.id)); };
      if (isConst(ea[1]) && !isConst(ea[0])) cx.report(n);
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.assertEquals;
class OrderTest {
  @org.junit.jupiter.api.Test void total() {
    assertEquals(new Order().total(), 0); // Noncompliant
  }
}
`,
    kt: `import kotlin.test.assertEquals
class OrderTest {
  @Test fun total() {
    assertEquals(Order().total(), 0) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.assertEquals;
class OrderTest {
  @org.junit.jupiter.api.Test void total() {
    assertEquals(0, new Order().total());
    assertEquals("message", "none", new Order().name());
  }
}
`,
    kt: `import kotlin.test.assertEquals
class OrderTest {
  @Test fun total() {
    assertEquals(0, Order().total())
  }
}
`,
  },
});

rule({
  id: 'junit5-test-silently-ignored', langs: JK, type: 'B', sev: 'CR', debt: 2, tags: ['tests', 'junit'], sonar: 'S5810', ktSonar: 'S5810',
  en: ['JUnit 5 test methods should not be silently ignored', 'JUnit Jupiter skips @Test methods that are private, static or return a value, without any warning; the test never runs.', 'Make the test method non-private, non-static and void (Unit).'],
  ko: ['JUnit 5 테스트 메서드가 조용히 무시되면 안 됩니다', 'JUnit Jupiter는 private, static이거나 값을 돌려주는 @Test 메서드를 경고 없이 건너뛰어 테스트가 실행되지 않습니다.', '테스트 메서드를 private·static이 아니고 void(Unit)를 돌려주게 만드세요.'],
  msg: ['Fix this test method so that it is executed: {0}.', '이 테스트 메서드가 실행되도록 고치세요: {0}.'],
  samplePath: TEST_PATH,
  on: {
    Method(n, cx) {
      if (!isJUnit5(cx) || !A.hasAnno(n, ['Test', 'ParameterizedTest', 'RepeatedTest'])) return;
      const why = [];
      if (isPrivate(n)) why.push('it is private');
      if (n.mods && n.mods.has('static')) why.push('it is static');
      const rt = n.ret ? A.typeName(n.ret) : (n.exprBody ? '?' : null);
      if (rt && !['void', 'Unit', '?'].includes(rt)) why.push('it returns ' + rt);
      if (why.length) cx.report(namePos(n), [why.join(', ')]);
    },
  },
  bad: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  @Test private void a() { } // Noncompliant
  @Test int b() { return 1; } // Noncompliant
}
`,
    kt: `import org.junit.jupiter.api.Test
class OrderTest {
  @Test private fun a() { } // Noncompliant
  @Test fun b(): Int { return 1 } // Noncompliant
}
`,
  },
  good: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  @Test void a() { }
}
`,
    kt: `import org.junit.jupiter.api.Test
class OrderTest {
  @Test fun a() { }
  @Test fun b(): Unit { }
}
`,
  },
});

rule({
  id: 'junit5-public-visibility', type: 'S', sev: 'IN', debt: 2, tags: ['tests', 'junit'], sonar: 'S5786',
  en: ['JUnit 5 test classes and methods should have default package visibility', 'JUnit Jupiter does not need public test classes or methods; the extra modifier is noise inherited from JUnit 4.', 'Remove the public modifier.'],
  ko: ['JUnit 5 테스트 클래스와 메서드는 기본(package) 가시성이어야 합니다', 'JUnit Jupiter는 public 테스트 클래스나 메서드가 필요 없어 JUnit 4에서 남은 불필요한 수식어입니다.', 'public 수식어를 지우세요.'],
  samplePath: TEST_PATH,
  on: {
    Method(n, cx) {
      if (isJUnit5(cx) && n.mods && n.mods.has('public') && A.hasAnno(n, TEST_ANNOS.concat(['BeforeEach', 'AfterEach', 'BeforeAll', 'AfterAll']))) cx.report(namePos(n));
    },
  },
  bad: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  @Test public void total() { } // Noncompliant
}
`,
  },
  good: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  @Test void total() { }
}
`,
  },
});

const JUNIT4_ONLY = ['Before', 'After', 'BeforeClass', 'AfterClass', 'Ignore', 'Rule', 'ClassRule', 'RunWith'];

rule({
  id: 'junit4-annotation-in-junit5', langs: JK, type: 'B', sev: 'MA', debt: 5, tags: ['tests', 'junit'],
  en: ['JUnit 4 annotations should not be used in JUnit 5 tests', 'The Jupiter engine ignores @Before, @After, @Ignore, @Rule and @RunWith from JUnit 4, so set-up code, rules or ignores silently do not apply.', 'Use the JUnit 5 equivalents: @BeforeEach, @AfterEach, @BeforeAll, @AfterAll, @Disabled, @ExtendWith.'],
  ko: ['JUnit 5 테스트에서 JUnit 4 어노테이션을 쓰면 안 됩니다', 'Jupiter 엔진은 JUnit 4의 @Before, @After, @Ignore, @Rule, @RunWith를 무시해 준비 코드·규칙·무시 설정이 조용히 적용되지 않습니다.', 'JUnit 5의 @BeforeEach, @AfterEach, @BeforeAll, @AfterAll, @Disabled, @ExtendWith를 쓰세요.'],
  msg: ['"@{0}" is a JUnit 4 annotation and is ignored by JUnit 5.', '"@{0}"은(는) JUnit 4 어노테이션이라 JUnit 5에서 무시됩니다.'],
  samplePath: TEST_PATH,
  on: {
    Anno(n, cx) {
      const name = A.annoName(n);
      if (!JUNIT4_ONLY.includes(name) || !isJUnit5(cx)) return;
      const imported = (cx.unit.imports || []).some((i) => i.name === 'org.junit.' + name || i.name === 'org.junit.runner.' + name || (i.star && i.name === 'org.junit'));
      if (imported || n.name === 'org.junit.' + name) cx.report(n, [name]);
    },
  },
  bad: {
    java: `import org.junit.Before;
import org.junit.jupiter.api.Test;
class OrderTest {
  @Before void setUp() { } // Noncompliant
  @Test void total() { }
}
`,
    kt: `import org.junit.Ignore
import org.junit.jupiter.api.Test
class OrderTest {
  @Ignore // Noncompliant
  @Test fun total() { }
}
`,
  },
  good: {
    java: `import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
class OrderTest {
  @BeforeEach void setUp() { }
  @Test void total() { }
}
`,
    kt: `import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
class OrderTest {
  @Disabled("flaky on CI, see #42")
  @Test fun total() { }
}
`,
  },
});

rule({
  id: 'thread-sleep-in-test', langs: JK, type: 'S', sev: 'MA', debt: 5, tags: ['tests', 'bad-practice'], sonar: 'S2925', ktSonar: 'S2925',
  en: ['"Thread.sleep" should not be used in tests', 'Sleeping makes tests slow and flaky: too short and they fail on a loaded machine, too long and the suite crawls.', 'Wait for the condition itself with Awaitility, latches or a test scheduler.'],
  ko: ['테스트에서 Thread.sleep을 쓰면 안 됩니다', '잠자기는 테스트를 느리고 불안정하게 만듭니다. 짧으면 바쁜 기계에서 실패하고 길면 전체가 느려집니다.', 'Awaitility, 래치, 테스트 스케줄러로 조건 자체를 기다리세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) { if (A.isCall(n, 'sleep', 'Thread') && cx.isTestClass()) cx.report(n); },
  },
  bad: {
    java: `class JobTest {
  @org.junit.jupiter.api.Test void runs() throws Exception {
    Job j = Job.start();
    Thread.sleep(500); // Noncompliant
    org.junit.jupiter.api.Assertions.assertTrue(j.done());
  }
}
`,
    kt: `class JobTest {
  @Test fun runs() {
    val j = Job.start()
    Thread.sleep(500) // Noncompliant
    assertTrue(j.done())
  }
}
`,
  },
  good: {
    java: `class JobTest {
  @org.junit.jupiter.api.Test void runs() {
    Job j = Job.start();
    org.awaitility.Awaitility.await().until(j::done);
  }
}
`,
    kt: `class JobTest {
  @Test fun runs() {
    val j = Job.start()
    await().until { j.done() }
  }
}
`,
  },
});

rule({
  id: 'ignored-test-without-reason', langs: JK, type: 'S', sev: 'MA', debt: 5, tags: ['tests'], sonar: 'S1607', ktSonar: 'S1607',
  en: ['Tests should not be ignored without a reason', 'A disabled test without explanation is quickly forgotten, and the behaviour it covered silently loses its safety net.', 'Give the reason in @Disabled("...") / @Ignore("..."), or fix and re-enable the test.'],
  ko: ['이유 없이 테스트를 무시하면 안 됩니다', '설명 없이 꺼 둔 테스트는 금방 잊히고 그 테스트가 지키던 동작이 조용히 안전망을 잃습니다.', '@Disabled("...") / @Ignore("...")에 이유를 적거나 고쳐서 다시 켜세요.'],
  samplePath: TEST_PATH,
  on: {
    Anno(n, cx) {
      if (!['Ignore', 'Disabled'].includes(A.annoName(n)) || (n.args && n.args.length)) return;
      cx.report(n);
    },
  },
  bad: {
    java: `class OrderTest {
  @org.junit.jupiter.api.Disabled // Noncompliant
  @org.junit.jupiter.api.Test void total() { }
}
`,
    kt: `class OrderTest {
  @Ignore // Noncompliant
  @Test fun total() { }
}
`,
  },
  good: {
    java: `class OrderTest {
  @org.junit.jupiter.api.Disabled("waits for the tax service fix, see JIRA-12")
  @org.junit.jupiter.api.Test void total() { }
}
`,
    kt: `class OrderTest {
  @Ignore("waits for the tax service fix")
  @Test fun total() { }
}
`,
  },
});

function isEqualityExpr(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'Call' && e.id === 'equals' && e.o && e.args.length === 1) return 'equals';
  if (e.k === 'Bin' && (e.op === '==' || e.op === '!=' || e.op === '===' || e.op === '!==')) return A.isNull(e.l) || A.isNull(e.r) ? 'null check' : 'equality';
  return null;
}

rule({
  id: 'assert-true-for-equality', langs: JK, type: 'S', sev: 'MA', debt: 2, tags: ['tests'], sonar: 'S5785', ktSonar: 'S5785',
  en: ['JUnit assertTrue/assertFalse should be simplified to the corresponding dedicated assertion', 'assertTrue(a.equals(b)) only reports "expected true", while assertEquals and assertNull show both values when the test fails.', 'Use assertEquals, assertNotEquals, assertSame, assertNull or assertNotNull.'],
  ko: ['JUnit assertTrue/assertFalse는 알맞은 전용 단언문으로 바꿔야 합니다', 'assertTrue(a.equals(b))는 실패 시 "true를 기대함"만 알려 주지만 assertEquals와 assertNull은 두 값을 모두 보여 줍니다.', 'assertEquals, assertNotEquals, assertSame, assertNull, assertNotNull을 쓰세요.'],
  msg: ['Use a dedicated assertion instead of "{0}" with {1}.', '{1}이(가) 들어간 "{0}" 대신 전용 단언문을 쓰세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!assertCall(n, ['assertTrue', 'assertFalse'])) return;
      for (const a of n.args) { const k = isEqualityExpr(a); if (k) { cx.report(n, [n.id, k]); return; } }
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    assertTrue(o.name().equals("x")); // Noncompliant
    assertFalse(o.owner() == null, "owner"); // Noncompliant
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    assertTrue(Order().total() == 3) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    assertEquals("x", o.name());
    assertNotNull(o.owner(), "owner");
    assertTrue(o.isOpen());
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    assertEquals(3, Order().total())
  }
}
`,
  },
});

rule({
  id: 'assertion-same-arguments', langs: JK, type: 'B', sev: 'MA', debt: 5, tags: ['tests'], sonar: 'S5863', ktSonar: 'S5863',
  en: ['Assertions should not compare an object to itself', 'Comparing a value with itself always passes (or always fails), so the assertion verifies nothing.', 'Compare the computed value with an independent expected value.'],
  ko: ['단언문에서 객체를 자기 자신과 비교하면 안 됩니다', '값을 자기 자신과 비교하면 항상 통과(또는 실패)하므로 아무것도 검증하지 않습니다.', '계산된 값을 독립적인 기대값과 비교하세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (assertCall(n, EQ_ASSERTS)) {
        const ea = expectedActual(n);
        if (ea && A.eq(ea[0], ea[1]) && !A.isLit(ea[0])) cx.report(n);
        return;
      }
      if (/^(isEqualTo|isSameAs|isNotEqualTo|isNotSameAs)$/.test(n.id) && n.args.length === 1 && n.o && A.isCall(n.o, 'assertThat') && n.o.args.length === 1 && A.eq(n.o.args[0], n.args[0])) cx.report(n);
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.assertEquals;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    assertEquals(o, o); // Noncompliant
    org.assertj.core.api.Assertions.assertThat(o).isEqualTo(o); // Noncompliant
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val o = Order()
    assertEquals(o.total(), o.total()) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.assertEquals;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    assertEquals(new Order(), o);
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val o = Order()
    assertEquals(0, o.total())
  }
}
`,
  },
});

rule({
  id: 'assertion-caught-by-catch', langs: JK, type: 'B', sev: 'CR', debt: 5, tags: ['tests'], sonar: 'S5779', ktSonar: 'S5779',
  en: ['Assertion methods should not be used within the try block of a try-catch catching an Error', 'A failing assertion throws AssertionError; a surrounding catch of Error or Throwable swallows it and the test passes anyway.', 'Move the assertion out of the try block, or catch the specific exception type expected.'],
  ko: ['Error를 잡는 try-catch의 try 블록 안에서 단언 메서드를 쓰면 안 됩니다', '실패한 단언은 AssertionError를 던지는데 바깥의 Error나 Throwable catch가 이를 삼켜 테스트가 그대로 통과합니다.', '단언문을 try 블록 밖으로 옮기거나 기대하는 구체적인 예외만 잡으세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!/^(assert|fail)/.test(n.id || '') || (n.o && !ASSERT_HOLDERS.test(A.simpleName(A.dotted(n.o) || '')))) return;
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'Method' || x.k === 'Lambda' || x.k === 'Class') return;
        if (x.k === 'Try' && cx.stack[i + 1] === x.body) {
          if (x.catches.some((c) => c.types.some((t) => /^(Throwable|Error|AssertionError|AssertionFailedError)$/.test(A.typeName(t))))) { cx.report(n); return; }
        }
      }
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    try {
      new Order().close();
      fail("should have thrown"); // Noncompliant
    } catch (Throwable expected) {
      assertNotNull(expected);
    }
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    try {
      assertEquals(1, Order().total()) // Noncompliant
    } catch (e: AssertionError) {
      println(e)
    }
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    try {
      new Order().close();
      fail("should have thrown");
    } catch (IllegalStateException expected) {
      assertNotNull(expected);
    }
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    assertEquals(1, Order().total())
  }
}
`,
  },
});

const ASSERTJ_NEUTRAL = new Set(['assertThat', 'assertThatThrownBy', 'assertThatCode', 'assertThatExceptionOfType', 'assertThatObject', 'as', 'describedAs', 'withFailMessage', 'overridingErrorMessage', 'usingComparator', 'usingRecursiveComparison', 'withThreadDumpOnError', 'inHexadecimal', 'inBinary']);

rule({
  id: 'assertj-incomplete-assertion', langs: JK, type: 'B', sev: 'CR', debt: 2, tags: ['tests', 'assertj'], sonar: 'S2970', ktSonar: 'S2970',
  en: ['Assertions should be complete', 'assertThat(x) on its own only creates an assertion object; without a following check such as isEqualTo() nothing is verified.', 'Chain the intended check, e.g. assertThat(x).isEqualTo(expected).'],
  ko: ['단언문은 완전해야 합니다', 'assertThat(x)만 쓰면 단언 객체를 만들 뿐이고 isEqualTo() 같은 검사가 이어지지 않으면 아무것도 검증하지 않습니다.', '의도한 검사를 이어 쓰세요. 예: assertThat(x).isEqualTo(expected).'],
  samplePath: TEST_PATH,
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call') return;
      let x = e;
      while (x && x.k === 'Call' && ASSERTJ_NEUTRAL.has(x.id) && x.o && x.o.k === 'Call') x = A.strip(x.o);
      if (!x || x.k !== 'Call' || !/^assertThat/.test(x.id) || !ASSERTJ_NEUTRAL.has(e.id)) return;
      if (x.o && !/^(Assertions|BDDAssertions|WithAssertions)$/.test(A.simpleName(A.dotted(x.o) || ''))) return;
      if (!/assertj|Assertions/.test(cx.src)) return;
      cx.report(e);
    },
  },
  bad: {
    java: `import static org.assertj.core.api.Assertions.assertThat;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    assertThat(new Order().total()); // Noncompliant
    assertThat(new Order().name()).as("name"); // Noncompliant
  }
}
`,
    kt: `import org.assertj.core.api.Assertions.assertThat
class OrderTest {
  @Test fun t() {
    assertThat(Order().total()) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.assertj.core.api.Assertions.assertThat;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    assertThat(new Order().total()).isZero();
    assertThat(new Order().name()).as("name").isEqualTo("none");
  }
}
`,
    kt: `import org.assertj.core.api.Assertions.assertThat
class OrderTest {
  @Test fun t() {
    assertThat(Order().total()).isEqualTo(0)
  }
}
`,
  },
});

const MATCHERS = /^(any\w*|eq|same|isA|isNull|isNotNull|notNull|argThat|intThat|booleanThat|charThat|byteThat|shortThat|longThat|floatThat|doubleThat|contains|matches|startsWith|endsWith|refEq|nullable|anyVararg)$/;

function isMatcher(e) {
  e = A.strip(e);
  if (!e || e.k !== 'Call' || !MATCHERS.test(e.id || '')) return false;
  return !e.o || /^(ArgumentMatchers|Mockito|Matchers|AdditionalMatchers|MockitoHamcrest)$/.test(A.simpleName(A.dotted(e.o) || ''));
}

function stubbedCall(n) {
  if (['when', 'given', 'whenever'].includes(n.id) && !n.o && n.args.length === 1) {
    const c = A.strip(n.args[0]);
    return c && c.k === 'Call' && c.o ? c : null;
  }
  if (n.o && A.isCall(n.o, 'verify') && A.strip(n.o).args.length >= 1) return n;
  return null;
}

rule({
  id: 'mockito-matchers-mixed', langs: JK, type: 'B', sev: 'CR', debt: 5, tags: ['tests', 'mockito'], sonar: 'S6073', ktSonar: 'S6073',
  en: ['Mockito argument matchers should be used on all parameters', 'Mockito requires either matchers for every argument or raw values for all of them; mixing both throws InvalidUseOfMatchersException at run time.', 'Wrap the raw values in eq(...), or use raw values everywhere.'],
  ko: ['Mockito 인자 매처는 모든 매개변수에 써야 합니다', 'Mockito는 모든 인자에 매처를 쓰거나 모두 원시 값을 쓰기를 요구해 섞으면 실행 시점에 InvalidUseOfMatchersException이 납니다.', '원시 값을 eq(...)로 감싸거나 모두 원시 값을 쓰세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      const c = stubbedCall(n);
      if (!c || !c.args.length) return;
      const m = c.args.filter(isMatcher).length;
      if (m > 0 && m < c.args.length) cx.report(c);
    },
  },
  bad: {
    java: `import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Repo repo = mock(Repo.class);
    when(repo.find(anyString(), 3)).thenReturn(null); // Noncompliant
    verify(repo).save(any(), "x"); // Noncompliant
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val repo = mock(Repo::class.java)
    whenever(repo.find(any(), 3)).thenReturn(null) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Repo repo = mock(Repo.class);
    when(repo.find(anyString(), eq(3))).thenReturn(null);
    verify(repo).save("y", "x");
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val repo = mock(Repo::class.java)
    whenever(repo.find(any(), eq(3))).thenReturn(null)
  }
}
`,
  },
});

rule({
  id: 'assert-throws-multiple-calls', langs: JK, type: 'S', sev: 'MA', debt: 10, tags: ['tests'], sonar: 'S5778', ktSonar: 'S5778',
  en: ['Only one method invocation is expected when testing runtime exceptions', 'When the lambda of assertThrows contains several calls, the test also passes if the exception comes from the set-up call instead of the one under test.', 'Prepare the arguments before assertThrows and keep a single call inside the lambda.'],
  ko: ['런타임 예외를 테스트할 때는 메서드 호출이 하나여야 합니다', 'assertThrows 람다에 호출이 여럿이면 테스트 대상이 아닌 준비 호출에서 예외가 나도 테스트가 통과합니다.', '인자는 assertThrows 전에 준비하고 람다 안에는 호출 하나만 두세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!['assertThrows', 'assertThatThrownBy', 'assertFailsWith', 'shouldThrow'].includes(n.id)) return;
      const l = n.args.map(A.strip).find((a) => a && a.k === 'Lambda');
      if (!l || !l.body) return;
      const calls = A.findAll(l.body, (x) => x.k === 'Call' && !A.ctorType(x) && !!x.id, { noLambda: true });
      if (calls.length > 1) cx.report(n);
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.assertThrows;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    assertThrows(IllegalStateException.class, () -> o.pay(o.total())); // Noncompliant
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val o = Order()
    assertThrows<IllegalStateException> { // Noncompliant
      o.add(1)
      o.close()
    }
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.assertThrows;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    Order o = new Order();
    int total = o.total();
    assertThrows(IllegalStateException.class, () -> o.pay(total));
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    val o = Order()
    o.add(1)
    assertThrows<IllegalStateException> { o.close() }
  }
}
`,
  },
});

rule({
  id: 'junit5-inner-class-not-nested', langs: JK, type: 'B', sev: 'CR', debt: 5, tags: ['tests', 'junit'], sonar: 'S5790', ktSonar: 'S5790',
  en: ['JUnit 5 inner test classes should be annotated with @Nested', 'JUnit Jupiter only runs the tests of an inner (non-static) class when it carries @Nested; otherwise they never execute.', 'Annotate the inner class with @Nested.'],
  ko: ['JUnit 5 내부 테스트 클래스에는 @Nested를 붙여야 합니다', 'JUnit Jupiter는 @Nested가 있을 때만 내부(non-static) 클래스의 테스트를 실행하므로 없으면 전혀 실행되지 않습니다.', '내부 클래스에 @Nested를 붙이세요.'],
  samplePath: TEST_PATH,
  on: {
    Class(n, cx) {
      const outer = cx.parent(1);
      if (!outer || outer.k !== 'Class' || !isJUnit5(cx) || A.hasAnno(n, 'Nested') || n.kind !== 'class') return;
      const inner = cx.kt ? !!(n.mods && n.mods.has('inner')) : !(n.mods && n.mods.has('static'));
      if (!inner || (n.mods && n.mods.has('abstract'))) return;
      if (H.classMethods(n).some(isTestMethod)) cx.report(namePos(n));
    },
  },
  bad: {
    java: `import org.junit.jupiter.api.Test;
class OrderTest {
  class WhenEmpty { // Noncompliant
    @Test void total() { }
  }
}
`,
    kt: `import org.junit.jupiter.api.Test
class OrderTest {
  inner class WhenEmpty { // Noncompliant
    @Test fun total() { }
  }
}
`,
  },
  good: {
    java: `import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
class OrderTest {
  @Nested class WhenEmpty {
    @Test void total() { }
  }
  static class Fixture { }
}
`,
    kt: `import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
class OrderTest {
  @Nested inner class WhenEmpty {
    @Test fun total() { }
  }
}
`,
  },
});

const PROD_ASSERTS = ['assertThat', 'assertEquals', 'assertNotEquals', 'assertTrue', 'assertFalse', 'assertNull', 'assertNotNull', 'assertSame', 'assertNotSame', 'assertArrayEquals', 'assertThrows', 'fail'];

rule({
  id: 'test-assertion-in-production', langs: JK, type: 'S', sev: 'MA', debt: 5, tags: ['tests', 'bad-practice'], sonar: 'S5960', ktSonar: 'S5960',
  en: ['Assertions should not be used in production code', 'Test-framework assertions in main code drag the test library into production and throw AssertionError, which normal error handling does not expect.', 'Validate with exceptions such as IllegalArgumentException, Objects.requireNonNull or Kotlin require/check.'],
  ko: ['운영 코드에서 테스트 단언문을 쓰면 안 됩니다', '메인 코드의 테스트 프레임워크 단언문은 테스트 라이브러리를 운영 환경에 끌어들이고 일반 오류 처리가 예상하지 않는 AssertionError를 던집니다.', 'IllegalArgumentException, Objects.requireNonNull, Kotlin require/check 같은 예외로 검증하세요.'],
  on: {
    Call(n, cx) {
      if (isTestPath(cx.file) || !assertCall(n, PROD_ASSERTS)) return;
      if (!/import\s+(static\s+)?(org\.junit|org\.assertj|org\.hamcrest|org\.testng|kotlin\.test)/.test(cx.src)) return;
      cx.report(n);
    },
  },
  bad: {
    java: `import static org.junit.Assert.assertNotNull;
class OrderService {
  void save(Object o) {
    assertNotNull(o); // Noncompliant
  }
}
`,
    kt: `import kotlin.test.assertTrue
class OrderService {
  fun save(total: Int) {
    assertTrue(total > 0) // Noncompliant
  }
}
`,
  },
  good: {
    java: `class OrderService {
  void save(Object o) {
    java.util.Objects.requireNonNull(o);
  }
}
`,
    kt: `class OrderService {
  fun save(total: Int) {
    require(total > 0)
  }
}
`,
  },
});

rule({
  id: 'test-class-without-tests', langs: JK, type: 'S', sev: 'BL', debt: 5, tags: ['tests'], sonar: 'S2187', ktSonar: 'S2187',
  en: ['Test classes should comply with a naming convention and contain tests', 'A class named like a test but without any test method runs nothing and gives the false impression that the code is covered.', 'Add tests, rename the class, or make it abstract if it is a base class.'],
  ko: ['테스트 클래스에는 테스트가 있어야 합니다', '테스트처럼 이름 지은 클래스에 테스트 메서드가 없으면 아무것도 실행되지 않으면서 테스트된 것처럼 보입니다.', '테스트를 추가하거나 이름을 바꾸거나 기반 클래스라면 abstract로 만드세요.'],
  msg: ['Add some tests to this class "{0}".', '이 클래스 "{0}"에 테스트를 추가하세요.'],
  samplePath: TEST_PATH,
  on: {
    Class(n, cx) {
      if (!n.name || !/(Test|Tests|TestCase)$/.test(n.name) || n.kind !== 'class' || (n.mods && n.mods.has('abstract'))) return;
      if (!/import\s+(static\s+)?(org\.junit|org\.testng|kotlin\.test|io\.kotest)/.test(cx.src) || H.findMethod(n, 'main')) return;
      if (cx.parent(1) !== cx.unit || n.ext || A.hasAnno(n, ['RunWith', 'Suite', 'SelectClasses', 'SelectPackages', 'Cucumber', 'CucumberOptions', 'IncludeEngines', 'Nested'])) return;
      const has = (c) => c.members.some((m) => isTestMethod(m) || (m.k === 'Class' && has(m)));
      if (!has(n)) cx.report(namePos(n), [n.name]);
    },
  },
  bad: {
    java: `import org.junit.jupiter.api.Assertions;
class OrderTest { // Noncompliant
  void total() { }
}
`,
    kt: `import kotlin.test.assertEquals
class OrderTest { // Noncompliant
  fun total() { }
}
`,
  },
  good: {
    java: `class OrderTest {
  @org.junit.jupiter.api.Test void total() { }
}
abstract class BaseTest { }
`,
    kt: `class OrderTest {
  @Test fun total() { }
}
`,
  },
});

rule({
  id: 'assertj-simplifiable', langs: JK, type: 'S', sev: 'MI', debt: 2, tags: ['tests', 'assertj'], sonar: 'S5838', ktSonar: 'S5838',
  en: ['Chained AssertJ assertions should be simplified to the corresponding dedicated assertion', 'assertThat(list.size()).isEqualTo(0) or assertThat(a.equals(b)).isTrue() fail with messages that hide the actual content.', 'Use the dedicated assertion: hasSize(), isEmpty(), isEqualTo(), isNull(), contains(), startsWith() ...'],
  ko: ['AssertJ 연쇄 단언문은 알맞은 전용 단언문으로 단순화해야 합니다', 'assertThat(list.size()).isEqualTo(0)이나 assertThat(a.equals(b)).isTrue()는 실패 시 실제 내용을 감추는 메시지를 냅니다.', 'hasSize(), isEmpty(), isEqualTo(), isNull(), contains(), startsWith() 같은 전용 단언문을 쓰세요.'],
  msg: ['Use "{0}" instead.', '대신 "{0}"을(를) 쓰세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!/^(isTrue|isFalse|isEqualTo|isZero|isNotZero|isNotEqualTo)$/.test(n.id) || !n.o || !A.isCall(n.o, 'assertThat') || A.strip(n.o).args.length !== 1) return;
      const a = A.strip(A.strip(n.o).args[0]);
      if (!a) return;
      const bool = n.id === 'isTrue' || n.id === 'isFalse';
      let s = null;
      if (bool && a.k === 'Call' && a.o) {
        const map = { equals: 'isEqualTo', isEmpty: 'isEmpty', contains: 'contains', startsWith: 'startsWith', endsWith: 'endsWith', containsKey: 'containsKey', isBlank: 'isBlank', matches: 'matches' };
        const neg = { equals: 'isNotEqualTo', isEmpty: 'isNotEmpty', contains: 'doesNotContain', startsWith: 'doesNotStartWith', endsWith: 'doesNotEndWith', containsKey: 'doesNotContainKey', isBlank: 'isNotBlank', matches: 'doesNotMatch' };
        const m = n.id === 'isFalse' ? neg[a.id] : map[a.id];
        if (m) s = m + '()';
      } else if (bool && a.k === 'Bin' && (A.isNull(a.l) || A.isNull(a.r))) s = (a.op === '==') === (n.id === 'isTrue') ? 'isNull()' : 'isNotNull()';
      else if (!bool && ((a.k === 'Call' && /^(size|length|count)$/.test(a.id) && a.args.length === 0) || (a.k === 'Sel' && /^(size|length)$/.test(a.id)))) s = n.id === 'isZero' || (n.id === 'isEqualTo' && A.isLit(n.args[0]) && n.args[0].v === 0) ? 'isEmpty()' : 'hasSize()';
      if (s) cx.report(n, [s]);
    },
  },
  bad: {
    java: `import static org.assertj.core.api.Assertions.assertThat;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    java.util.List<String> xs = new Order().lines();
    assertThat(xs.size()).isEqualTo(2); // Noncompliant
    assertThat(xs.isEmpty()).isFalse(); // Noncompliant
    assertThat(new Order().owner() == null).isTrue(); // Noncompliant
  }
}
`,
    kt: `import org.assertj.core.api.Assertions.assertThat
class OrderTest {
  @Test fun t() {
    val xs = Order().lines()
    assertThat(xs.size).isZero() // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.assertj.core.api.Assertions.assertThat;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    java.util.List<String> xs = new Order().lines();
    assertThat(xs).hasSize(2);
    assertThat(xs).isNotEmpty();
    assertThat(new Order().owner()).isNull();
  }
}
`,
    kt: `import org.assertj.core.api.Assertions.assertThat
class OrderTest {
  @Test fun t() {
    val xs = Order().lines()
    assertThat(xs).isEmpty()
  }
}
`,
  },
});

rule({
  id: 'boolean-literal-in-assertion', langs: JK, type: 'S', sev: 'CR', debt: 5, tags: ['tests'], sonar: 'S2701', ktSonar: 'S2701',
  en: ['Literal boolean values should not be used in assertions', 'assertTrue(true) can never fail and assertEquals(true, x) hides the meaning; both are usually left-overs or mistakes.', 'Assert the real condition with assertTrue(x) / assertFalse(x), or remove the assertion.'],
  ko: ['단언문에 불리언 리터럴을 쓰면 안 됩니다', 'assertTrue(true)는 절대 실패하지 않고 assertEquals(true, x)는 의미를 흐립니다. 보통 남은 코드이거나 실수입니다.', '실제 조건을 assertTrue(x) / assertFalse(x)로 단언하거나 단언문을 지우세요.'],
  samplePath: TEST_PATH,
  on: {
    Call(n, cx) {
      if (!assertCall(n, ['assertTrue', 'assertFalse', 'assertEquals', 'assertNotEquals', 'assertSame', 'assertNotSame', 'assertNull', 'assertNotNull'])) return;
      if (n.args.some((a) => A.isBoolLit(a))) cx.report(n);
    },
  },
  bad: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    assertTrue(true); // Noncompliant
    assertEquals(true, new Order().isOpen()); // Noncompliant
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    assertEquals(false, Order().isOpen()) // Noncompliant
  }
}
`,
  },
  good: {
    java: `import static org.junit.jupiter.api.Assertions.*;
class OrderTest {
  @org.junit.jupiter.api.Test void t() {
    assertTrue(new Order().isOpen());
  }
}
`,
    kt: `class OrderTest {
  @Test fun t() {
    assertFalse(Order().isOpen())
  }
}
`,
  },
});

module.exports = { isTestPath, isJUnit5, isTestMethod, TEST_PATH, annoStrings };
