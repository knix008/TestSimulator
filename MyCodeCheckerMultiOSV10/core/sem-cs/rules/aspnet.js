'use strict';

// ASP.NET Core / MVC / Web API rules (sonar-dotnet ASP.NET family plus a few
// precise extras): routing, controller design, model binding and validation,
// antiforgery, request limits, clear-text URLs and hard-coded secrets.

const { R } = require('../registry');
const { unparen, dotted, callName, callTarget, hasMod, attrNamed, enclosing, forEachChild } = require('../ast');
const U = require('../util');
const T = require('../types');

const VERBS = { HttpGet: 'GET', HttpPost: 'POST', HttpPut: 'PUT', HttpDelete: 'DELETE', HttpPatch: 'PATCH', HttpHead: 'HEAD', HttpOptions: 'OPTIONS' };
const VERB_ATTRS = Object.keys(VERBS);
const ROUTE_ATTRS = ['Route', ...VERB_ATTRS];
const MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const SIMPLE = new Set(['string', 'int', 'long', 'short', 'byte', 'bool', 'double', 'float', 'decimal', 'char', 'uint', 'ulong', 'ushort', 'sbyte',
  'Guid', 'DateTime', 'DateTimeOffset', 'TimeSpan', 'DateOnly', 'TimeOnly', 'Uri', 'object', 'CancellationToken', 'IFormFile', 'IFormFileCollection']);
const BINDING_ATTRS = ['FromBody', 'FromServices', 'FromQuery', 'FromHeader', 'FromForm', 'FromRoute', 'FromKeyedServices'];

// ───────────────────────────────────────── helpers
function classAttr(td, names) {
  const own = attrNamed(td.attrs, names);
  if (own) return own;
  let info = td.typeInfo ? td.typeInfo.baseInfo : null;
  for (let i = 0; info && i < 10; i++, info = info.baseInfo) {
    for (const d of info.decls) { const a = attrNamed(d.attrs, names); if (a) return a; }
  }
  return null;
}

function inheritsAny(td, names) {
  const info = td.typeInfo;
  return !!info && names.some((n) => info.inheritsFrom(n));
}

function isController(td) {
  if (!td || td.k !== 'TypeDecl' || td.kind !== 'class') return false;
  if (hasMod(td, 'abstract') || hasMod(td, 'static')) return false;
  if (attrNamed(td.attrs, ['NonController'])) return false;
  if (attrNamed(td.attrs, ['ApiController', 'Controller'])) return true;
  return inheritsAny(td, ['Controller', 'ControllerBase']);
}

function isApiController(td) { return !!classAttr(td, ['ApiController']); }

function isMvcController(td) { return isController(td) && inheritsAny(td, ['Controller']) && !isApiController(td); }

function actionsOf(td) {
  return td.members.filter((m) => m.k === 'Method' && hasMod(m, 'public') && !hasMod(m, 'static') && !hasMod(m, 'override')
    && !hasMod(m, 'abstract') && !attrNamed(m.attrs, ['NonAction']) && !(m.typeParams && m.typeParams.length) && m.name !== 'Dispose');
}

function enclosingController(node) {
  const td = enclosing(node, ['TypeDecl']);
  return td && isController(td) ? td : null;
}

function enclosingAction(node) {
  const m = enclosing(node, ['Method']);
  if (!m) return null;
  const td = m.owner || enclosing(m, ['TypeDecl']);
  if (!td || !isController(td)) return null;
  return actionsOf(td).includes(m) ? m : null;
}

function verbsOf(m) {
  const out = new Set();
  for (const a of m.attrs || []) {
    if (VERBS[a.name]) out.add(VERBS[a.name]);
    if (a.name === 'AcceptVerbs') for (const arg of a.args) { const s = U.strVal(arg.expr); if (s && !arg.name) out.add(s.toUpperCase()); }
  }
  return out;
}

function templateOf(a) {
  for (const arg of a.args || []) {
    if (!arg.name || arg.name === 'template' || arg.name === 'Template') {
      const s = U.strVal(arg.expr);
      if (s != null) return s;
    }
  }
  return null;
}

function routeAttrs(m) { return (m.attrs || []).filter((a) => ROUTE_ATTRS.includes(a.name)); }

function paramAttr(p, names) { return attrNamed(p.attrs, names); }

function isSimpleType(t, project) {
  if (!t) return true;
  const n = T.normName(t.name);
  if (SIMPLE.has(n)) return true;
  return T.isValueTypeName(n, project);
}

function isComplexParam(p, project) {
  if (!p.type || paramAttr(p, ['FromServices', 'FromKeyedServices'])) return false;
  return !isSimpleType(p.type, project) || !!p.type.ranks;
}

function projectClass(project, t) {
  if (!t) return null;
  const arr = project.typesByName.get(t.name);
  if (!arr || arr.length !== 1) return null;
  const info = arr[0];
  return info.kind === 'class' || info.kind === 'record' ? info : null;
}

function constNum(e) {
  e = unparen(e);
  if (!e) return null;
  if (e.k === 'Literal' && (e.kind === 'int' || e.kind === 'real')) return Number(e.value);
  if (e.k === 'Binary') {
    const l = constNum(e.left); const r = constNum(e.right);
    if (l == null || r == null) return null;
    switch (e.op) {
      case '*': return l * r;
      case '+': return l + r;
      case '-': return l - r;
      case '<<': return l * (2 ** r);
      case '/': return r ? Math.floor(l / r) : null;
      default: return null;
    }
  }
  if (e.k === 'Member') {
    const d = dotted(e);
    if (d && /^(long|int|Int64|Int32|uint|ulong)\.MaxValue$/.test(d)) return 2 ** 31;
  }
  return null;
}

function containsCall(node, names) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (n.k === 'Invocation' && names.includes(callName(n))) { found = n; return; }
    forEachChild(n, visit);
  };
  if (node) visit(node);
  return found;
}

function bodyNode(m) { return m.body || m.exprBody || null; }

function fileUsesAspNet(pf) {
  if (pf._aspnet !== undefined) return pf._aspnet;
  pf._aspnet = pf.usings.some((u) => /^Microsoft\.AspNetCore\b|^System\.Web\b/.test(u.name || ''));
  return pf._aspnet;
}

function projectMentions(project, word) {
  project._aspnetWords = project._aspnetWords || new Map();
  if (!project._aspnetWords.has(word)) project._aspnetWords.set(word, project.files.some((f) => f.text.includes(word)));
  return project._aspnetWords.get(word);
}

function rootName(e) {
  e = unparen(e);
  while (e && (e.k === 'Member' || e.k === 'Element')) e = unparen(e.expr);
  return e && e.k === 'Name' ? e : null;
}

function isLiteralString(e) { return U.strVal(e) != null; }

function selfCall(inv) {
  const t = callTarget(inv);
  if (!t) return true;
  const u = unparen(t);
  return u.k === 'This' || u.k === 'Base';
}

// ───────────────────────────────────────── routing
R('aspnet-route-template-slash', 'S6931', 'S', 'MA', 5, ['asp.net', 'routing'],
  ['Action route templates should not start with "/" in a routed controller', 'A template starting with "/" or "~/" ignores the controller-level [Route] prefix, so the action ends up at an unexpected URL.', 'Remove the leading "/" so the template is appended to the controller route, or move the route to the controller.'],
  ['라우팅된 컨트롤러의 액션 라우트 템플릿은 "/"로 시작하면 안 됩니다', '"/"나 "~/"로 시작하는 템플릿은 컨트롤러의 [Route] 접두사를 무시하므로 액션이 예상과 다른 URL에 놓입니다.', '앞의 "/"를 지워 컨트롤러 라우트에 이어지게 하거나 라우트를 컨트롤러로 옮기세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !attrNamed(td.attrs, ['Route'])) return;
    for (const m of actionsOf(td)) {
      for (const a of routeAttrs(m)) {
        const t = templateOf(a);
        if (t && /^(\/|~\/)/.test(t)) cx.report(a, `Remove the leading '/' of route template '${t}' on action '${m.name}'; it bypasses the route of controller '${td.name}'.`, `액션 '${m.name}'의 라우트 템플릿 '${t}' 앞의 '/'를 지우세요. 컨트롤러 '${td.name}'의 라우트를 건너뜁니다.`);
      }
    }
  } } });

