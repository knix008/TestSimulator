'use strict';

// MISRA C:2012 Amendment 3 / MISRA C:2023 chapter 23 — generic selections.

const A = require('../lib/a-util');
const B = require('../lib/b-common');

const { cf, T, rule, msg, nodes, text, canon, isUserLoc } = B;

const fromMacro = (g) => !!(g.loc && g.loc.macro);

function assocTypeText(a) {
  return a.isDefault ? 'default' : T.typeToString(a.typeName && a.typeName.ctype);
}

// Split a token list at top-level commas.
function splitTop(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
    else if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
    if (t.value === ',' && depth === 0) { parts.push([]); continue; }
    parts[parts.length - 1].push(t);
  }
  return parts;
}

// _Generic ( control , type : expr , ... ) in a macro body: [{ start, end, control: Token[], assocs: Token[][] }]
function genericsInBody(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i].value !== '_Generic' || !body[i + 1] || body[i + 1].value !== '(') continue;
    let depth = 0;
    let j = i + 1;
    for (; j < body.length; j++) {
      if (body[j].value === '(') depth++;
      else if (body[j].value === ')') { depth--; if (depth === 0) break; }
    }
    const inner = body.slice(i + 2, j);
    const parts = splitTop(inner);
    const assocs = parts.slice(1).map((p) => {
      let d = 0;
      for (let k = 0; k < p.length; k++) {
        const v = p[k].value;
        if (v === '(' || v === '[') d++;
        else if (v === ')' || v === ']') d--;
        else if (v === ':' && d === 0) return p.slice(k + 1);
      }
      return p;
    });
    out.push({ start: i, end: j, control: parts[0], assocs });
    i = j;
  }
  return out;
}

