'use strict';

// Rails / Brakeman-style checks that work on the syntax tree alone:
// mass assignment, CSRF, XSS escapes, SQL built from strings, cookies,
// SSL and production configuration, CORS, validation regexes.

const { rule } = require('./core');
const A = require('../ast');
const H = require('./h');
const { dynamicString } = require('./security');

const isParams = (n) => {
  n = A.strip(n);
  if (!n) return false;
  if (A.isVcall(n, 'params')) return true;
  if (n.type === 'Call' && n.name === '[]' && n.recv && isParams(n.recv)) return true;
  if (n.type === 'Call' && n.recv && isParams(n.recv) && /^(?:fetch|to_unsafe_h|to_h|require|dig)$/.test(n.name)) return n.name !== 'require' || true;
  return false;
};
const permitted = (n) => {
  for (let x = A.strip(n); x && x.type === 'Call'; x = x.recv) if (x.name === 'permit' || x.name === 'slice' || x.name === 'expect') return true;
  return false;
};

rule({
  id: 'permit-all-parameters', type: 'V', sev: 'CR', debt: 15, tags: ['rails', 'cwe-915', 'owasp-a08'],
  en: ['Strong parameters should not be bypassed with "permit!"', 'permit! marks every request parameter as allowed, so a user can set any attribute such as admin or role (mass assignment).', 'List the allowed attributes with permit(:name, :email, ...).'],
  ko: ['"permit!"로 strong parameters를 우회하지 않아야 합니다', 'permit!은 모든 요청 매개변수를 허용해서 사용자가 admin, role 같은 아무 속성이나 설정할 수 있습니다(대량 할당).', 'permit(:name, :email, ...)으로 허용할 속성을 나열합니다.'],
  msg: ['Specify the permitted attributes instead of calling "permit!".', '"permit!"을 호출하지 말고 허용할 속성을 지정합니다.'],
  samplePath: 'app/controllers/users_controller.rb',
  on: {
    Call(n, cx) {
      if (n.name === 'permit!' && n.recv) cx.report(n);
    },
  },
  bad: `class UsersController < ApplicationController
  def user_params
    params.require(:user).permit! # Noncompliant
  end
end
`,
  good: `class UsersController < ApplicationController
  def user_params
    params.require(:user).permit(:name, :email)
  end
end
`,
});

const MASS_METHODS = new Set(['new', 'create', 'create!', 'update', 'update!', 'update_attributes', 'update_attributes!', 'assign_attributes', 'attributes=', 'build', 'first_or_create', 'first_or_initialize', 'find_or_create_by', 'find_or_initialize_by', 'insert', 'upsert', 'where']);

rule({
  id: 'unfiltered-params-mass-assignment', type: 'H', sev: 'CR', debt: 15, tags: ['rails', 'cwe-915', 'owasp-a08'],
  en: ['Request parameters should not be passed unfiltered to model attribute methods', 'Passing params[...] straight to new / create / update lets a user set any column (mass assignment).', 'Filter the hash with params.require(...).permit(...) first.'],
  ko: ['요청 매개변수를 거르지 않고 모델 속성 메서드에 넘기지 않아야 합니다', 'params[...]를 new / create / update에 그대로 넘기면 사용자가 아무 열이나 설정할 수 있습니다(대량 할당).', '먼저 params.require(...).permit(...)으로 해시를 거릅니다.'],
  msg: ['Filter the parameters passed to "{0}" with "permit".', '"{0}"에 넘기는 매개변수를 "permit"으로 거릅니다.'],
  samplePath: 'app/controllers/posts_controller.rb',
  on: {
    Call(n, cx) {
      if (!MASS_METHODS.has(n.name) || !n.recv || !n.args.length) return;
      const a = n.args[0];
      if (n.name === 'where') return;
      if (isParams(a) && !permitted(a) && !(a.type === 'Call' && a.name === '[]' && a.args.length === 1 && /(_?id|page|q)$/.test(A.symOrStr(a.args[0]) || ''))) cx.report(n, [n.name]);
    },
    Assign(n, cx) {
      if (n.target.type === 'Call' && n.target.name === 'attributes' && isParams(n.value) && !permitted(n.value)) cx.report(n, ['attributes=']);
    },
  },
  bad: `class PostsController < ApplicationController
  def create
    @post = Post.new(params[:post]) # Noncompliant
    @post.update(params) # Noncompliant
  end
end
`,
  good: `class PostsController < ApplicationController
  def create
    @post = Post.new(post_params)
    @post.update(params.require(:post).permit(:title))
  end
end
`,
});