R('aspnet-controller-route-missing', 'S6934', 'S', 'MA', 5, ['asp.net', 'routing'],
  ['A [Route] attribute should be added to the controller when actions declare route templates', 'Without a controller-level route each action template is a full URL of its own, which scatters the controller prefix and breaks easily when it is renamed.', 'Add [Route("...")] to the controller and keep only the relative part on the actions.'],
  ['액션에 라우트 템플릿이 있으면 컨트롤러에 [Route] 특성을 붙여야 합니다', '컨트롤러 수준 라우트가 없으면 액션 템플릿마다 전체 URL이 되어 접두사가 흩어지고 이름을 바꿀 때 쉽게 깨집니다.', '컨트롤러에 [Route("...")]를 붙이고 액션에는 상대 부분만 남기세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || classAttr(td, ['Route'])) return;
    for (const m of actionsOf(td)) {
      for (const a of routeAttrs(m)) {
        const t = templateOf(a);
        if (t && !/^(\/|~)/.test(t)) {
          cx.report(td, `Add a [Route] attribute to controller '${td.name}'; action '${m.name}' declares the template '${t}'.`, `컨트롤러 '${td.name}'에 [Route] 특성을 붙이세요. 액션 '${m.name}'이 템플릿 '${t}'를 선언합니다.`, { atName: true });
          return;
        }
      }
    }
  } } });

R('aspnet-route-backslash', 'S6930', 'B', 'MA', 5, ['asp.net', 'routing'],
  ['Backslashes should not be used in route templates', 'Route templates are URL paths: a backslash is not a separator there, so the route never matches the intended URL.', 'Use "/" to separate the segments.'],
  ['라우트 템플릿에 백슬래시를 쓰면 안 됩니다', '라우트 템플릿은 URL 경로라 백슬래시는 구분자가 아니므로 의도한 URL과 맞지 않습니다.', '세그먼트는 "/"로 구분하세요.'],
  { kinds: {
    Attribute(a, cx) {
      if (!ROUTE_ATTRS.includes(a.name)) return;
      const t = templateOf(a);
      if (t && hasBackslash(t)) cx.report(a, `Replace the backslash in route template '${t}' with '/'.`, `라우트 템플릿 '${t}'의 백슬래시를 '/'로 바꾸세요.`);
    },
    Invocation(n, cx) {
      const name = callName(n);
      if (!/^Map(Get|Post|Put|Delete|Patch|Methods|ControllerRoute|Fallback|Group)?$/.test(name || '') || name === 'Map' && !n.args.length) return;
      for (const arg of n.args) {
        if (arg.name && arg.name !== 'pattern') continue;
        const t = U.strVal(arg.expr);
        if (t && hasBackslash(t)) { cx.report(arg, `Replace the backslash in route pattern '${t}' with '/'.`, `라우트 패턴 '${t}'의 백슬래시를 '/'로 바꾸세요.`); return; }
        if (t != null) return;
      }
    },
  } });
function hasBackslash(t) { return t.replace(/regex\((?:[^()]|\([^()]*\))*\)/g, '').includes('\\'); }

R('aspnet-route-param-unbound', '', 'B', 'MA', 5, ['asp.net', 'routing'],
  ['Route template parameters should match action parameters', 'A route parameter that no action parameter binds to is silently ignored, and the parameter the developer meant stays at its default value.', 'Rename the route parameter or the action parameter so they match.'],
  ['라우트 템플릿 매개변수는 액션 매개변수와 맞아야 합니다', '어느 액션 매개변수에도 바인딩되지 않는 라우트 매개변수는 조용히 무시되고, 의도한 매개변수는 기본값으로 남습니다.', '라우트 매개변수나 액션 매개변수 이름을 맞추세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    if (td.members.some((m) => m.k === 'Property' && attrNamed(m.attrs, ['BindProperty', 'FromRoute']))) return;
    if (classAttr(td, ['BindProperties'])) return;
    for (const m of actionsOf(td)) {
      const ps = m.params || [];
      if (ps.some((p) => isComplexParam(p, cx.project) && !paramAttr(p, ['FromBody', 'FromQuery', 'FromHeader', 'FromForm']))) continue;
      const names = new Set();
      for (const p of ps) {
        names.add(p.name.toLowerCase());
        const fa = paramAttr(p, ['FromRoute', 'FromQuery']);
        if (fa) for (const arg of fa.args) if (arg.name === 'Name') { const s = U.strVal(arg.expr); if (s) names.add(s.toLowerCase()); }
      }
      for (const a of routeAttrs(m)) {
        const t = templateOf(a);
        if (!t) continue;
        const re = /\{\*{0,2}([A-Za-z_][A-Za-z0-9_]*)/g;
        let mt;
        while ((mt = re.exec(t))) {
          const pn = mt[1];
          if (['controller', 'action', 'area', 'page', 'handler'].includes(pn.toLowerCase())) continue;
          if (names.has(pn.toLowerCase())) continue;
          cx.report(a, `Route parameter '{${pn}}' of action '${m.name}' does not match any action parameter.`, `액션 '${m.name}'의 라우트 매개변수 '{${pn}}'와 맞는 액션 매개변수가 없습니다.`);
        }
      }
    }
  } } });

R('aspnet-duplicate-route', '', 'B', 'CR', 10, ['asp.net', 'routing'],
  ['Actions of a controller should not share the same verb and route', 'Two actions with the same HTTP verb and template make the request ambiguous and ASP.NET throws AmbiguousMatchException at run time.', 'Give the actions distinct templates or verbs, or merge them.'],
  ['한 컨트롤러의 액션이 같은 동사와 라우트를 공유하면 안 됩니다', 'HTTP 동사와 템플릿이 같은 액션 두 개는 요청을 모호하게 만들어 실행 중에 AmbiguousMatchException이 납니다.', '액션마다 템플릿이나 동사를 다르게 하거나 합치세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    const cr = classAttr(td, ['Route']);
    if (!cr) return;
    const ct = templateOf(cr) || '';
    if (/\[action\]/i.test(ct)) return;
    const seen = new Map();
    for (const m of actionsOf(td)) {
      for (const a of m.attrs || []) {
        if (!VERBS[a.name]) continue;
        const t = templateOf(a) || '';
        if (/\[action\]/i.test(t) || /^(\/|~)/.test(t)) continue;
        const key = `${VERBS[a.name]} ${t.toLowerCase().replace(/^\/+|\/+$/g, '')}`;
        const prev = seen.get(key);
        if (prev && prev !== m) {
          cx.report(a, `Action '${m.name}' has the same route as action '${prev.name}' (${VERBS[a.name]} '${t}').`, `액션 '${m.name}'의 라우트가 액션 '${prev.name}'와 같습니다(${VERBS[a.name]} '${t}').`);
        } else if (!prev) seen.set(key, m);
      }
    }
  } } });

R('aspnet-missing-http-verb', 'S6965', 'S', 'MA', 5, ['asp.net', 'api'],
  ['REST API actions should be annotated with an HTTP verb attribute', 'An API action without [HttpGet], [HttpPost] ... accepts every verb, which is rarely intended and breaks OpenAPI generation.', 'Add the HTTP verb attribute that matches the action.'],
  ['REST API 액션에는 HTTP 동사 특성을 붙여야 합니다', '[HttpGet], [HttpPost] 같은 특성이 없는 API 액션은 모든 동사를 받아들이는데, 이는 거의 의도가 아니며 OpenAPI 생성도 깨뜨립니다.', '액션에 맞는 HTTP 동사 특성을 붙이세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !isApiController(td)) return;
    for (const m of actionsOf(td)) {
      if (verbsOf(m).size) continue;
      cx.report(m, `Add an HTTP verb attribute such as [HttpGet] to action '${m.name}'.`, `액션 '${m.name}'에 [HttpGet] 같은 HTTP 동사 특성을 붙이세요.`, { atName: true });
    }
  } } });