module.exports = [
  rule({
    id: '23.1', cat: 'Advisory', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A generic selection should only be expanded from a macro', '일반 선택은 매크로 확장으로만 써야 합니다'],
    why: ['Written directly in code, a generic selection only chooses on a type that is already known there; its purpose is to build type-generic macros.', '코드에 직접 쓴 일반 선택은 이미 알고 있는 형으로만 선택할 뿐이며, 본래 목적은 형 일반 매크로를 만드는 것입니다.'],
    fix: ['Wrap the generic selection in a function-like macro, or call the intended function directly.', '일반 선택을 함수형 매크로로 감싸거나 의도한 함수를 직접 호출하세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) if (!fromMacro(g)) api.report(g, msg('This generic selection is not expanded from a macro.', '이 일반 선택은 매크로 확장에서 나온 것이 아닙니다.'));
    },
  }),
  rule({
    id: '23.2', cat: 'Required', type: 'BUG', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A generic selection not from a macro shall have no side effects in its controlling expression', '매크로에서 나오지 않은 일반 선택의 제어 식에는 부작용이 없어야 합니다'],
    why: ['The controlling expression of _Generic is never evaluated, so its side effects silently do not happen.', '_Generic의 제어 식은 평가되지 않으므로 그 부작용은 조용히 일어나지 않습니다.'],
    fix: ['Move the side effect out of the controlling expression.', '부작용을 제어 식 밖으로 옮기세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) {
        if (fromMacro(g)) continue;
        const eff = B.sideEffects(g.control, unit);
        if (eff.length) api.report(g.control, msg(`The controlling expression '${text(unit, g.control)}' has a side effect that is never evaluated.`, `제어 식 '${text(unit, g.control)}'의 부작용은 평가되지 않습니다.`));
      }
    },
  }),
  rule({
    id: '23.3', cat: 'Advisory', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A generic selection should have at least one non-default association', '일반 선택에는 default가 아닌 연관이 하나 이상 있어야 합니다'],
    why: ['A generic selection with only a default always yields the same expression and selects nothing.', 'default만 있는 일반 선택은 항상 같은 식을 내므로 아무것도 선택하지 않습니다.'],
    fix: ['Add the type associations, or replace the selection by its expression.', '형 연관을 추가하거나 선택을 그 식으로 바꾸세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) if (!g.assocs.some((a) => !a.isDefault)) api.report(g, msg('The generic selection has only a default association.', '일반 선택에 default 연관만 있습니다.'));
    },
  }),
  rule({
    id: '23.4', cat: 'Required', type: 'BUG', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A generic association shall name an appropriate type', '일반 연관에는 적절한 형을 써야 합니다'],
    why: ['The controlling expression undergoes lvalue conversion, so qualified, atomic, array and function types can never match and variably modified types are not allowed.', '제어 식은 lvalue 변환을 거치므로 한정된 형, 원자 형, 배열 형, 함수 형은 결코 일치하지 않고 가변 수정 형은 허용되지 않습니다.'],
    fix: ['List the unqualified object type, or the pointer type an array or function decays to.', '한정자 없는 객체 형이나, 배열·함수가 변환되는 포인터 형을 쓰세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) {
        for (const a of g.assocs) {
          if (a.isDefault || !a.typeName) continue;
          const t = a.typeName.ctype;
          const c = canon(t);
          if (!c) continue;
          const q = T.qualsOf ? T.qualsOf(t) : {};
          let why = null;
          if (q.const || q.volatile || q.restrict || (c && (c.const || c.volatile))) why = 'is qualified';
          else if (q.atomic || c.atomic) why = 'is atomic';
          else if (c.kind === 'array') why = B.isVlaType(c) ? 'is variably modified' : 'is an array type';
          else if (c.kind === 'function') why = 'is a function type';
          else if (c.kind === 'pointer' && B.isVlaType(c.to)) why = 'is variably modified';
          if (why) api.report(a, msg(`The association type '${assocTypeText(a)}' ${why} and can never be selected.`, `연관 형 '${assocTypeText(a)}'은(는) 선택될 수 없는 형입니다(${why}).`));
        }
      }
    },
  }),
  rule({
    id: '23.5', cat: 'Advisory', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A generic selection should not depend on implicit pointer conversion', '일반 선택은 암시적 포인터 변환에 의존하지 않아야 합니다'],
    why: ['_Generic matches pointer types exactly; a pointer that differs only in qualifiers falls through to default although a call would convert it.', '_Generic은 포인터 형을 정확히 비교하므로, 한정자만 다른 포인터는 함수 호출이라면 변환되었을 것과 달리 default로 빠집니다.'],
    fix: ['Add associations for the qualified and unqualified pointer types, or convert the argument explicitly.', '한정된 포인터 형과 한정되지 않은 포인터 형의 연관을 추가하거나 인자를 명시적으로 변환하세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) {
        const ct = canon(g.control && g.control.ctype && T.decay(g.control.ctype));
        if (!ct || ct.kind !== 'pointer') continue;
        const sel = g.assocs[g.selected];
        if (sel && !sel.isDefault) continue;
        const near = g.assocs.find((a) => {
          if (a.isDefault || !a.typeName) return false;
          const at = canon(a.typeName.ctype);
          if (!at || at.kind !== 'pointer') return false;
          return A.sameType(at.to, ct.to, { ignoreQuals: true }) || T.isVoid(canon(at.to));
        });
        if (near) api.report(g, msg(`The controlling type '${T.typeToString(ct)}' only matches '${assocTypeText(near)}' through an implicit pointer conversion, so default is selected.`, `제어 형 '${T.typeToString(ct)}'은(는) 암시적 포인터 변환을 거쳐야 '${assocTypeText(near)}'와(과) 일치하므로 default가 선택됩니다.`));
      }
    },
  }),
  rule({
    id: '23.6', cat: 'Required', type: 'BUG', debt: 5, decidable: true, amd: 'AMD3',
    name: ['The controlling expression\'s essential type shall match its standard type', '제어 식의 본질적 형은 표준 형과 일치해야 합니다'],
    why: ['_Generic chooses on the standard C type, so a character constant, Boolean comparison or enum constant selects the int association, not the one the essential type suggests.', '_Generic은 표준 C 형으로 선택하므로 문자 상수, 불리언 비교, 열거 상수는 본질적 형이 암시하는 연관이 아닌 int 연관을 선택합니다.'],
    fix: ['Cast the controlling expression to the intended type.', '제어 식을 의도한 형으로 형 변환하세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) {
        const ctl = g.control;
        if (!ctl || !ctl.ctype) continue;
        const et = cf.essentialType(ctl, { target: unit.target });
        const st = cf.essentialTypeOfType(ctl.ctype, { target: unit.target });
        if (!et || !st) continue;
        if ((et.category === 'signed' || et.category === 'unsigned') && et.ice) continue; // constants of lower rank are allowed
        let size = null;
        try { size = T.sizeOf(canon(ctl.ctype), unit.target); } catch (err) { size = null; }
        if (et.category !== st.category || (size != null && et.size != null && et.size !== size && ['signed', 'unsigned', 'floating'].includes(et.category))) {
          api.report(ctl, msg(`The controlling expression '${text(unit, ctl)}' is essentially '${et.name}' but has standard type '${T.typeToString(ctl.ctype)}'.`, `제어 식 '${text(unit, ctl)}'의 본질적 형은 '${et.name}'이지만 표준 형은 '${T.typeToString(ctl.ctype)}'입니다.`));
        }
      }
    },
  }),
  rule({
    id: '23.7', cat: 'Advisory', debt: 10, decidable: true, amd: 'AMD3',
    name: ['A generic selection in a macro should evaluate its argument only once', '매크로의 일반 선택은 인자를 한 번만 평가해야 합니다'],
    why: ['If the macro argument appears several times in the evaluated part of the expansion, its side effects happen several times.', '매크로 인자가 확장의 평가되는 부분에 여러 번 나오면 그 부작용이 여러 번 일어납니다.'],
    fix: ['Use the argument once in each association, and not outside the generic selection as well.', '각 연관에서 인자를 한 번만 쓰고, 일반 선택 밖에서 다시 쓰지 마세요.'],
    check(unit, api) {
      for (const m of unit.macros) {
        if (!isUserLoc(m) || m.kind !== 'function') continue;
        const gens = genericsInBody(m.body);
        if (!gens.length) continue;
        const params = m.variadic ? [...m.params, m.vaName || '__VA_ARGS__'] : m.params;
        for (const p of params) {
          const count = (toks) => toks.filter((t) => t.value === p).length;
          let inGen = 0;
          let outside = count(m.body);
          for (const g of gens) {
            const all = count(m.body.slice(g.start, g.end + 1));
            outside -= all;
            inGen = Math.max(inGen, ...g.assocs.map(count), 0);
          }
          const usedInControl = gens.some((g) => count(g.control));
          if (!usedInControl) continue;
          if (inGen + outside > 1) {
            api.report(m, msg(`Macro '${m.name}' evaluates its argument '${p}' more than once around its generic selection.`, `매크로 '${m.name}'이(가) 일반 선택 주변에서 인자 '${p}'을(를) 두 번 이상 평가합니다.`));
          }
        }
      }
    },
  }),
  rule({
    id: '23.8', cat: 'Required', debt: 5, decidable: true, amd: 'AMD3',
    name: ['A default association shall be first or last', 'default 연관은 처음이나 마지막에 있어야 합니다'],
    why: ['A default in the middle of the association list is easy to overlook.', '연관 목록 중간의 default는 놓치기 쉽습니다.'],
    fix: ['Move the default association to the start or the end of the list.', 'default 연관을 목록의 처음이나 끝으로 옮기세요.'],
    check(unit, api) {
      for (const g of nodes(unit, 'GenericSelection')) {
        const i = g.assocs.findIndex((a) => a.isDefault);
        if (i > 0 && i < g.assocs.length - 1) api.report(g.assocs[i], msg('The default association is neither the first nor the last association.', 'default 연관이 첫 번째나 마지막 연관이 아닙니다.'));
      }
    },
  }),
];