rule({
  id: 'attr-accessible', type: 'S', sev: 'MA', debt: 30, tags: ['rails', 'obsolete', 'cwe-915'],
  en: ['"attr_accessible" and "attr_protected" should not be used', 'These Rails 3 mass-assignment lists were removed in Rails 4; black-lists (attr_protected) also miss new columns.', 'Use strong parameters in the controller (params.require(...).permit(...)).'],
  ko: ['"attr_accessible"과 "attr_protected"를 쓰지 않아야 합니다', 'Rails 3의 대량 할당 목록은 Rails 4에서 없어졌고, 블랙리스트(attr_protected)는 새 열을 놓칩니다.', '컨트롤러에서 strong parameters(params.require(...).permit(...))를 씁니다.'],
  msg: ['Replace "{0}" by strong parameters in the controller.', '"{0}"를 컨트롤러의 strong parameters로 바꿉니다.'],
  samplePath: 'app/models/user.rb',
  on: {
    Call(n, cx) {
      if (!n.recv && (n.name === 'attr_accessible' || n.name === 'attr_protected')) cx.report(n, [n.name]);
    },
  },
  bad: `class User < ActiveRecord::Base
  attr_accessible :name, :email # Noncompliant
end
`,
  good: `class User < ApplicationRecord
  attr_accessor :remember_me
end
`,
});

rule({
  id: 'csrf-protection-disabled', type: 'H', sev: 'CR', debt: 15, ref: 'S4502', tags: ['rails', 'cwe-352', 'owasp-a01'],
  en: ['Disabling CSRF protections is security-sensitive', 'Skipping verify_authenticity_token lets other sites submit forms on behalf of logged-in users.', 'Keep CSRF protection; for token-authenticated APIs use protect_from_forgery with: :null_session in an API base controller.'],
  ko: ['CSRF 보호를 끄는 것은 보안에 민감합니다', 'verify_authenticity_token을 건너뛰면 다른 사이트가 로그인한 사용자 대신 양식을 제출할 수 있습니다.', 'CSRF 보호를 유지하고, 토큰 인증 API라면 API 기본 컨트롤러에서 protect_from_forgery with: :null_session을 씁니다.'],
  msg: ['Make sure disabling CSRF protection is safe here.', '여기서 CSRF 보호를 꺼도 안전한지 확인합니다.'],
  samplePath: 'app/controllers/hooks_controller.rb',
  on: {
    'Call|Ident'(n, cx) {
      if (n.type === 'Ident') { if (!n.lvar && n.name === 'skip_forgery_protection') cx.report(n); return; }
      if (n.recv) return;
      if (n.name === 'skip_forgery_protection') { cx.report(n); return; }
      if ((n.name === 'skip_before_action' || n.name === 'skip_before_filter' || n.name === 'skip_action_callback') && n.args.some((a) => A.symOrStr(a) === 'verify_authenticity_token')) cx.report(n);
      if (n.name === 'protect_from_forgery') {
        const kw = A.kwargs(n);
        const p = kw && A.hashGet(kw, 'if');
        if (p && p.value.type === 'False') cx.report(n);
      }
    },
    Assign(n, cx) {
      if (n.target.type === 'Call' && n.target.name === 'allow_forgery_protection' && n.value.type === 'False' && !/(?:^|\/)config\/environments\/test\.rb$/.test(cx.path)) cx.report(n);
    },
  },
  bad: `class HooksController < ApplicationController
  skip_before_action :verify_authenticity_token # Noncompliant
end
`,
  good: `class HooksController < ApplicationController
  protect_from_forgery with: :exception
  skip_before_action :authenticate_user!
end
`,
});