// ───────────────────────────────────────── controller design
R('aspnet-mixed-responsibilities', 'S6960', 'S', 'MA', 30, ['asp.net', 'design'],
  ['Controllers should not have mixed responsibilities', 'When the actions of a controller fall into groups that use disjoint sets of injected services, the controller does several unrelated jobs and every request pays for all dependencies.', 'Split the controller along the groups of actions.'],
  ['컨트롤러가 여러 책임을 섞으면 안 됩니다', '컨트롤러의 액션이 서로 겹치지 않는 주입 서비스 묶음으로 나뉘면 관계없는 여러 일을 하는 것이고, 요청마다 모든 의존성 비용을 냅니다.', '액션 묶음에 따라 컨트롤러를 나누세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    const deps = injectedDeps(td);
    if (deps.size < 2) return;
    const groups = [];
    let used = 0;
    for (const m of actionsOf(td)) {
      const b = bodyNode(m);
      if (!b) continue;
      const ids = U.identsIn(b);
      const mine = [...deps].filter((d) => ids.has(d));
      if (!mine.length) continue;
      used++;
      const hit = groups.filter((g) => mine.some((d) => g.deps.has(d)));
      const g = { deps: new Set(mine), actions: [m.name] };
      for (const h of hit) { for (const d of h.deps) g.deps.add(d); g.actions.push(...h.actions); groups.splice(groups.indexOf(h), 1); }
      groups.push(g);
    }
    if (groups.length < 2 || used < 4) return;
    const list = groups.map((g) => g.actions.join(', ')).join(' | ');
    cx.report(td, `Split controller '${td.name}': its actions form ${groups.length} groups that share no dependency (${list}).`, `컨트롤러 '${td.name}'를 나누세요. 액션이 의존성을 공유하지 않는 ${groups.length}개 묶음으로 나뉩니다(${list}).`, { atName: true });
  } } });
const SHARED_DEP = /Logger|Mediator|Mapper|Configuration|Options|Localizer|Environment|Accessor|Telemetry/;
function injectedDeps(td) {
  const deps = new Set();
  const typeOfMember = (name) => {
    const e = td.typeInfo && td.typeInfo.members.get(name);
    return e && e[0] && e[0].type ? e[0].type.name : '';
  };
  if (td.params) for (const p of td.params) if (!SHARED_DEP.test(p.type ? p.type.name : '')) deps.add(p.name);
  for (const m of td.members) {
    if (m.k !== 'Ctor' || !m.body) continue;
    const visit = (n) => {
      if (n.k === 'Assign' && n.op === '=') {
        const l = unparen(n.left);
        let r = unparen(n.right);
        if (r && r.k === 'Binary' && r.op === '??') r = unparen(r.left);
        const name = l.k === 'Name' ? l.name : l.k === 'Member' && unparen(l.expr).k === 'This' ? l.name : null;
        if (name && r && r.k === 'Name' && r.sym && r.sym.kind === 'param') {
          const tn = typeOfMember(name) || (r.sym.type ? r.sym.type.name : '');
          if (!SHARED_DEP.test(tn)) deps.add(name);
        }
      }
      forEachChild(n, visit);
    };
    visit(m.body);
  }
  return deps;
}

R('aspnet-api-controller-base', 'S6961', 'S', 'MA', 5, ['asp.net', 'api'],
  ['API controllers should derive from ControllerBase instead of Controller', 'Controller adds view support (View, ViewBag, TempData ...) that an API never uses; deriving from it pulls in unneeded services and misleads readers.', 'Derive from ControllerBase.'],
  ['API 컨트롤러는 Controller 대신 ControllerBase를 상속해야 합니다', 'Controller는 API가 쓰지 않는 뷰 기능(View, ViewBag, TempData 등)을 더하므로 필요 없는 서비스를 끌어오고 읽는 사람을 오해하게 합니다.', 'ControllerBase를 상속하세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !attrNamed(td.attrs, ['ApiController'])) return;
    if (!td.bases.length || td.bases[0].name !== 'Controller') return;
    const ids = U.identsIn(td);
    if (['View', 'PartialView', 'ViewComponent', 'ViewBag', 'ViewData', 'TempData', 'Json'].some((n) => ids.has(n))) return;
    cx.report(td, `Make API controller '${td.name}' derive from 'ControllerBase'; it does not use views.`, `API 컨트롤러 '${td.name}'가 'ControllerBase'를 상속하게 하세요. 뷰를 쓰지 않습니다.`, { atName: true });
  } } });

R('aspnet-controller-suffix', '', 'S', 'MI', 5, ['asp.net', 'convention'],
  ['Controller class names should end with "Controller"', 'The [controller] route token and conventional routing use the class name without the "Controller" suffix; a class without it gets surprising URLs and is hard to recognize.', 'Rename the class so it ends with "Controller".'],
  ['컨트롤러 클래스 이름은 "Controller"로 끝나야 합니다', '[controller] 라우트 토큰과 규칙 기반 라우팅은 "Controller" 접미사를 뺀 클래스 이름을 쓰므로, 접미사가 없으면 URL이 뜻밖이 되고 알아보기 어렵습니다.', '클래스 이름이 "Controller"로 끝나게 바꾸세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || td.name.endsWith('Controller') || attrNamed(td.attrs, ['Controller'])) return;
    if (!inheritsAny(td, ['Controller', 'ControllerBase'])) return;
    cx.report(td, `Rename controller '${td.name}' to '${td.name}Controller'.`, `컨트롤러 '${td.name}'의 이름을 '${td.name}Controller'로 바꾸세요.`, { atName: true });
  } } });

R('aspnet-static-controller-state', '', 'B', 'MA', 15, ['asp.net', 'multi-threading'],
  ['Controllers should not keep request state in mutable static fields', 'A controller instance serves one request, but a static field is shared by all concurrent requests, so writing it from an action races and leaks data between users.', 'Keep the value in a local, in an injected scoped service, or in a thread-safe singleton.'],
  ['컨트롤러는 변경 가능한 static 필드에 요청 상태를 두면 안 됩니다', '컨트롤러 인스턴스는 요청 하나를 처리하지만 static 필드는 동시 요청 모두가 공유하므로, 액션에서 쓰면 경합이 생기고 사용자 사이에 데이터가 샙니다.', '지역 변수, 주입한 scoped 서비스, 스레드 안전한 싱글턴에 두세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    const fields = new Map();
    for (const m of td.members) {
      if (m.k !== 'Field' || !hasMod(m, 'static') || hasMod(m, 'readonly') || m.isConst) continue;
      for (const v of m.vars) fields.set(v.name, v);
    }
    if (!fields.size) return;
    const reported = new Set();
    for (const m of actionsOf(td)) {
      const b = bodyNode(m);
      if (!b) continue;
      const visit = (n) => {
        let target = null;
        if (n.k === 'Assign') target = unparen(n.left);
        else if (n.k === 'Unary' && (n.op === '++' || n.op === '--')) target = unparen(n.operand);
        if (target) {
          const name = target.k === 'Name' && !target.sym ? target.name : target.k === 'Member' && dotted(target.expr) === td.name ? target.name : null;
          if (name && fields.has(name) && !reported.has(name)) {
            reported.add(name);
            cx.report(fields.get(name), `Static field '${name}' is written by action '${m.name}' and shared by all requests.`, `static 필드 '${name}'를 액션 '${m.name}'이 쓰며 모든 요청이 공유합니다.`);
          }
        }
        forEachChild(n, visit);
      };
      visit(b);
    }
  } } });

