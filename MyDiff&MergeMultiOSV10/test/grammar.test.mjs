/**
 * The lexer, and the two jobs it does.
 *
 * Syntax highlighting is forgiving — a mis-coloured word is a blemish. Deciding what
 * counts as a difference is not: if "ignore comments" quietly swallowed a line of
 * code, the comparison would lie. So the significance rules are pinned down here
 * case by case, and every rule is also checked for what it must *not* remove.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_STATE,
  languageFor,
  significant,
  significantLines,
  tokenize,
  tokenizeLines,
} from "../core/grammar.ts";

const c = languageFor("x.ts");
const py = languageFor("x.py");
const sql = languageFor("x.sql");
const html = languageFor("x.html");
const plain = languageFor("notes.txt");

/**
 * The interesting tokens as `kind:text`. The plain runs between them are left out —
 * they are whatever is not a comment, string, number or keyword, and listing them
 * would only make each assertion harder to read.
 */
function spans(line, language, state = INITIAL_STATE) {
  const { tokens } = tokenize(line, language, state);
  return tokens
    .filter((token) => token.kind !== "plain")
    .map((token) => `${token.kind}:${line.slice(token.start, token.end)}`);
}

/* ------------------------------------------------------------------ *
 * Picking a language
 * ------------------------------------------------------------------ */

test("grammar › the language comes from the file extension", () => {
  assert.equal(languageFor("src/App.tsx").id, "c-like");
  assert.equal(languageFor("/a/b/main.py").id, "python");
  assert.equal(languageFor("C:\\x\\build.gradle.kts").id, "c-like");
  assert.equal(languageFor("deploy.sh").id, "shell");
  assert.equal(languageFor("config.yaml").id, "config");
  assert.equal(languageFor("index.html").id, "markup");
  assert.equal(languageFor("notes.txt").id, "plain", "an unknown extension is plain text");
  assert.equal(languageFor(null).id, "plain");
});

test("grammar › an extensionless name is still recognised where it should be", () => {
  assert.equal(languageFor(".gitignore").id, "config");
  assert.equal(languageFor("/home/me/.bashrc").id, "shell");
});

/* ------------------------------------------------------------------ *
 * Lexing
 * ------------------------------------------------------------------ */

test("grammar › comments, strings, numbers and keywords are told apart", () => {
  assert.deepEqual(
    spans('const x = 42; // the answer', c),
    ["keyword:const", "number:42", "comment:// the answer"],
  );
  assert.deepEqual(spans('return "hi";', c), ["keyword:return", 'string:"hi"']);
  assert.deepEqual(spans("x = 'a'", py), ["string:'a'"]);
});

test("grammar › a string containing a comment marker stays a string", () => {
  assert.deepEqual(spans('const url = "http://example.com";', c), [
    "keyword:const",
    'string:"http://example.com"',
  ]);
});

test("grammar › an escaped quote does not end the string", () => {
  assert.deepEqual(spans('x = "a\\"b" + 1', c), ['string:"a\\"b"', "number:1"]);
});

test("grammar › a block comment carries over to the next line", () => {
  const first = tokenize("code; /* open", c);
  assert.equal(first.next.comment, "*/");
  const second = tokenize("still comment", c, first.next);
  assert.deepEqual(second.tokens, [{ start: 0, end: 13, kind: "comment" }]);
  assert.equal(second.next.comment, "*/", "and keeps carrying");

  const third = tokenize("done */ after", c, second.next);
  assert.equal(third.next.comment, null);
  assert.equal(third.tokens[0].kind, "comment");
});

test("grammar › a template string carries over too", () => {
  const first = tokenize("const t = `line one", c);
  assert.equal(first.next.string, "`");
  const second = tokenize("line two`;", c, first.next);
  assert.equal(second.tokens[0].kind, "string");
  assert.equal(second.next.string, null);
});

test("grammar › a Python triple-quoted string spans lines", () => {
  const first = tokenize('doc = """start', py);
  assert.equal(first.next.string, '"""');
  const second = tokenize('end"""', py, first.next);
  assert.equal(second.tokens[0].kind, "string");
  assert.equal(second.next.string, null);
});

test("grammar › SQL and HTML use their own comment markers", () => {
  assert.deepEqual(spans("select 1 -- note", sql), ["keyword:select", "number:1", "comment:-- note"]);
  assert.deepEqual(spans("<p>x</p><!-- note -->", html), ["comment:<!-- note -->"]);
});