rule({
  id: 'csrf-protection-missing', type: 'H', sev: 'MI', debt: 10, ref: 'S4502', tags: ['rails', 'cwe-352', 'owasp-a01'],
  en: ['ApplicationController should enable CSRF protection', 'Apps upgraded from Rails < 5.2 or with default_protect_from_forgery turned off have no CSRF check unless protect_from_forgery is called.', 'Call protect_from_forgery with: :exception in ApplicationController.'],
  ko: ['ApplicationController에서 CSRF 보호를 켜야 합니다', 'Rails 5.2 미만에서 올렸거나 default_protect_from_forgery를 끈 앱은 protect_from_forgery를 호출하지 않으면 CSRF 검사를 하지 않습니다.', 'ApplicationController에서 protect_from_forgery with: :exception을 호출합니다.'],
  msg: ['Make sure CSRF protection is enabled for "{0}".', '"{0}"에서 CSRF 보호가 켜져 있는지 확인합니다.'],
  samplePath: 'app/controllers/application_controller.rb',
  on: {
    Class(n, cx) {
      if (n.path.name !== 'ApplicationController' || A.constPath(n.superclass) !== 'ActionController::Base') return;
      let found = false;
      A.walk(n.body, (x) => {
        if ((x.type === 'Call' || x.type === 'Ident') && /^(?:protect_from_forgery|skip_forgery_protection)$/.test(x.name)) found = true;
        return !found;
      });
      if (!found) cx.report(n, [n.path.name]);
    },
  },
  bad: `class ApplicationController < ActionController::Base # Noncompliant
  before_action :authenticate_user!
end
`,
  good: `class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
end
`,
});

rule({
  id: 'html-safe', type: 'H', sev: 'MA', debt: 10, ref: 'S5247', tags: ['rails', 'cwe-79', 'owasp-a03'],
  en: ['Disabling HTML auto-escaping is security-sensitive', 'html_safe and raw() mark a string as trusted HTML; if it contains user data this is cross-site scripting.', 'Keep auto-escaping, use sanitize(...) or content_tag / safe_join to build HTML.'],
  ko: ['HTML 자동 이스케이프를 끄는 것은 보안에 민감합니다', 'html_safe와 raw()는 문자열을 믿을 수 있는 HTML로 표시하며, 사용자 데이터가 섞이면 크로스 사이트 스크립팅이 됩니다.', '자동 이스케이프를 유지하고 sanitize(...)나 content_tag / safe_join으로 HTML을 만듭니다.'],
  msg: ['Make sure disabling auto-escaping with "{0}" is safe here.', '"{0}"로 자동 이스케이프를 꺼도 안전한지 확인합니다.'],
  samplePath: 'app/helpers/users_helper.rb',
  on: {
    Call(n, cx) {
      if (n.name === 'html_safe' && n.recv && !n.args.length) {
        if (n.recv.type === 'Str' && !n.recv.interp) return;
        cx.report(n, ['html_safe']);
      } else if (n.name === 'raw' && !n.recv && n.args.length === 1 && !(n.args[0].type === 'Str' && !n.args[0].interp)) {
        cx.report(n, ['raw']);
      }
    },
  },
  bad: `module UsersHelper
  def bio(user)
    "<p>#{user.bio}</p>".html_safe # Noncompliant
  end
  def note(text) = raw(text) # Noncompliant
end
`,
  good: `module UsersHelper
  def bio(user)
    content_tag(:p, user.bio)
  end
  def sep = "<hr>".html_safe
end
`,
});

const SQL_METHODS = new Set(['find_by_sql', 'count_by_sql', 'where', 'not', 'rewhere', 'order', 'reorder', 'group', 'having', 'joins', 'select', 'pluck', 'from', 'exists?', 'delete_all', 'update_all', 'destroy_all', 'lock', 'execute', 'exec_query', 'exec_update', 'exec_delete', 'select_all', 'select_one', 'select_value', 'select_values', 'select_rows', 'find_by', 'calculate', 'sum', 'minimum', 'maximum', 'average']);