R('aspnet-httpclient-direct', 'S6962', 'S', 'MA', 15, ['asp.net', 'performance'],
  ['HTTP connections should be pooled with IHttpClientFactory', 'Creating an HttpClient per call opens a new connection each time and can exhaust sockets under load; a long-lived one ignores DNS changes.', 'Inject IHttpClientFactory or a typed client and create clients from it.'],
  ['HTTP 연결은 IHttpClientFactory로 풀링해야 합니다', '호출마다 HttpClient를 만들면 매번 새 연결을 열어 부하가 걸리면 소켓이 고갈되고, 오래 쓰는 인스턴스는 DNS 변경을 무시합니다.', 'IHttpClientFactory나 typed client를 주입해 거기서 클라이언트를 만드세요.'],
  { kinds: { New(n, cx) {
    if (!n.type || n.type.name !== 'HttpClient') return;
    const fn = enclosing(n, ['Method', 'Ctor', 'Accessor', 'LocalFunc', 'Lambda', 'Field', 'Property']);
    if (!fn || ((fn.k === 'Field' || fn.k === 'Property' || fn.k === 'Ctor') && hasMod(fn, 'static'))) return;
    const td = enclosing(n, ['TypeDecl']);
    if (!td) return;
    if (!isController(td) && !fileUsesAspNet(cx.pf)) return;
    cx.report(n, 'Create this HttpClient from an injected IHttpClientFactory instead of with \'new\'.', '이 HttpClient를 \'new\' 대신 주입한 IHttpClientFactory로 만드세요.');
  } } });

// ───────────────────────────────────────── model binding and validation
R('aspnet-modelstate-unchecked', 'S6967', 'B', 'MA', 10, ['asp.net', 'validation'],
  ['ModelState.IsValid should be checked in controller actions', 'Outside [ApiController], validation errors of the bound model do not stop the action; without checking ModelState.IsValid invalid input is processed as if it were valid.', 'Check ModelState.IsValid (or TryValidateModel) and return the view or BadRequest when it is false.'],
  ['컨트롤러 액션에서 ModelState.IsValid를 확인해야 합니다', '[ApiController]가 아니면 바인딩한 모델의 검증 오류가 액션을 멈추지 않으므로, ModelState.IsValid를 확인하지 않으면 잘못된 입력을 올바른 것처럼 처리합니다.', 'ModelState.IsValid(또는 TryValidateModel)를 확인하고 false면 뷰나 BadRequest를 반환하세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || isApiController(td)) return;
    if ((td.attrs || []).some((a) => /Valid/.test(a.name))) return;
    for (const m of actionsOf(td)) {
      const verbs = verbsOf(m);
      if (![...verbs].some((v) => MUTATING.has(v))) continue;
      if ((m.attrs || []).some((a) => /Valid/.test(a.name) && a.name !== 'ValidateAntiForgeryToken')) continue;
      const model = (m.params || []).find((p) => isComplexParam(p, cx.project));
      if (!model) continue;
      const b = bodyNode(m);
      if (!b) continue;
      const ids = U.identsIn(b);
      if (ids.has('ModelState') || ids.has('TryValidateModel')) continue;
      cx.report(m, `Check 'ModelState.IsValid' in action '${m.name}' before using model '${model.name}'.`, `액션 '${m.name}'에서 모델 '${model.name}'를 쓰기 전에 'ModelState.IsValid'를 확인하세요.`, { atName: true });
    }
  } } });

R('aspnet-produces-response-type', 'S6968', 'S', 'MA', 5, ['asp.net', 'api'],
  ['API actions returning IActionResult should declare their response type', 'With IActionResult the response body type is invisible to OpenAPI and clients; [ProducesResponseType] documents it.', 'Add [ProducesResponseType(typeof(T), 200)] or return ActionResult<T>.'],
  ['IActionResult를 반환하는 API 액션은 응답 타입을 선언해야 합니다', 'IActionResult를 쓰면 응답 본문 타입이 OpenAPI와 클라이언트에 보이지 않으므로 [ProducesResponseType]로 알려야 합니다.', '[ProducesResponseType(typeof(T), 200)]를 붙이거나 ActionResult<T>를 반환하세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !isApiController(td)) return;
    const DOC = ['ProducesResponseType', 'SwaggerResponse', 'Produces', 'ProducesDefaultResponseType'];
    if (classAttr(td, DOC)) return;
    for (const m of actionsOf(td)) {
      let rt = m.retType;
      if (rt && (rt.name === 'Task' || rt.name === 'ValueTask') && rt.args && rt.args[0]) rt = rt.args[0];
      if (!rt || rt.name !== 'IActionResult') continue;
      if (attrNamed(m.attrs, DOC)) continue;
      const b = bodyNode(m);
      let valued = false;
      const visit = (n) => {
        if (valued) return;
        if (n.k === 'Invocation' && selfCall(n) && ['Ok', 'Created', 'CreatedAtAction', 'CreatedAtRoute', 'Accepted', 'AcceptedAtAction'].includes(callName(n))) {
          const vi = callName(n) === 'Ok' ? 0 : n.args.length - 1;
          if (n.args.length && n.args[vi]) valued = true;
        }
        forEachChild(n, visit);
      };
      if (b) visit(b);
      if (!valued) continue;
      cx.report(m, `Annotate action '${m.name}' with [ProducesResponseType] for the type it returns.`, `액션 '${m.name}'에 반환하는 타입의 [ProducesResponseType]을 붙이세요.`, { atName: true });
    }
  } } });

R('aspnet-raw-request-access', 'S6932', 'S', 'MA', 10, ['asp.net', 'validation'],
  ['Model binding should be used instead of reading raw request data', 'Reading Request.Form, Request.Query or RouteValues by hand skips type conversion and validation and hides the inputs of the action.', 'Declare the values as action parameters ([FromForm], [FromQuery], [FromRoute]) or as a bound model.'],
  ['원시 요청 데이터를 읽지 말고 모델 바인딩을 써야 합니다', 'Request.Form, Request.Query, RouteValues를 직접 읽으면 타입 변환과 검증을 건너뛰고 액션의 입력이 드러나지 않습니다.', '값을 액션 매개변수([FromForm], [FromQuery], [FromRoute])나 바인딩 모델로 선언하세요.'],
  { kinds: { Member(n, cx) {
    if (!['Form', 'Query', 'RouteValues'].includes(n.name)) return;
    const d = dotted(n.expr);
    if (!d || !/^(this\.)?(HttpContext\.)?Request$/.test(d)) return;
    if (!enclosingAction(n)) return;
    cx.report(n, `Bind this value through an action parameter instead of reading 'Request.${n.name}'.`, `'Request.${n.name}'를 읽지 말고 액션 매개변수로 바인딩하세요.`);
  } } });

R('aspnet-multiple-frombody', '', 'B', 'CR', 10, ['asp.net', 'api'],
  ['Actions should not have more than one [FromBody] parameter', 'The request body can be read only once; ASP.NET rejects actions with several [FromBody] parameters at start-up or binds only one of them.', 'Wrap the values in one model class bound from the body.'],
  ['액션에 [FromBody] 매개변수가 둘 이상 있으면 안 됩니다', '요청 본문은 한 번만 읽을 수 있어 ASP.NET은 [FromBody] 매개변수가 여럿인 액션을 시작할 때 거부하거나 하나만 바인딩합니다.', '값들을 본문에서 바인딩하는 모델 클래스 하나로 묶으세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    for (const m of actionsOf(td)) {
      const fb = (m.params || []).filter((p) => paramAttr(p, ['FromBody']));
      if (fb.length < 2) continue;
      cx.report(m, `Action '${m.name}' binds ${fb.length} parameters from the body (${fb.map((p) => p.name).join(', ')}); use one model.`, `액션 '${m.name}'이 본문에서 매개변수 ${fb.length}개(${fb.map((p) => p.name).join(', ')})를 바인딩합니다. 모델 하나를 쓰세요.`, { atName: true });
    }
  } } });