test("grammar › plain text has no tokens worth the name", () => {
  const { tokens } = tokenize("just some words // not a comment", plain);
  assert.ok(tokens.every((token) => token.kind === "plain"));
});

test("grammar › tokenizing a file carries state from line to line", () => {
  const lines = ["a = 1; /* open", "middle", "*/ b = 2;"];
  const perLine = tokenizeLines(lines, c);
  assert.equal(perLine[1].length, 1);
  assert.equal(perLine[1][0].kind, "comment", "the middle line is entirely a comment");
  assert.ok(perLine[2].some((token) => token.kind === "number"), "and the file recovers");
});

/* ------------------------------------------------------------------ *
 * Significance: what counts as a difference
 * ------------------------------------------------------------------ */

const sig = (line, options, language = c) => significant(line, language, options).text;

test("grammar › with no rules on, a line is compared exactly as written", () => {
  const line = '  const x = 1; // hi';
  assert.equal(sig(line, {}), line);
});

test("grammar › ignoring comments removes them, and the space they left", () => {
  assert.equal(sig("const x = 1; // hi", { ignoreComments: true }), "const x = 1;");
  assert.equal(sig("const x = 1; /* hi */", { ignoreComments: true }), "const x = 1;");
  assert.equal(sig("// nothing but a comment", { ignoreComments: true }), "");
});

test("grammar › ignoring comments does not touch a comment marker inside a string", () => {
  const line = 'const url = "http://x";';
  assert.equal(sig(line, { ignoreComments: true }), line, "the URL survives intact");
});

test("grammar › two lines differing only in a comment compare as the same", () => {
  const options = { ignoreComments: true };
  assert.equal(sig("i++; // fixed", options), sig("i++;", options));
  // But a real change still differs.
  assert.notEqual(sig("i++; // fixed", options), sig("i--; // fixed", options));
});

test("grammar › ignoring the quote style makes '\\'a\\'' and '\"a\"' the same", () => {
  const options = { ignoreQuoteStyle: true };
  assert.equal(sig("x = 'a'", options), sig('x = "a"', options));
  // The contents still matter.
  assert.notEqual(sig("x = 'a'", options), sig('x = "b"', options));
  // And without the rule they are different lines.
  assert.notEqual(sig("x = 'a'", {}), sig('x = "a"', {}));
});

test("grammar › ignoring number formatting equates the same value written differently", () => {
  const options = { ignoreNumberFormat: true };
  assert.equal(sig("x = 0x10", options), sig("x = 16", options));
  assert.equal(sig("x = 1_000", options), sig("x = 1000", options));
  assert.equal(sig("x = 1.50", options), sig("x = 1.5", options));
  assert.notEqual(sig("x = 16", options), sig("x = 17", options));
});

test("grammar › whitespace and case rules still apply on top", () => {
  assert.equal(
    sig("   const   x = 1;   // hi", { ignoreComments: true, ignoreWhitespace: true }),
    "const x = 1;",
  );
  assert.equal(sig("CONST X", { ignoreCase: true }), "const x");
});

test("grammar › a comment rule respects a block comment that spans lines", () => {
  const lines = ["code one; /* a", "   still the comment", "*/ code two;"];
  assert.deepEqual(
    significantLines(lines, c, { ignoreComments: true }),
    ["code one;", "", " code two;"],
  );
});

test("grammar › a # only starts a comment where the language says it does", () => {
  const config = languageFor("a.yml");
  const css = languageFor("a.css");

  // In YAML a space before the # does start a comment — that is the real rule.
  assert.equal(sig("key: value # note", { ignoreComments: true }, config), "key: value");
  // But one joined to a value does not, and CSS has no # comment at all.
  assert.equal(sig("key: a#b", { ignoreComments: true }, config), "key: a#b");
  assert.equal(sig("color: #fff;", { ignoreComments: true }, css), "color: #fff;");
  // Nor does one inside a string.
  assert.equal(sig("key: \"a # b\"", { ignoreComments: true }, config), "key: \"a # b\"");
});

test("grammar › a ; joined to a value is not an ini comment", () => {
  const ini = languageFor("a.ini");
  assert.equal(sig("path=a;b", { ignoreComments: true }, ini), "path=a;b");
  assert.equal(sig("path=a ; note", { ignoreComments: true }, ini), "path=a");
});

test("grammar › Batch's 'rem' only starts a comment when it stands alone", () => {
  const bat = languageFor("run.bat");
  assert.equal(sig("rem a note", { ignoreComments: true }, bat), "");
  assert.equal(sig("foremost thing", { ignoreComments: true }, bat), "foremost thing");
});