rule({
  id: 'sql-string-interpolation', type: 'H', sev: 'CR', debt: 20, ref: 'S2077', tags: ['rails', 'cwe-89', 'owasp-a03'],
  en: ['Formatting SQL queries is security-sensitive', 'Interpolating values into SQL fragments passed to where, order, find_by_sql, execute... allows SQL injection.', 'Use placeholders (where("name = ?", name)), hash conditions (where(name: name)) or sanitize_sql_*.'],
  ko: ['SQL 쿼리를 문자열로 조립하는 것은 보안에 민감합니다', 'where, order, find_by_sql, execute 등에 넘기는 SQL 조각에 값을 보간하면 SQL 주입이 가능합니다.', '자리표시자(where("name = ?", name)), 해시 조건(where(name: name)), sanitize_sql_*을 씁니다.'],
  msg: ['Make sure that formatting this SQL query passed to "{0}" is safe here.', '"{0}"에 넘기는 SQL 쿼리를 이렇게 조립해도 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      if (!SQL_METHODS.has(n.name) || !n.args.length) return;
      if (!n.recv && n.name !== 'find_by_sql' && n.name !== 'execute') return;
      if ((n.name === 'select' || n.name === 'sum' || n.name === 'find_by') && n.block) return;
      if (dynamicString(n.args[0])) cx.report(n.args[0], [n.name]);
    },
  },
  bad: `def search(name, sort)
  User.where("name = '#{name}'") # Noncompliant
  User.order("#{sort} DESC") # Noncompliant
  ActiveRecord::Base.connection.execute("DELETE FROM t WHERE id = " + name) # Noncompliant
end
`,
  good: `def search(name)
  User.where("name = ?", name)
  User.where(name: name).order(created_at: :desc)
end
`,
});

const cookieContext = (n) => {
  for (let p = n.parent; p; p = p.parent) {
    if (p.type === 'Assign' && p.target.type === 'Call' && p.target.name === '[]' && p.target.recv && /cookies|cookie_jar/.test(A.isVcall(p.target.recv) ? (p.target.recv.name || '') : (p.target.recv.name || ''))) return true;
    if (p.type === 'Call' && /^(?:set_cookie|session_store|cookie_store|cookies)$/.test(p.name)) return true;
    if (p.type === 'Assign' && p.target.type === 'Call' && /^(?:session_store|session_options)$/.test(p.target.name)) return true;
    if (p.type === 'Def' || p.type === 'Class') return false;
  }
  return false;
};