R('aspnet-value-type-underposting', 'S6964', 'S', 'MA', 5, ['asp.net', 'validation'],
  ['Value type properties of action models should be nullable, required or [JsonRequired]', 'A missing value type in the request is bound to its default (0, false ...), so the action cannot tell an omitted value from a real one (under-posting).', 'Make the property nullable, mark it required or [JsonRequired], or give it [Required] with a nullable type.'],
  ['액션 모델의 값 형식 속성은 nullable, required, [JsonRequired] 중 하나여야 합니다', '요청에 값 형식 속성이 없으면 기본값(0, false 등)으로 바인딩되어 액션이 빠진 값과 실제 값을 구별하지 못합니다(언더포스팅).', '속성을 nullable로 하거나 required 또는 [JsonRequired]로 표시하세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !isApiController(td)) return;
    for (const m of actionsOf(td)) {
      for (const p of m.params || []) {
        if (!isComplexParam(p, cx.project) || p.type.ranks) continue;
        if (paramAttr(p, ['FromServices', 'FromKeyedServices', 'FromHeader'])) continue;
        const info = projectClass(cx.project, p.type);
        if (!info) continue;
        for (const d of info.decls) {
          for (const prop of d.members) {
            if (prop.k !== 'Property' || !hasMod(prop, 'public') || hasMod(prop, 'static') || hasMod(prop, 'required')) continue;
            if (!prop.accessors || !prop.accessors.some((a) => a.kind === 'set' || a.kind === 'init')) continue;
            const t = prop.type;
            if (!t || t.nullable || t.ranks || !T.isValueTypeName(t.name, cx.project)) continue;
            if (attrNamed(prop.attrs, ['Required', 'JsonRequired', 'BindRequired', 'JsonIgnore', 'BindNever'])) continue;
            cx.reportIn(d.file, prop, `Make property '${prop.name}' of '${info.name}' nullable, required or [JsonRequired]; a missing value binds to its default.`, `'${info.name}'의 속성 '${prop.name}'를 nullable, required, [JsonRequired] 중 하나로 하세요. 값이 없으면 기본값으로 바인딩됩니다.`, { atName: true });
          }
        }
      }
    }
  } } });

R('aspnet-action-no-cancellation', '', 'S', 'MI', 5, ['asp.net', 'async-await'],
  ['Asynchronous actions should accept a CancellationToken', 'When the client disconnects, an action without a CancellationToken keeps running its database and HTTP calls for nothing.', 'Add a CancellationToken parameter and pass it to the asynchronous calls.'],
  ['비동기 액션은 CancellationToken을 받아야 합니다', '클라이언트 연결이 끊겨도 CancellationToken이 없는 액션은 데이터베이스와 HTTP 호출을 쓸데없이 계속합니다.', 'CancellationToken 매개변수를 더하고 비동기 호출에 넘기세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    for (const m of actionsOf(td)) {
      if (!hasMod(m, 'async') || !U.returnsTask(m)) continue;
      if ((m.params || []).some((p) => p.type && p.type.name === 'CancellationToken')) continue;
      const b = bodyNode(m);
      if (!b) continue;
      const ids = U.identsIn(b);
      if (ids.has('RequestAborted') || ids.has('CancellationToken')) continue;
      let call = null;
      const visit = (n) => {
        if (call) return;
        if (n.k === 'Await') { const e = unparen(n.expr); if (e && e.k === 'Invocation' && /Async$/.test(callName(e) || '')) { call = e; return; } }
        if (n.k === 'Lambda' || n.k === 'LocalFunc') return;
        forEachChild(n, visit);
      };
      visit(b);
      if (!call) continue;
      cx.report(m, `Add a CancellationToken parameter to action '${m.name}' and pass it to '${callName(call)}'.`, `액션 '${m.name}'에 CancellationToken 매개변수를 더하고 '${callName(call)}'에 넘기세요.`, { atName: true });
    }
  } } });

R('aspnet-get-modifies-state', '', 'H', 'MA', 15, ['asp.net', 'cwe-352', 'owasp-a1'],
  ['HTTP GET actions should not modify persistent state', 'GET requests are sent by links, prefetchers and crawlers and are not protected by antiforgery tokens, so a GET action that saves data enables CSRF and accidental changes.', 'Use POST, PUT or DELETE for actions that change data.'],
  ['HTTP GET 액션이 영속 상태를 바꾸면 안 됩니다', 'GET 요청은 링크, 프리페처, 크롤러가 보내며 위조 방지 토큰으로 보호되지 않으므로, 데이터를 저장하는 GET 액션은 CSRF와 실수로 인한 변경을 부릅니다.', '데이터를 바꾸는 액션에는 POST, PUT, DELETE를 쓰세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td)) return;
    for (const m of actionsOf(td)) {
      const verbs = verbsOf(m);
      if (!verbs.size || [...verbs].some((v) => v !== 'GET' && v !== 'HEAD')) continue;
      const call = containsCall(bodyNode(m), ['SaveChanges', 'SaveChangesAsync', 'ExecuteDelete', 'ExecuteDeleteAsync', 'ExecuteUpdate', 'ExecuteUpdateAsync', 'ExecuteNonQuery', 'ExecuteNonQueryAsync']);
      if (!call) continue;
      cx.report(m, `GET action '${m.name}' changes data through '${callName(call)}'; use a POST, PUT or DELETE action.`, `GET 액션 '${m.name}'이 '${callName(call)}'로 데이터를 바꿉니다. POST, PUT, DELETE 액션을 쓰세요.`, { atName: true });
    }
  } } });

// ───────────────────────────────────────── security
R('aspnet-csrf-disabled', 'S4502', 'H', 'CR', 30, ['asp.net', 'cwe-352', 'owasp-a1'],
  ['Disabling CSRF protections is security-sensitive', 'Without antiforgery validation a malicious site can make a signed-in user\'s browser send state-changing requests to the application.', 'Keep antiforgery validation on ([ValidateAntiForgeryToken] / AutoValidateAntiforgeryToken) for every state-changing endpoint.'],
  ['CSRF 보호를 끄는 것은 보안에 민감합니다', '위조 방지 검증이 없으면 악성 사이트가 로그인한 사용자의 브라우저로 상태를 바꾸는 요청을 보내게 할 수 있습니다.', '상태를 바꾸는 모든 엔드포인트에서 위조 방지 검증([ValidateAntiForgeryToken] / AutoValidateAntiforgeryToken)을 켜 두세요.'],
  { kinds: {
    Attribute(a, cx) {
      if (a.name === 'IgnoreAntiforgeryToken') cx.report(a, 'Make sure disabling antiforgery validation here is safe.', '여기서 위조 방지 검증을 꺼도 안전한지 확인하세요.');
    },
    New(n, cx) {
      if (n.type && n.type.name === 'IgnoreAntiforgeryTokenAttribute') cx.report(n, 'Make sure disabling antiforgery validation globally is safe.', '위조 방지 검증을 전역으로 꺼도 안전한지 확인하세요.');
    },
    Invocation(n, cx) {
      if (callName(n) === 'DisableAntiforgery' && callTarget(n)) cx.report(n, 'Make sure disabling antiforgery validation on this endpoint is safe.', '이 엔드포인트에서 위조 방지 검증을 꺼도 안전한지 확인하세요.');
    },
  } });

R('aspnet-post-missing-antiforgery', '', 'V', 'CR', 10, ['asp.net', 'cwe-352', 'owasp-a1'],
  ['State-changing MVC actions should validate the antiforgery token', 'An MVC controller action reached by POST, PUT, PATCH or DELETE without [ValidateAntiForgeryToken] (and no global AutoValidateAntiforgeryToken filter) accepts cross-site forged requests.', 'Add [ValidateAntiForgeryToken] to the action or [AutoValidateAntiforgeryToken] to the controller or global filters.'],
  ['상태를 바꾸는 MVC 액션은 위조 방지 토큰을 검증해야 합니다', 'POST, PUT, PATCH, DELETE로 들어오는 MVC 컨트롤러 액션에 [ValidateAntiForgeryToken]이 없고 전역 AutoValidateAntiforgeryToken 필터도 없으면 사이트 간 위조 요청을 받아들입니다.', '액션에 [ValidateAntiForgeryToken]을, 또는 컨트롤러나 전역 필터에 [AutoValidateAntiforgeryToken]을 붙이세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isMvcController(td)) return;
    const AF = ['ValidateAntiForgeryToken', 'AutoValidateAntiforgeryToken', 'IgnoreAntiforgeryToken'];
    if (classAttr(td, AF)) return;
    if (projectMentions(cx.project, 'AutoValidateAntiforgeryToken')) return;
    for (const m of actionsOf(td)) {
      const verbs = [...verbsOf(m)].filter((v) => MUTATING.has(v));
      if (!verbs.length || attrNamed(m.attrs, AF)) continue;
      cx.report(m, `Add [ValidateAntiForgeryToken] to ${verbs[0]} action '${m.name}'.`, `${verbs[0]} 액션 '${m.name}'에 [ValidateAntiForgeryToken]을 붙이세요.`, { atName: true });
    }
  } } });

R('aspnet-anonymous-mutation', '', 'H', 'MA', 10, ['asp.net', 'cwe-285', 'owasp-a1'],
  ['[AllowAnonymous] on state-changing actions of an authorized controller is security-sensitive', 'The controller requires authorization, but this POST/PUT/PATCH/DELETE action opens it to anonymous callers, which is often an oversight.', 'Make sure the action must be public; otherwise remove [AllowAnonymous].'],
  ['권한이 필요한 컨트롤러의 상태 변경 액션에 [AllowAnonymous]를 붙이는 것은 보안에 민감합니다', '컨트롤러는 권한을 요구하지만 이 POST/PUT/PATCH/DELETE 액션은 익명 호출자에게 열리는데, 흔히 실수입니다.', '액션이 공개여야 하는지 확인하고, 아니면 [AllowAnonymous]를 지우세요.'],
  { kinds: { TypeDecl(td, cx) {
    if (!isController(td) || !classAttr(td, ['Authorize'])) return;
    for (const m of actionsOf(td)) {
      const anon = attrNamed(m.attrs, ['AllowAnonymous']);
      if (!anon) continue;
      const verbs = [...verbsOf(m)].filter((v) => MUTATING.has(v));
      if (!verbs.length) continue;
      cx.report(anon, `Make sure ${verbs[0]} action '${m.name}' of authorized controller '${td.name}' may be called anonymously.`, `권한이 필요한 컨트롤러 '${td.name}'의 ${verbs[0]} 액션 '${m.name}'을 익명으로 호출해도 되는지 확인하세요.`);
    }
  } } });

R('aspnet-authorize-empty-roles', '', 'B', 'MA', 5, ['asp.net', 'cwe-285'],
  ['[Authorize] should not have empty Roles or Policy', 'An empty Roles or Policy value restricts nothing beyond being signed in, which is rarely what the author meant.', 'Name the roles or the policy, or remove the empty argument.'],
  ['[Authorize]의 Roles나 Policy가 비어 있으면 안 됩니다', 'Roles나 Policy 값이 비어 있으면 로그인 외에는 아무것도 제한하지 않는데, 이는 거의 작성자의 의도가 아닙니다.', '역할이나 정책 이름을 적거나 빈 인수를 지우세요.'],
  { kinds: { Attribute(a, cx) {
    if (a.name !== 'Authorize') return;
    for (const arg of a.args) {
      if (arg.name !== 'Roles' && arg.name !== 'Policy') continue;
      const s = U.strVal(arg.expr);
      if (s != null && !s.replace(/,/g, '').trim()) cx.report(a, `Give [Authorize] a non-empty '${arg.name}' value, or remove it.`, `[Authorize]의 '${arg.name}' 값을 비우지 말거나 지우세요.`);
    }
  } } });

R('aspnet-request-validation-disabled', 'S5753', 'H', 'MA', 10, ['asp.net', 'cwe-79', 'owasp-a3'],
  ['Disabling ASP.NET request validation is security-sensitive', 'Request validation rejects input that looks like HTML or script; turning it off with [ValidateInput(false)] or [AllowHtml] leaves XSS defense to every output.', 'Keep request validation on, or make sure every output of this input is encoded.'],
  ['ASP.NET 요청 검증을 끄는 것은 보안에 민감합니다', '요청 검증은 HTML이나 스크립트로 보이는 입력을 거부하는데, [ValidateInput(false)]나 [AllowHtml]로 끄면 XSS 방어를 모든 출력에 맡깁니다.', '요청 검증을 켜 두거나 이 입력의 모든 출력을 인코딩하는지 확인하세요.'],
  { kinds: { Attribute(a, cx) {
    if (a.name === 'AllowHtml') { cx.report(a, 'Make sure accepting HTML in this property is safe.', '이 속성에서 HTML을 받아도 안전한지 확인하세요.'); return; }
    if (a.name !== 'ValidateInput' || !a.args.length) return;
    const e = unparen(a.args[0].expr);
    if (e && e.k === 'Literal' && e.kind === 'bool' && e.value === false) cx.report(a, 'Make sure disabling request validation here is safe.', '여기서 요청 검증을 꺼도 안전한지 확인하세요.');
  } } });

const MB8 = 8000000;
R('aspnet-request-size-limit', 'S5693', 'H', 'MA', 10, ['asp.net', 'cwe-770', 'owasp-a5'],
  ['Allowing requests with excessive content length is security-sensitive', 'Very large or unlimited request bodies let a client exhaust memory, disk or bandwidth (denial of service).', 'Keep the request and multipart limits at the default (about 8 MB or less) and raise them only for the endpoints that need it.'],
  ['너무 큰 콘텐츠 길이의 요청을 허용하는 것은 보안에 민감합니다', '아주 크거나 제한 없는 요청 본문은 클라이언트가 메모리, 디스크, 대역폭을 고갈시키게 합니다(서비스 거부).', '요청과 멀티파트 제한을 기본값(약 8 MB 이하)으로 두고 필요한 엔드포인트에서만 늘리세요.'],
  { kinds: {
    Attribute(a, cx) {
      const limit = opt(cx, 'maxRequestSize', MB8);
      if (a.name === 'DisableRequestSizeLimit') { cx.report(a, 'Make sure removing the request size limit is safe.', '요청 크기 제한을 없애도 안전한지 확인하세요.'); return; }
      if (a.name === 'RequestSizeLimit' && a.args.length) {
        const v = constNum(a.args[0].expr);
        if (v != null && v > limit) cx.report(a, `Make sure allowing requests of ${v} bytes is safe.`, `${v}바이트 요청을 허용해도 안전한지 확인하세요.`);
        return;
      }
      if (a.name === 'RequestFormLimits') {
        for (const arg of a.args) {
          if (arg.name !== 'MultipartBodyLengthLimit' && arg.name !== 'ValueLengthLimit') continue;
          const v = constNum(arg.expr);
          if (v != null && v > limit) cx.report(a, `Make sure a '${arg.name}' of ${v} bytes is safe.`, `'${arg.name}' ${v}바이트가 안전한지 확인하세요.`);
        }
      }
    },
    Assign(n, cx) { sizeAssign(cx, memberNameOf(n.left), n.right, n); },
    MemberInit(n, cx) { sizeAssign(cx, n.name, n.value, n); },
  } });
function memberNameOf(e) { e = unparen(e); return e && (e.k === 'Member' || e.k === 'Name') ? e.name : null; }
function sizeAssign(cx, name, value, node) {
  if (!['MaxRequestBodySize', 'MultipartBodyLengthLimit', 'MaxRequestLength'].includes(name)) return;
  const limit = opt(cx, 'maxRequestSize', MB8);
  const v = unparen(value);
  if (v && v.k === 'Literal' && v.kind === 'null') { cx.report(node, `Make sure removing the '${name}' limit is safe.`, `'${name}' 제한을 없애도 안전한지 확인하세요.`); return; }
  const num = constNum(v);
  if (num != null && num > limit) cx.report(node, `Make sure a '${name}' of ${num} bytes is safe.`, `'${name}' ${num}바이트가 안전한지 확인하세요.`);
}
function opt(cx, name, def) {
  const o = cx.engine.opts || {};
  return o[name] != null ? o[name] : def;
}