rule({
  id: 'cookie-without-httponly', type: 'H', sev: 'MI', debt: 10, ref: 'S3330', tags: ['rails', 'cwe-1004', 'owasp-a05'],
  en: ['Creating cookies without the "HttpOnly" flag is security-sensitive', 'Without HttpOnly, any injected script can read the cookie (for example the session id).', 'Remove "httponly: false"; Rails sets HttpOnly by default.'],
  ko: ['"HttpOnly" 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'HttpOnly가 없으면 주입된 스크립트가 쿠키(예: 세션 ID)를 읽을 수 있습니다.', '"httponly: false"를 지웁니다. Rails는 기본으로 HttpOnly를 설정합니다.'],
  msg: ['Make sure creating this cookie without the "HttpOnly" flag is safe.', '"HttpOnly" 플래그 없이 이 쿠키를 만들어도 안전한지 확인합니다.'],
  on: {
    Pair(n, cx) {
      if (A.symOrStr(n.key) === 'httponly' && n.value && n.value.type === 'False' && cookieContext(n)) cx.report(n);
    },
  },
  bad: `def remember(user)
  cookies[:token] = { value: user.token, httponly: false } # Noncompliant
end
`,
  good: `def remember(user)
  cookies[:token] = { value: user.token, httponly: true, secure: true }
end
`,
});

rule({
  id: 'cookie-without-secure', type: 'H', sev: 'MI', debt: 10, ref: 'S2092', tags: ['rails', 'cwe-311', 'cwe-315', 'cwe-614', 'owasp-a05'],
  en: ['Creating cookies without the "secure" flag is security-sensitive', 'A cookie without the secure flag is also sent over plain HTTP, where it can be intercepted.', 'Set "secure: true" (or rely on config.force_ssl).'],
  ko: ['"secure" 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'secure 플래그가 없는 쿠키는 평문 HTTP로도 전송되어 가로챌 수 있습니다.', '"secure: true"를 설정하거나 config.force_ssl을 씁니다.'],
  msg: ['Make sure creating this cookie without the "secure" flag is safe.', '"secure" 플래그 없이 이 쿠키를 만들어도 안전한지 확인합니다.'],
  on: {
    Pair(n, cx) {
      if (A.symOrStr(n.key) === 'secure' && n.value && n.value.type === 'False' && cookieContext(n)) cx.report(n);
    },
  },
  bad: `def remember(user)
  cookies[:token] = { value: user.token, secure: false } # Noncompliant
end
`,
  good: `def remember(user)
  cookies[:token] = { value: user.token, secure: true }
end
`,
});

rule({
  id: 'force-ssl-disabled', type: 'H', sev: 'MA', debt: 5, tags: ['rails', 'cwe-311', 'owasp-a02'],
  en: ['Disabling "force_ssl" in production is security-sensitive', 'Without force_ssl, the app accepts plain HTTP and cookies are not marked secure.', 'Set config.force_ssl = true in production.'],
  ko: ['운영 환경에서 "force_ssl"을 끄는 것은 보안에 민감합니다', 'force_ssl이 없으면 앱이 평문 HTTP를 받아들이고 쿠키에 secure가 붙지 않습니다.', '운영 환경에서 config.force_ssl = true로 설정합니다.'],
  msg: ['Make sure disabling "force_ssl" is safe here.', '여기서 "force_ssl"을 꺼도 안전한지 확인합니다.'],
  samplePath: 'config/environments/production.rb',
  on: {
    Assign(n, cx) {
      if (n.target.type === 'Call' && n.target.name === 'force_ssl' && n.value.type === 'False' && !/(?:development|test)\.rb$/.test(cx.path)) cx.report(n);
    },
  },
  bad: `Rails.application.configure do
  config.force_ssl = false # Noncompliant
end
`,
  good: `Rails.application.configure do
  config.force_ssl = true
end
`,
});

rule({
  id: 'debug-mode-production', type: 'H', sev: 'MA', debt: 5, ref: 'S4507', tags: ['rails', 'cwe-489', 'cwe-215', 'owasp-a05'],
  en: ['Delivering code in production with debug features activated is security-sensitive', 'consider_all_requests_local = true shows full stack traces and internals to every visitor.', 'Set config.consider_all_requests_local = false in production.'],
  ko: ['디버그 기능을 켠 채로 운영에 배포하는 것은 보안에 민감합니다', 'consider_all_requests_local = true는 모든 방문자에게 전체 스택 추적과 내부 정보를 보여 줍니다.', '운영 환경에서 config.consider_all_requests_local = false로 설정합니다.'],
  msg: ['Make sure this debug feature is deactivated before delivering the code in production.', '운영에 배포하기 전에 이 디버그 기능을 끄는지 확인합니다.'],
  samplePath: 'config/environments/production.rb',
  on: {
    Assign(n, cx) {
      if (!/(?:^|\/)config\/environments\/(?:production|staging)\.rb$/.test(cx.path)) return;
      if (n.target.type === 'Call' && n.target.name === 'consider_all_requests_local' && n.value.type === 'True') cx.report(n);
    },
  },
  bad: `Rails.application.configure do
  config.consider_all_requests_local = true # Noncompliant
end
`,
  good: `Rails.application.configure do
  config.consider_all_requests_local = false
end
`,
});

rule({
  id: 'permissive-cors', type: 'H', sev: 'MA', debt: 5, ref: 'S5122', tags: ['rails', 'cwe-346', 'cwe-942', 'owasp-a05'],
  en: ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', 'Allowing every origin ("*") lets any website read responses from this API in the user\'s browser.', 'List the trusted origins explicitly.'],
  ko: ['허용 범위가 넓은 CORS 정책은 보안에 민감합니다', '모든 출처("*")를 허용하면 아무 웹사이트나 사용자 브라우저에서 이 API의 응답을 읽을 수 있습니다.', '믿을 수 있는 출처를 명시적으로 나열합니다.'],
  msg: ['Make sure this permissive CORS policy is safe here.', '이 넓은 CORS 정책이 여기서 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      if (!n.recv && n.name === 'origins' && n.args.some((a) => A.strValue(a) === '*' || (a.type === 'Regex' && a.value === '.*'))) cx.report(n);
    },
    Assign(n, cx) {
      const t = n.target;
      if (t.type === 'Call' && t.name === '[]' && /^access-control-allow-origin$/i.test(A.strValue(t.args[0]) || '') && A.strValue(n.value) === '*') cx.report(n);
    },
  },
  bad: `Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "*" # Noncompliant
    resource "*", headers: :any, methods: [:get]
  end
end
`,
  good: `Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "https://app.example.com"
    resource "*", headers: :any, methods: [:get]
  end
end
`,
});