const SAFE_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|([\w-]+\.)*example\.(com|org|net)|([\w-]+\.)*localhost|(www\.)?w3\.org|schemas\.microsoft\.com|schemas\.xmlsoap\.org|schemas\.openxmlformats\.org|purl\.org|json-schema\.org|tempuri\.org|(www\.)?schema\.org|xmlns\.com|ns\.adobe\.com|docs\.oasis-open\.org)$/i;
R('aspnet-clear-text-url', 'S5332', 'H', 'CR', 5, ['cwe-319', 'owasp-a2'],
  ['Using clear-text protocols is security-sensitive', 'http, ftp and telnet send data, cookies and credentials unencrypted, so anyone on the network path can read or change them.', 'Use https, sftp/ftps or ssh instead.'],
  ['평문 프로토콜을 쓰는 것은 보안에 민감합니다', 'http, ftp, telnet은 데이터, 쿠키, 자격 증명을 암호화하지 않고 보내 네트워크 경로의 누구나 읽거나 바꿀 수 있습니다.', 'https, sftp/ftps, ssh를 쓰세요.'],
  { kinds: { Literal(n, cx) {
    if (n.kind !== 'string' || typeof n.value !== 'string') return;
    const m = /^(http|ftp|telnet):\/\/([^/:?#\s]*)/i.exec(n.value);
    if (!m || !m[2] || SAFE_HOSTS.test(m[2])) return;
    if (enclosing(n, ['Attribute'])) return;
    let p = n.parent;
    while (p && (p.k === 'Paren' || p.k === 'Binary' && p.op === '+')) p = p.parent;
    if (p && p.k === 'Binary' && ['==', '!='].includes(p.op)) return;
    if (p && p.k === 'Arg' && p.parent && p.parent.k === 'Invocation' && ['StartsWith', 'EndsWith', 'Contains', 'Equals', 'IndexOf', 'Replace', 'TrimStart', 'Get', 'AddNamespace'].includes(callName(p.parent))) return;
    const proto = m[1].toLowerCase();
    const better = proto === 'http' ? 'https' : proto === 'ftp' ? 'sftp or ftps' : 'ssh';
    cx.report(n, `Using '${proto}' to reach '${m[2]}' is insecure; use ${better} instead.`, `'${m[2]}'에 '${proto}'로 접속하면 안전하지 않습니다. ${better === 'sftp or ftps' ? 'sftp나 ftps' : better}를 쓰세요.`);
  } } });

const SECRET_NAME = /(apikey|secret|token|accesskey|privatekey|signingkey|authkey|subscriptionkey|sastoken|encryptionkey)/;
const NOT_SECRET_NAME = /(name|header|type|url|uri|path|endpoint|field|param|parameter|prefix|suffix|file|query|scheme|claim|cookie|format|id|length|expiry|expiration|expires|lifetime|count|provider|handler|service|validator|issuer|audience|source|location|kind|mode|policy|section|regex|pattern|label|key(s)?name)$/;
function isSecretName(name) {
  if (!name) return false;
  const last = String(name).split(/[:.]/).pop();
  const n = last.replace(/[-_\s]/g, '').toLowerCase();
  return SECRET_NAME.test(n) && !NOT_SECRET_NAME.test(n);
}
function isSecretValue(e) {
  const s = U.strVal(e);
  if (s == null || s.length < 10 || /\s/.test(s)) return false;
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return false;
  if (/^(\$\{|%|<|\{|\[)/.test(s) || /changeme|placeholder|your[-_]|example|xxxx|\*\*\*|todo/i.test(s)) return false;
  if (/^\w+:\/\//.test(s)) return false;
  return true;
}
function reportSecret(cx, node, name) {
  cx.report(node, `'${name}' holds a hard-coded secret; load it from a secret store or configuration.`, `'${name}'에 하드코딩한 비밀 값이 있습니다. 비밀 저장소나 구성에서 읽으세요.`);
}
R('aspnet-hardcoded-secret', 'S6418', 'H', 'BL', 30, ['cwe-798', 'owasp-a7'],
  ['Hard-coded secrets are security-sensitive', 'API keys, tokens and signing keys in source code end up in the repository and binaries, where anyone with access can read and reuse them.', 'Read secrets from a secret store, environment variables or protected configuration (user secrets, Key Vault ...).'],
  ['하드코딩한 비밀 값은 보안에 민감합니다', '소스 코드의 API 키, 토큰, 서명 키는 저장소와 바이너리에 남아 접근할 수 있는 누구나 읽고 다시 쓸 수 있습니다.', '비밀 값은 비밀 저장소, 환경 변수, 보호된 구성(user secrets, Key Vault 등)에서 읽으세요.'],
  { kinds: {
    VarDecl(n, cx) { if (n.init && isSecretName(n.name) && isSecretValue(n.init)) reportSecret(cx, n, n.name); },
    Property(n, cx) { if (n.init && isSecretName(n.name) && isSecretValue(n.init)) reportSecret(cx, n, n.name); },
    Assign(n, cx) {
      if (n.op !== '=' || !isSecretValue(n.right)) return;
      const l = unparen(n.left);
      let name = l.k === 'Name' || l.k === 'Member' ? l.name : null;
      if (l.k === 'Element' && l.args.length === 1) name = U.strVal(l.args[0].expr);
      if (isSecretName(name)) reportSecret(cx, n, name);
    },
    MemberInit(n, cx) { if (isSecretName(n.name) && isSecretValue(n.value)) reportSecret(cx, n, n.name); },
    AnonMember(n, cx) { if (n.name && isSecretName(n.name) && isSecretValue(n.value)) reportSecret(cx, n, n.name); },
    IndexInit(n, cx) {
      const name = n.args.length === 1 ? U.strVal(n.args[0].expr) : null;
      if (isSecretName(name) && isSecretValue(n.value)) reportSecret(cx, n, name);
    },
    ElementInit(n, cx) {
      if (n.items.length !== 2) return;
      const name = U.strVal(n.items[0]);
      if (isSecretName(name) && isSecretValue(n.items[1])) reportSecret(cx, n, name);
    },
  } });

R('aspnet-unencoded-html', '', 'H', 'MA', 10, ['asp.net', 'cwe-79', 'owasp-a3'],
  ['Writing unencoded HTML is security-sensitive', 'Html.Raw, HtmlString, MarkupString and Content(..., "text/html") send the value to the browser as markup; if it contains user input it enables cross-site scripting.', 'Let Razor encode the value, or sanitize it with an HTML sanitizer before marking it as safe.'],
  ['인코딩하지 않은 HTML을 쓰는 것은 보안에 민감합니다', 'Html.Raw, HtmlString, MarkupString, Content(..., "text/html")는 값을 마크업으로 브라우저에 보내므로, 사용자 입력이 들어 있으면 사이트 간 스크립팅이 가능합니다.', 'Razor가 값을 인코딩하게 하거나, 안전하다고 표시하기 전에 HTML 정제기로 정제하세요.'],
  { kinds: {
    Invocation(n, cx) {
      const name = callName(n);
      if (name === 'Raw' && /(^|\.)Html$/.test(dotted(callTarget(n) || {}) || '') && n.args.length && !isLiteralString(n.args[0].expr)) {
        cx.report(n, 'Make sure the value written by Html.Raw is encoded or sanitized.', 'Html.Raw로 쓰는 값이 인코딩되거나 정제되었는지 확인하세요.');
        return;
      }
      if (name === 'Content' && selfCall(n) && n.args.length >= 2 && enclosingController(n)) {
        const ct = U.strVal(n.args[1].expr);
        if (ct && /^text\/html/i.test(ct) && !isLiteralString(n.args[0].expr)) cx.report(n, 'Make sure the HTML returned by Content is encoded or sanitized.', 'Content로 반환하는 HTML이 인코딩되거나 정제되었는지 확인하세요.');
      }
    },
    New(n, cx) {
      if (n.type && n.type.name === 'HtmlString' && n.args.length && !isLiteralString(n.args[0].expr)) cx.report(n, 'Make sure the value wrapped in HtmlString is encoded or sanitized.', 'HtmlString으로 감싼 값이 인코딩되거나 정제되었는지 확인하세요.');
    },
    Cast(n, cx) {
      if (n.type && n.type.name === 'MarkupString' && !isLiteralString(n.expr)) cx.report(n, 'Make sure the value cast to MarkupString is encoded or sanitized.', 'MarkupString으로 캐스팅한 값이 인코딩되거나 정제되었는지 확인하세요.');
    },
  } });

const FILE_SINKS = { Path: ['Combine', 'Join'], File: ['Create', 'WriteAllBytes', 'WriteAllText', 'WriteAllBytesAsync', 'WriteAllTextAsync', 'Open', 'OpenWrite', 'Move', 'Copy', 'AppendAllText'] };
R('aspnet-upload-filename-path', '', 'V', 'CR', 15, ['asp.net', 'cwe-22', 'owasp-a1'],
  ['Uploaded file names should not be used to build file paths', 'IFormFile.FileName comes from the client and may contain "..\\" or an absolute path, so using it in a path lets an attacker write files anywhere (path traversal).', 'Generate the stored file name yourself (for example a GUID), or at least keep only Path.GetFileName of it.'],
  ['업로드한 파일 이름으로 파일 경로를 만들면 안 됩니다', 'IFormFile.FileName은 클라이언트가 보내며 "..\\"나 절대 경로가 들어 있을 수 있어, 경로에 쓰면 공격자가 아무 곳에나 파일을 쓸 수 있습니다(경로 조작).', '저장할 파일 이름을 직접 만들거나(예: GUID) 적어도 Path.GetFileName 결과만 쓰세요.'],
  { kinds: { Member(n, cx) {
    if (n.name !== 'FileName') return;
    const r = unparen(n.expr);
    if (!r || r.k !== 'Name' || !r.sym) return;
    const t = T.symType(r.sym, cx.project);
    if (!t || t.name !== 'IFormFile') return;
    let sink = fileSink(n);
    if (!sink && n.parent && n.parent.k === 'VarDecl' && n.parent.sym) {
      for (const ref of n.parent.sym.refs) { sink = fileSink(ref); if (sink) break; }
    }
    if (!sink) return;
    cx.report(n, `Do not build a file path from the client-supplied '${r.name}.FileName'.`, `클라이언트가 보낸 '${r.name}.FileName'으로 파일 경로를 만들지 마세요.`);
  } } });
function fileSink(e) {
  let p = e.parent;
  while (p && (p.k === 'Binary' && p.op === '+' || p.k === 'Paren' || p.k === 'Interp' || p.k === 'InterpString' || p.k === 'Arg')) {
    if (p.k === 'Arg') {
      const inv = p.parent;
      if (inv && inv.k === 'Invocation') {
        const name = callName(inv);
        const tn = dotted(callTarget(inv) || {});
        if (name === 'GetFileName') return null;
        for (const [cls, ms] of Object.entries(FILE_SINKS)) if (tn && tn.split('.').pop() === cls && ms.includes(name)) return inv;
        return null;
      }
      if (inv && inv.k === 'New') return inv.type && ['FileStream', 'StreamWriter', 'FileInfo'].includes(inv.type.name) ? inv : null;
      return null;
    }
    p = p.parent;
  }
  return null;
}

R('aspnet-open-redirect', '', 'H', 'CR', 10, ['asp.net', 'cwe-601', 'owasp-a1'],
  ['Redirecting to a URL taken from the request is security-sensitive', 'Redirect(returnUrl) with an action parameter lets an attacker craft links to the trusted site that forward victims to a phishing site (open redirect).', 'Use LocalRedirect, or check Url.IsLocalUrl before redirecting.'],
  ['요청에서 받은 URL로 리디렉션하는 것은 보안에 민감합니다', '액션 매개변수로 Redirect(returnUrl)를 하면 공격자가 신뢰하는 사이트 링크로 피해자를 피싱 사이트로 보내게 할 수 있습니다(오픈 리디렉션).', 'LocalRedirect를 쓰거나 리디렉션하기 전에 Url.IsLocalUrl을 확인하세요.'],
  { kinds: {
    Invocation(n, cx) {
      if (!['Redirect', 'RedirectPermanent', 'RedirectPreserveMethod', 'RedirectPermanentPreserveMethod'].includes(callName(n)) || !selfCall(n) || !n.args.length) return;
      checkRedirect(cx, n, n.args[0].expr);
    },
    New(n, cx) { if (n.type && n.type.name === 'RedirectResult' && n.args.length) checkRedirect(cx, n, n.args[0].expr); },
  } });
function checkRedirect(cx, node, arg) {
  const m = enclosingAction(node);
  if (!m) return;
  const root = rootName(arg);
  if (!root || !root.sym || root.sym.kind !== 'param' || root.sym.func !== m) return;
  if (U.identsIn(m).has('IsLocalUrl')) return;
  cx.report(node, `Make sure redirecting to '${root.name}', which comes from the request, is safe; prefer LocalRedirect.`, `요청에서 온 '${root.name}'로 리디렉션해도 안전한지 확인하세요. LocalRedirect를 쓰는 편이 좋습니다.`);
}

const RESPONSES = ['Ok', 'BadRequest', 'StatusCode', 'Content', 'Json', 'Problem', 'NotFound', 'Conflict', 'UnprocessableEntity', 'ValidationProblem', 'InternalServerError', 'Text'];
R('aspnet-exception-details', '', 'V', 'MA', 10, ['asp.net', 'cwe-209', 'owasp-a4'],
  ['Exception details should not be sent in HTTP responses', 'Exception messages, stack traces and inner exceptions reveal internals (paths, SQL, library versions) that help an attacker.', 'Log the exception and return a generic error message or ProblemDetails without the internals.'],
  ['예외 세부 정보를 HTTP 응답으로 보내면 안 됩니다', '예외 메시지, 스택 추적, 내부 예외는 공격자에게 도움이 되는 내부 정보(경로, SQL, 라이브러리 버전)를 드러냅니다.', '예외는 로그로 남기고 내부 정보 없는 일반 오류 메시지나 ProblemDetails를 반환하세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (!RESPONSES.includes(name)) return;
    const t = callTarget(n);
    const tn = t ? dotted(t) : null;
    if (t && !(tn === 'this' || tn === 'base' || tn === 'Results' || tn === 'TypedResults')) return;
    if (!t && !enclosingController(n)) return;
    for (const arg of n.args) {
      const ex = exceptionDetail(arg.expr);
      if (ex) { cx.report(arg, `Do not return details of exception '${ex}' to the client.`, `예외 '${ex}'의 세부 정보를 클라이언트에 반환하지 마세요.`); return; }
    }
  } } });
function exceptionDetail(e) {
  e = unparen(e);
  if (!e) return null;
  const isCatch = (x) => { x = unparen(x); return x && x.k === 'Name' && x.sym && x.sym.kind === 'catch' ? x.name : null; };
  if (isCatch(e)) return isCatch(e);
  if (e.k === 'Member' && ['Message', 'StackTrace', 'InnerException'].includes(e.name)) return isCatch(e.expr) || exceptionDetail(e.expr);
  if (e.k === 'Invocation' && callName(e) === 'ToString' && callTarget(e)) return isCatch(callTarget(e));
  if (e.k === 'InterpString') { for (const p of e.parts) if (p.k === 'Interp') { const r = exceptionDetail(p.expr); if (r) return r; } }
  if (e.k === 'Binary' && e.op === '+') return exceptionDetail(e.left) || exceptionDetail(e.right);
  if (e.k === 'AnonNew') { for (const m of e.members) { const r = exceptionDetail(m.value); if (r) return r; } }
  return null;
}

module.exports = { isController, isApiController, actionsOf };