const lineAnchored = (re) => {
  if (!re || re.type !== 'Regex' || re.interp || re.value == null) return false;
  if (/m/.test(re.flags || '') && false) return false;
  const v = re.value;
  return /^\^/.test(v) || /(?:^|[^\\])\$$/.test(v);
};

rule({
  id: 'validation-regex-anchors', type: 'V', sev: 'MA', debt: 5, tags: ['rails', 'cwe-777', 'owasp-a03'],
  en: ['Format validations should anchor regexes with \\A and \\z', 'In Ruby ^ and $ match at line breaks, so "evil\\nvalid" passes a /^valid$/ validation.', 'Use \\A and \\z (Rails also raises for multiline anchors unless multiline: true).'],
  ko: ['형식 검증 정규식은 \\A와 \\z로 고정해야 합니다', 'Ruby에서 ^와 $는 줄바꿈 위치에서도 맞아서 "evil\\nvalid"가 /^valid$/ 검증을 통과합니다.', '\\A와 \\z를 씁니다(Rails도 multiline: true 없이 줄 단위 앵커를 쓰면 오류를 냅니다).'],
  msg: ['Replace "^" / "$" by "\\A" / "\\z" in this format validation.', '이 형식 검증에서 "^" / "$"를 "\\A" / "\\z"로 바꿉니다.'],
  samplePath: 'app/models/account.rb',
  on: {
    Call(n, cx) {
      if (n.recv) return;
      const kw = A.kwargs(n);
      if (!kw) return;
      let re = null;
      if (n.name === 'validates') {
        const f = A.hashGet(kw, 'format');
        if (f && f.value.type === 'Hash') { const w = A.hashGet(f.value, 'with'); if (w) re = w.value; }
        else if (f && f.value.type === 'Regex') re = f.value;
      } else if (n.name === 'validates_format_of') {
        const w = A.hashGet(kw, 'with');
        if (w) re = w.value;
      }
      if (!re || !lineAnchored(re)) return;
      const ml = A.hashGet(kw, 'multiline') || (A.hashGet(kw, 'format') && A.hashGet(A.hashGet(kw, 'format').value, 'multiline'));
      if (ml && ml.value.type === 'True') return;
      cx.report(re);
    },
  },
  bad: `class Account < ApplicationRecord
  validates :slug, format: { with: /^[a-z0-9-]+$/ } # Noncompliant
end
`,
  good: `class Account < ApplicationRecord
  validates :slug, format: { with: /\\A[a-z0-9-]+\\z/ }
end
`,
});

module.exports = {};
