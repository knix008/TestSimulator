// Samples for the extra textbook algorithms. Each program reads the input box
// and prints the same line as expectedOutput(). Numbers are taken in order;
// a trailing target, k, amount, n or exponent is the last integer.
const pyNums = (body) => `import re, sys
nums = [int(x) for x in re.findall(r'-?\\d+', sys.stdin.read())]
${body}
`;

const jsNums = (body) => `const fs = require('fs');
const text = fs.readFileSync(0, 'utf8');
const nums = text.split(/[^0-9-]+/).filter(Boolean).map(Number);
${body}
`;

const cppHead = `#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>
using namespace std;
static vector<int> ints(const string& s) {
    vector<int> a;
    for (size_t i = 0; i < s.size();) {
        if (s[i] == '-' || isdigit((unsigned char)s[i])) {
            char* end = nullptr; long v = strtol(s.c_str() + i, &end, 10);
            if (end == s.c_str() + i) { i++; continue; }
            a.push_back((int)v); i = (size_t)(end - s.c_str());
        } else i++;
    }
    return a;
}
`;

const cppNums = (body) => `${cppHead}
int main() {
    string raw((istreambuf_iterator<char>(cin)), {});
    vector<int> nums = ints(raw);
${body}
}
`;

const javaNums = (body) => `import java.util.*;
public class Main {
    static int[] ints(String s) {
        Scanner sc = new Scanner(s.replace(',', ' '));
        ArrayList<Integer> list = new ArrayList<>();
        while (sc.hasNext()) { if (sc.hasNextInt()) list.add(sc.nextInt()); else sc.next(); }
        return list.stream().mapToInt(Integer::intValue).toArray();
    }
    public static void main(String[] args) throws Exception {
        String text = new String(System.in.readAllBytes());
        int[] nums = ints(text);
${body}
    }
}
`;

const goNums = (body) => `package main
import ("fmt"; "io"; "os"; "regexp"; "strconv")
func main() {
    b, _ := io.ReadAll(os.Stdin)
    matches := regexp.MustCompile("-?\\\\d+").FindAllString(string(b), -1)
    nums := make([]int, len(matches))
    for i, s := range matches { nums[i], _ = strconv.Atoi(s) }
${body}
}
`;

const rustNums = (body) => `use std::io::Read;
fn main() {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).ok();
    let nums: Vec<i64> = raw.split(|c: char| !c.is_ascii_digit() && c != '-').filter(|s| !s.is_empty() && *s != "-").filter_map(|s| s.parse().ok()).collect();
${body}
}
`;

const cPrelude = String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

static char *read_all(void) {
    size_t cap = 4096, n = 0; char *buf = malloc(cap); int ch;
    while ((ch = getchar()) != EOF) {
        if (n + 2 >= cap) { cap *= 2; buf = realloc(buf, cap); }
        buf[n++] = (char)ch;
    }
    buf[n] = '\0';
    return buf;
}
static int read_ints(int **out) {
    char *text = read_all(), *p = text; int cap = 16, n = 0;
    int *a = malloc((size_t)cap * sizeof(int));
    while (*p) {
        while (*p && *p != '-' && !isdigit((unsigned char)*p)) p++;
        if (!*p) break;
        char *end = p; long v = strtol(p, &end, 10);
        if (end == p) break;
        if (n == cap) { cap *= 2; a = realloc(a, (size_t)cap * sizeof(int)); }
        a[n++] = (int)v; p = end;
    }
    free(text); *out = a; return n;
}
static void show(const int *a, int n) {
    for (int i = 0; i < n; i++) { if (i) printf(" "); printf("%d", a[i]); }
    printf("\n");
}
static int cmp_int(const void *p, const void *q) {
    int x = *(const int *)p, y = *(const int *)q;
    return (x > y) - (x < y);
}
`;

const cNums = (body) => `${cPrelude}
int main(void) {
    int *nums = NULL; int n = read_ints(&nums);
${body}
    free(nums); return 0;
}
`;

const py = {
  'cocktail-sort': pyNums(`a = nums[:]  # @0
start, end, swapped = 0, len(a) - 1, True  # @1
while swapped:  # @2
    swapped = False
    for i in range(start, end):  # @3
        if a[i] > a[i + 1]:
            a[i], a[i + 1] = a[i + 1], a[i]
            swapped = True
    end -= 1
    if not swapped:
        break
    swapped = False
    for i in range(end - 1, start - 1, -1):  # @4
        if a[i] > a[i + 1]:
            a[i], a[i + 1] = a[i + 1], a[i]
            swapped = True
    start += 1
print(*a)`),
  'comb-sort': pyNums(`a = nums[:]  # @0
gap, swapped = len(a), True  # @1
while gap > 1 or swapped:  # @2
    gap = max(1, int(gap / 1.3))  # @3
    swapped = False
    for i in range(len(a) - gap):  # @4
        if a[i] > a[i + gap]:
            a[i], a[i + gap] = a[i + gap], a[i]
            swapped = True
print(*a)`),
  'gnome-sort': pyNums(`a = nums[:]  # @0
i = 0  # @1
while i < len(a):
    if i == 0 or a[i] >= a[i - 1]:  # @2
        i += 1
    else:  # @3
        a[i], a[i - 1] = a[i - 1], a[i]
        i -= 1
print(*a)`),
  'odd-even-sort': pyNums(`a = nums[:]  # @0
swapped, phase = True, 0  # @1
while swapped:
    swapped = False
    begin = phase % 2
    for i in range(begin, len(a) - 1, 2):  # @2
        if a[i] > a[i + 1]:
            a[i], a[i + 1] = a[i + 1], a[i]
            swapped = True
    phase += 1  # @4
print(*a)`),
  'counting-sort': pyNums(`a = nums[:]  # @0
count = [0] * (max(a) + 1)  # @1
for v in a:
    count[v] += 1
i = 0  # @2
for v in range(len(count)):  # @3
    for _ in range(count[v]):  # @4
        a[i] = v
        i += 1
print(*a)`),
  'pancake-sort': pyNums(`a = nums[:]  # @0
def flip(k):
    a[:k] = reversed(a[:k])
for size in range(len(a), 1, -1):  # @1
    m = max(range(size), key=lambda i: a[i])  # @2
    if m != size - 1:
        if m:  # @3
            flip(m + 1)
        flip(size)  # @4
print(*a)`),
  'dutch-flag': pyNums(`a = nums[:]  # @0
lo = mid = 0  # @1
hi = len(a) - 1
while mid <= hi:  # @2
    if a[mid] == 0:  # @3
        a[lo], a[mid] = a[mid], a[lo]
        lo += 1
        mid += 1
    elif a[mid] == 2:  # @4
        a[mid], a[hi] = a[hi], a[mid]
        hi -= 1
    else:  # @5
        mid += 1
print(*a)`),
  'jump-search': pyNums(`target, a = nums[-1], sorted(nums[:-1])  # @0
step = max(1, int(len(a) ** 0.5))  # @1
prev = end = 0
end = step
while prev < len(a) and a[min(end, len(a)) - 1] < target:  # @2
    prev, end = end, end + step
found = -1
for i in range(prev, min(end, len(a))):  # @3
    if a[i] == target:
        found = i
        break
    if a[i] > target:
        break
print(found)`),
  'interpolation-search': pyNums(`target, a = nums[-1], sorted(nums[:-1])  # @0
lo, hi, found = 0, len(a) - 1, -1
while lo <= hi and target >= a[lo] and target <= a[hi]:
    if a[hi] == a[lo]:
        found = lo if a[lo] == target else -1
        break
    pos = lo + (target - a[lo]) * (hi - lo) // (a[hi] - a[lo])  # @1
    if a[pos] == target:  # @2
        found = pos
        break
    if a[pos] < target:
        lo = pos + 1
    else:
        hi = pos - 1
print(found)`),
  'exponential-search': pyNums(`target, a = nums[-1], sorted(nums[:-1])  # @0
found = 0 if a and a[0] == target else -1
if found < 0:
    bound = 1  # @1
    while bound < len(a) and a[bound] < target:  # @2
        bound *= 2
    lo, hi = bound // 2, min(bound, len(a) - 1)
    while lo <= hi:  # @3
        mid = (lo + hi) // 2
        if a[mid] == target:
            found = mid
            break
        if a[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
print(found)`),
  'quickselect': pyNums(`k, a = nums[-1], nums[:-1]  # @0
want, lo, hi = k - 1, 0, len(a) - 1
while lo <= hi:
    pivot, i = a[hi], lo  # @1
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    if i == want:  # @2
        print(a[i])
        break
    if i < want:  # @3
        lo = i + 1
    else:
        hi = i - 1`),
  'kadane': pyNums(`a = nums  # @0
best = cur = a[0]  # @1
for x in a[1:]:  # @2
    cur = max(x, cur + x)  # @3
    best = max(best, cur)  # @4
print(best)`),
  'coin-change': pyNums(`coins, amount = nums[:-1], nums[-1]  # @0
dp = [None] * (amount + 1)  # @1
dp[0] = 0
for c in coins:  # @2
    for x in range(c, amount + 1):  # @3
        if dp[x - c] is not None and (dp[x] is None or dp[x - c] + 1 < dp[x]):  # @4
            dp[x] = dp[x - c] + 1
print(-1 if dp[amount] is None else dp[amount])`),
  'lis': pyNums(`a = nums  # @0
length = [1] * len(a)  # @1
for i in range(1, len(a)):  # @2
    for j in range(i):  # @3
        if a[j] < a[i]:  # @4
            length[i] = max(length[i], length[j] + 1)
print(max(length))`),
  'activity-selection': pyNums(`acts = sorted(zip(nums[0::2], nums[1::2]), key=lambda t: (t[1], t[0]))  # @1
last = count = 0
last = -1
for s, f in acts:  # @3
    if s >= last:
        count += 1
        last = f
print(count)`),
  'factorial': pyNums(`n = nums[0]  # @0
f = 1  # @1
for i in range(1, n + 1):  # @2
    f *= i  # @3
print(f)  # @4`),
  'fast-power': pyNums(`base, exp = nums[0], nums[1]  # @0
result = 1  # @1
while exp > 0:  # @2
    if exp % 2:  # @3
        result *= base
    exp //= 2  # @4
    if exp:
        base *= base
print(result)`),
  'naive-search': `import sys
keys = {}
for raw in sys.stdin.read().splitlines():
    line = raw.split('#')[0].strip()
    if not line:
        continue
    head, sep, tail = line.partition(':')
    if sep and head.replace('_', '').isalpha():
        keys[head.strip().lower()] = tail.strip()
text, pattern = keys['text'], keys['pattern']  # @0
found = []
for s in range(len(text) - len(pattern) + 1):  # @1
    matched = 0  # @2
    while matched < len(pattern) and text[s + matched] == pattern[matched]:
        matched += 1
    if matched == len(pattern):  # @3
        found.append(s)
print(' '.join(map(str, found)) if found else 'none')
`,
};

function jsSearch(body) {
  return jsNums(`const target = nums[nums.length - 1];
const a = nums.slice(0, -1).sort((x, y) => x - y);
${body}`);
}

const js = {
  'cocktail-sort': jsNums(`const a = nums.slice(); // @0
let start = 0, end = a.length - 1, swapped = true; // @1
while (swapped) { // @2
  swapped = false;
  for (let i = start; i < end; i++) if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; } // @3
  end -= 1;
  if (!swapped) break;
  swapped = false;
  for (let i = end - 1; i >= start; i--) if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; } // @4
  start += 1;
}
console.log(a.join(' '));`),
  'comb-sort': jsNums(`const a = nums.slice(); // @0
let gap = a.length, swapped = true; // @1
while (gap > 1 || swapped) { // @2
  gap = Math.max(1, Math.floor(gap / 1.3)); // @3
  swapped = false;
  for (let i = 0; i + gap < a.length; i++) if (a[i] > a[i + gap]) { [a[i], a[i + gap]] = [a[i + gap], a[i]]; swapped = true; } // @4
}
console.log(a.join(' '));`),
  'gnome-sort': jsNums(`const a = nums.slice(); // @0
let i = 0; // @1
while (i < a.length) {
  if (i === 0 || a[i] >= a[i - 1]) i += 1; // @2
  else { [a[i], a[i - 1]] = [a[i - 1], a[i]]; i -= 1; } // @3
}
console.log(a.join(' '));`),
  'odd-even-sort': jsNums(`const a = nums.slice(); // @0
let swapped = true, phase = 0; // @1
while (swapped) {
  swapped = false;
  for (let i = phase % 2; i + 1 < a.length; i += 2) if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; } // @2
  phase += 1;
}
console.log(a.join(' '));`),
  'counting-sort': jsNums(`const a = nums.slice(); // @0
const count = Array(Math.max(...a) + 1).fill(0); // @1
for (const v of a) count[v] += 1;
let i = 0; // @2
for (let v = 0; v < count.length; v++) for (let c = 0; c < count[v]; c++) a[i++] = v; // @4
console.log(a.join(' '));`),
  'pancake-sort': jsNums(`const a = nums.slice(); // @0
const flip = (k) => { for (let i = 0, j = k - 1; i < j; i++, j--) [a[i], a[j]] = [a[j], a[i]]; };
for (let size = a.length; size > 1; size--) { // @1
  let m = 0; for (let i = 1; i < size; i++) if (a[i] > a[m]) m = i; // @2
  if (m !== size - 1) { if (m) flip(m + 1); flip(size); } // @4
}
console.log(a.join(' '));`),
  'dutch-flag': jsNums(`const a = nums.slice(); // @0
let lo = 0, mid = 0, hi = a.length - 1; // @1
while (mid <= hi) { // @2
  if (a[mid] === 0) { [a[lo], a[mid]] = [a[mid], a[lo]]; lo++; mid++; } // @3
  else if (a[mid] === 2) { [a[mid], a[hi]] = [a[hi], a[mid]]; hi--; } // @4
  else mid++; // @5
}
console.log(a.join(' '));`),
  'jump-search': jsSearch(`const step = Math.max(1, Math.floor(Math.sqrt(a.length))); // @1
let prev = 0, end = step, found = -1;
while (prev < a.length && a[Math.min(end, a.length) - 1] < target) { prev = end; end += step; } // @2
for (let i = prev; i < Math.min(end, a.length); i++) { // @3
  if (a[i] === target) { found = i; break; }
  if (a[i] > target) break;
}
console.log(found);`),
  'interpolation-search': jsSearch(`let lo = 0, hi = a.length - 1, found = -1;
while (lo <= hi && target >= a[lo] && target <= a[hi]) {
  if (a[hi] === a[lo]) { found = a[lo] === target ? lo : -1; break; }
  const pos = lo + Math.floor(((target - a[lo]) * (hi - lo)) / (a[hi] - a[lo])); // @1
  if (a[pos] === target) { found = pos; break; } // @2
  if (a[pos] < target) lo = pos + 1; else hi = pos - 1;
}
console.log(found);`),
  'exponential-search': jsSearch(`let found = a[0] === target ? 0 : -1;
if (found < 0) {
  let bound = 1; // @1
  while (bound < a.length && a[bound] < target) bound *= 2; // @2
  let lo = Math.floor(bound / 2), hi = Math.min(bound, a.length - 1);
  while (lo <= hi) { // @3
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] === target) { found = mid; break; }
    if (a[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
}
console.log(found);`),
  'quickselect': jsNums(`const k = nums[nums.length - 1];
const a = nums.slice(0, -1); // @0
let lo = 0, hi = a.length - 1; const want = k - 1;
while (lo <= hi) {
  const pivot = a[hi]; let i = lo; // @1
  for (let j = lo; j < hi; j++) if (a[j] < pivot) { [a[i], a[j]] = [a[j], a[i]]; i++; }
  [a[i], a[hi]] = [a[hi], a[i]];
  if (i === want) { console.log(a[i]); break; } // @2
  if (i < want) lo = i + 1; else hi = i - 1; // @3
}`),
  'kadane': jsNums(`let best = nums[0], cur = nums[0]; // @1
for (let i = 1; i < nums.length; i++) { cur = Math.max(nums[i], cur + nums[i]); best = Math.max(best, cur); } // @3
console.log(best);`),
  'coin-change': jsNums(`const amount = nums[nums.length - 1], coins = nums.slice(0, -1); // @0
const dp = Array(amount + 1).fill(null); dp[0] = 0; // @1
for (const c of coins) for (let x = c; x <= amount; x++) if (dp[x - c] !== null && (dp[x] === null || dp[x - c] + 1 < dp[x])) dp[x] = dp[x - c] + 1; // @4
console.log(dp[amount] === null ? -1 : dp[amount]);`),
  'lis': jsNums(`const length = nums.map(() => 1); // @1
for (let i = 1; i < nums.length; i++) for (let j = 0; j < i; j++) if (nums[j] < nums[i]) length[i] = Math.max(length[i], length[j] + 1); // @4
console.log(Math.max(...length));`),
  'activity-selection': jsNums(`const acts = [];
for (let i = 0; i < nums.length; i += 2) acts.push([nums[i], nums[i + 1]]);
acts.sort((p, q) => p[1] - q[1] || p[0] - q[0]); // @1
let last = -1, count = 0;
for (const [s, f] of acts) if (s >= last) { count++; last = f; } // @3
console.log(count);`),
  'factorial': jsNums(`const n = nums[0]; let f = 1n; // @1
for (let i = 1n; i <= BigInt(n); i++) f *= i; // @3
console.log(f.toString()); // @4`),
  'fast-power': jsNums(`let base = BigInt(nums[0]), exp = nums[1], result = 1n; // @1
while (exp > 0) { // @2
  if (exp % 2) result *= base; // @3
  exp = Math.floor(exp / 2);
  if (exp) base *= base; // @4
}
console.log(result.toString());`),
  'naive-search': `const fs = require('fs');
const textIn = fs.readFileSync(0, 'utf8');
const keys = {};
for (const raw of textIn.split(/\\r?\\n/)) {
  const line = raw.split('#')[0].trim();
  if (!line) continue;
  const match = /^([A-Za-z_]+)\\s*:\\s*(.*)$/.exec(line);
  if (match) keys[match[1].toLowerCase()] = match[2];
}
const text = keys.text, pattern = keys.pattern; // @0
const found = [];
for (let s = 0; s + pattern.length <= text.length; s++) { // @1
  let matched = 0; // @2
  while (matched < pattern.length && text[s + matched] === pattern[matched]) matched++;
  if (matched === pattern.length) found.push(s); // @3
}
console.log(found.length ? found.join(' ') : 'none');
`,
};

const showCpp = `    for (size_t i = 0; i < a.size(); i++) cout << a[i] << (i + 1 == a.size() ? "\\n" : " ");`;

const cpp = {
  'cocktail-sort': cppNums(`    vector<int> a = nums;
    int start = 0, end = (int)a.size() - 1; bool swapped = true;
    while (swapped) {
        swapped = false;
        for (int i = start; i < end; i++) if (a[i] > a[i + 1]) { swap(a[i], a[i + 1]); swapped = true; }
        end--;
        if (!swapped) break;
        swapped = false;
        for (int i = end - 1; i >= start; i--) if (a[i] > a[i + 1]) { swap(a[i], a[i + 1]); swapped = true; }
        start++;
    }
${showCpp}`),
  'comb-sort': cppNums(`    vector<int> a = nums;
    int gap = (int)a.size(); bool swapped = true;
    while (gap > 1 || swapped) {
        gap = max(1, (int)(gap / 1.3)); swapped = false;
        for (int i = 0; i + gap < (int)a.size(); i++) if (a[i] > a[i + gap]) { swap(a[i], a[i + gap]); swapped = true; }
    }
${showCpp}`),
  'gnome-sort': cppNums(`    vector<int> a = nums; int i = 0;
    while (i < (int)a.size()) { if (i == 0 || a[i] >= a[i - 1]) i++; else { swap(a[i], a[i - 1]); i--; } }
${showCpp}`),
  'odd-even-sort': cppNums(`    vector<int> a = nums; bool swapped = true; int phase = 0;
    while (swapped) {
        swapped = false;
        for (int i = phase % 2; i + 1 < (int)a.size(); i += 2) if (a[i] > a[i + 1]) { swap(a[i], a[i + 1]); swapped = true; }
        phase++;
    }
${showCpp}`),
  'counting-sort': cppNums(`    vector<int> a = nums; int m = *max_element(a.begin(), a.end());
    vector<int> count(m + 1);
    for (int v : a) count[v]++;
    int i = 0; for (int v = 0; v <= m; v++) while (count[v]--) a[i++] = v;
${showCpp}`),
  'pancake-sort': cppNums(`    vector<int> a = nums;
    auto flip = [&](int k) { for (int i = 0, j = k - 1; i < j; i++, j--) swap(a[i], a[j]); };
    for (int size = (int)a.size(); size > 1; size--) {
        int m = 0; for (int i = 1; i < size; i++) if (a[i] > a[m]) m = i;
        if (m != size - 1) { if (m) flip(m + 1); flip(size); }
    }
${showCpp}`),
  'dutch-flag': cppNums(`    vector<int> a = nums; int lo = 0, mid = 0, hi = (int)a.size() - 1;
    while (mid <= hi) {
        if (a[mid] == 0) { swap(a[lo], a[mid]); lo++; mid++; }
        else if (a[mid] == 2) { swap(a[mid], a[hi]); hi--; }
        else mid++;
    }
${showCpp}`),
  'jump-search': cppNums(`    int target = nums.back(); vector<int> a(nums.begin(), nums.end() - 1); sort(a.begin(), a.end());
    int step = max(1, (int)sqrt((double)a.size())), prev = 0, end = step, found = -1;
    while (prev < (int)a.size() && a[min(end, (int)a.size()) - 1] < target) { prev = end; end += step; }
    for (int i = prev; i < min(end, (int)a.size()); i++) { if (a[i] == target) { found = i; break; } if (a[i] > target) break; }
    cout << found << "\\n";`),
  'interpolation-search': cppNums(`    int target = nums.back(); vector<int> a(nums.begin(), nums.end() - 1); sort(a.begin(), a.end());
    int lo = 0, hi = (int)a.size() - 1, found = -1;
    while (lo <= hi && target >= a[lo] && target <= a[hi]) {
        if (a[hi] == a[lo]) { found = a[lo] == target ? lo : -1; break; }
        int pos = lo + (int)(((long long)(target - a[lo]) * (hi - lo)) / (a[hi] - a[lo]));
        if (a[pos] == target) { found = pos; break; }
        if (a[pos] < target) lo = pos + 1; else hi = pos - 1;
    }
    cout << found << "\\n";`),
  'exponential-search': cppNums(`    int target = nums.back(); vector<int> a(nums.begin(), nums.end() - 1); sort(a.begin(), a.end());
    int found = a[0] == target ? 0 : -1;
    if (found < 0) {
        int bound = 1; while (bound < (int)a.size() && a[bound] < target) bound *= 2;
        int lo = bound / 2, hi = min(bound, (int)a.size() - 1);
        while (lo <= hi) { int mid = (lo + hi) / 2; if (a[mid] == target) { found = mid; break; } if (a[mid] < target) lo = mid + 1; else hi = mid - 1; }
    }
    cout << found << "\\n";`),
  'quickselect': cppNums(`    int k = nums.back(); vector<int> a(nums.begin(), nums.end() - 1);
    int lo = 0, hi = (int)a.size() - 1, want = k - 1;
    while (lo <= hi) {
        int pivot = a[hi], i = lo;
        for (int j = lo; j < hi; j++) if (a[j] < pivot) swap(a[i++], a[j]);
        swap(a[i], a[hi]);
        if (i == want) { cout << a[i] << "\\n"; break; }
        if (i < want) lo = i + 1; else hi = i - 1;
    }`),
  'kadane': cppNums(`    long long best = nums[0], cur = nums[0];
    for (size_t i = 1; i < nums.size(); i++) { cur = max((long long)nums[i], cur + nums[i]); best = max(best, cur); }
    cout << best << "\\n";`),
  'coin-change': cppNums(`    int amount = nums.back();
    vector<int> dp(amount + 1, -1); dp[0] = 0;
    for (size_t c = 0; c + 1 < nums.size(); c++) for (int x = nums[c]; x <= amount; x++) if (dp[x - nums[c]] >= 0 && (dp[x] < 0 || dp[x - nums[c]] + 1 < dp[x])) dp[x] = dp[x - nums[c]] + 1;
    cout << dp[amount] << "\\n";`),
  'lis': cppNums(`    vector<int> length(nums.size(), 1);
    for (size_t i = 1; i < nums.size(); i++) for (size_t j = 0; j < i; j++) if (nums[j] < nums[i]) length[i] = max(length[i], length[j] + 1);
    cout << *max_element(length.begin(), length.end()) << "\\n";`),
  'activity-selection': cppNums(`    vector<pair<int,int>> acts;
    for (size_t i = 0; i + 1 < nums.size(); i += 2) acts.push_back({nums[i], nums[i + 1]});
    sort(acts.begin(), acts.end(), [](auto p, auto q) { return p.second < q.second || (p.second == q.second && p.first < q.first); });
    int last = -1, count = 0;
    for (auto [s, f] : acts) if (s >= last) { count++; last = f; }
    cout << count << "\\n";`),
  'factorial': cppNums(`    unsigned long long f = 1; for (int i = 1; i <= nums[0]; i++) f *= (unsigned long long)i;
    cout << f << "\\n";`),
  'fast-power': cppNums(`    unsigned long long base = (unsigned)nums[0], result = 1; int exp = nums[1];
    while (exp > 0) { if (exp % 2) result *= base; exp /= 2; if (exp) base *= base; }
    cout << result << "\\n";`),
  'naive-search': `${cppHead}#include <cctype>
#include <map>
int main() {
    map<string, string> keys; string raw;
    while (getline(cin, raw)) {
        auto hash = raw.find('#'); if (hash != string::npos) raw = raw.substr(0, hash);
        size_t c = raw.find(':'); if (c == string::npos) continue;
        string head = raw.substr(0, c), value = raw.substr(c + 1);
        head.erase(0, head.find_first_not_of(" \\t")); if (!head.empty()) head.erase(head.find_last_not_of(" \\t") + 1);
        value.erase(0, value.find_first_not_of(" \\t\\r")); if (!value.empty()) value.erase(value.find_last_not_of(" \\t\\r") + 1);
        for (char& ch : head) ch = (char)tolower((unsigned char)ch);
        keys[head] = value;
    }
    string text = keys["text"], pattern = keys["pattern"];
    bool any = false;
    for (size_t s = 0; s + pattern.size() <= text.size(); s++) {
        size_t k = 0; while (k < pattern.size() && text[s + k] == pattern[k]) k++;
        if (k == pattern.size()) { if (any) cout << ' '; cout << s; any = true; }
    }
    if (!any) cout << "none";
    cout << "\\n";
}
`,
};

const java = {
  'cocktail-sort': javaNums(`        int[] a = nums.clone();
        int start = 0, end = a.length - 1; boolean swapped = true;
        while (swapped) {
            swapped = false;
            for (int i = start; i < end; i++) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = true; }
            end--; if (!swapped) break; swapped = false;
            for (int i = end - 1; i >= start; i--) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = true; }
            start++;
        }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'comb-sort': javaNums(`        int[] a = nums.clone(); int gap = a.length; boolean swapped = true;
        while (gap > 1 || swapped) {
            gap = Math.max(1, (int)(gap / 1.3)); swapped = false;
            for (int i = 0; i + gap < a.length; i++) if (a[i] > a[i + gap]) { int t = a[i]; a[i] = a[i + gap]; a[i + gap] = t; swapped = true; }
        }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'gnome-sort': javaNums(`        int[] a = nums.clone(); int i = 0;
        while (i < a.length) { if (i == 0 || a[i] >= a[i - 1]) i++; else { int t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; i--; } }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'odd-even-sort': javaNums(`        int[] a = nums.clone(); boolean swapped = true; int phase = 0;
        while (swapped) {
            swapped = false;
            for (int i = phase % 2; i + 1 < a.length; i += 2) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = true; }
            phase++;
        }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'counting-sort': javaNums(`        int[] a = nums.clone(); int m = Arrays.stream(a).max().getAsInt(); int[] count = new int[m + 1];
        for (int v : a) count[v]++; int i = 0; for (int v = 0; v <= m; v++) while (count[v]-- > 0) a[i++] = v;
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'pancake-sort': javaNums(`        int[] a = nums.clone();
        for (int size = a.length; size > 1; size--) {
            int m = 0; for (int i = 1; i < size; i++) if (a[i] > a[m]) m = i;
            if (m != size - 1) { if (m != 0) for (int x = 0, y = m; x < y; x++, y--) { int t = a[x]; a[x] = a[y]; a[y] = t; }
                for (int x = 0, y = size - 1; x < y; x++, y--) { int t = a[x]; a[x] = a[y]; a[y] = t; } }
        }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'dutch-flag': javaNums(`        int[] a = nums.clone(); int lo = 0, mid = 0, hi = a.length - 1;
        while (mid <= hi) {
            if (a[mid] == 0) { int t = a[lo]; a[lo] = a[mid]; a[mid] = t; lo++; mid++; }
            else if (a[mid] == 2) { int t = a[mid]; a[mid] = a[hi]; a[hi] = t; hi--; }
            else mid++;
        }
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));`),
  'jump-search': javaNums(`        int target = nums[nums.length - 1]; int[] a = Arrays.copyOf(nums, nums.length - 1); Arrays.sort(a);
        int step = Math.max(1, (int)Math.sqrt(a.length)), prev = 0, end = step, found = -1;
        while (prev < a.length && a[Math.min(end, a.length) - 1] < target) { prev = end; end += step; }
        for (int i = prev; i < Math.min(end, a.length); i++) { if (a[i] == target) { found = i; break; } if (a[i] > target) break; }
        System.out.println(found);`),
  'interpolation-search': javaNums(`        int target = nums[nums.length - 1]; int[] a = Arrays.copyOf(nums, nums.length - 1); Arrays.sort(a);
        int lo = 0, hi = a.length - 1, found = -1;
        while (lo <= hi && target >= a[lo] && target <= a[hi]) {
            if (a[hi] == a[lo]) { found = a[lo] == target ? lo : -1; break; }
            int pos = lo + (int)(((long)(target - a[lo]) * (hi - lo)) / (a[hi] - a[lo]));
            if (a[pos] == target) { found = pos; break; }
            if (a[pos] < target) lo = pos + 1; else hi = pos - 1;
        }
        System.out.println(found);`),
  'exponential-search': javaNums(`        int target = nums[nums.length - 1]; int[] a = Arrays.copyOf(nums, nums.length - 1); Arrays.sort(a);
        int found = a[0] == target ? 0 : -1;
        if (found < 0) {
            int bound = 1; while (bound < a.length && a[bound] < target) bound *= 2;
            int lo = bound / 2, hi = Math.min(bound, a.length - 1);
            while (lo <= hi) { int mid = (lo + hi) / 2; if (a[mid] == target) { found = mid; break; } if (a[mid] < target) lo = mid + 1; else hi = mid - 1; }
        }
        System.out.println(found);`),
  'quickselect': javaNums(`        int k = nums[nums.length - 1]; int[] a = Arrays.copyOf(nums, nums.length - 1);
        int lo = 0, hi = a.length - 1, want = k - 1;
        while (lo <= hi) {
            int pivot = a[hi], i = lo;
            for (int j = lo; j < hi; j++) if (a[j] < pivot) { int t = a[i]; a[i] = a[j]; a[j] = t; i++; }
            int t = a[i]; a[i] = a[hi]; a[hi] = t;
            if (i == want) { System.out.println(a[i]); break; }
            if (i < want) lo = i + 1; else hi = i - 1;
        }`),
  'kadane': javaNums(`        long best = nums[0], cur = nums[0];
        for (int i = 1; i < nums.length; i++) { cur = Math.max(nums[i], cur + nums[i]); best = Math.max(best, cur); }
        System.out.println(best);`),
  'coin-change': javaNums(`        int amount = nums[nums.length - 1]; int[] dp = new int[amount + 1]; Arrays.fill(dp, -1); dp[0] = 0;
        for (int c = 0; c + 1 < nums.length; c++) for (int x = nums[c]; x <= amount; x++) if (dp[x - nums[c]] >= 0 && (dp[x] < 0 || dp[x - nums[c]] + 1 < dp[x])) dp[x] = dp[x - nums[c]] + 1;
        System.out.println(dp[amount]);`),
  'lis': javaNums(`        int[] length = new int[nums.length]; Arrays.fill(length, 1);
        for (int i = 1; i < nums.length; i++) for (int j = 0; j < i; j++) if (nums[j] < nums[i]) length[i] = Math.max(length[i], length[j] + 1);
        int best = 1; for (int v : length) best = Math.max(best, v); System.out.println(best);`),
  'activity-selection': javaNums(`        int[][] acts = new int[nums.length / 2][2];
        for (int i = 0; i < acts.length; i++) { acts[i][0] = nums[i * 2]; acts[i][1] = nums[i * 2 + 1]; }
        Arrays.sort(acts, (p, q) -> p[1] == q[1] ? Integer.compare(p[0], q[0]) : Integer.compare(p[1], q[1]));
        int last = -1, count = 0; for (int[] act : acts) if (act[0] >= last) { count++; last = act[1]; }
        System.out.println(count);`),
  'factorial': javaNums(`        long f = 1; for (int i = 1; i <= nums[0]; i++) f *= i; System.out.println(f);`),
  'fast-power': javaNums(`        long base = nums[0], result = 1; int exp = nums[1];
        while (exp > 0) { if (exp % 2 == 1) result *= base; exp /= 2; if (exp > 0) base *= base; }
        System.out.println(result);`),
  'naive-search': `import java.util.*;
public class Main {
    public static void main(String[] args) throws Exception {
        String textIn = new String(System.in.readAllBytes());
        Map<String, String> keys = new LinkedHashMap<>();
        for (String raw : textIn.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':'); if (c < 0) continue;
            String head = line.substring(0, c).trim();
            if (!head.isEmpty() && head.chars().allMatch(ch -> Character.isLetter(ch) || ch == '_')) keys.put(head.toLowerCase(), line.substring(c + 1).trim());
        }
        String text = keys.get("text"), pattern = keys.get("pattern");
        StringBuilder out = new StringBuilder();
        for (int s = 0; s + pattern.length() <= text.length(); s++) {
            int k = 0; while (k < pattern.length() && text.charAt(s + k) == pattern.charAt(k)) k++;
            if (k == pattern.length()) { if (out.length() > 0) out.append(' '); out.append(s); }
        }
        System.out.println(out.length() == 0 ? "none" : out);
    }
}
`,
};

const goShow = `    for i, v := range a { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println()`;

const go = {
  'cocktail-sort': goNums(`    a := append([]int(nil), nums...)
    start, end, swapped := 0, len(a)-1, true
    for swapped {
        swapped = false
        for i := start; i < end; i++ { if a[i] > a[i+1] { a[i], a[i+1] = a[i+1], a[i]; swapped = true } }
        end--
        if !swapped { break }
        swapped = false
        for i := end - 1; i >= start; i-- { if a[i] > a[i+1] { a[i], a[i+1] = a[i+1], a[i]; swapped = true } }
        start++
    }
${goShow}`),
  'comb-sort': goNums(`    a := append([]int(nil), nums...)
    gap, swapped := len(a), true
    for gap > 1 || swapped {
        gap = int(float64(gap) / 1.3); if gap < 1 { gap = 1 }
        swapped = false
        for i := 0; i+gap < len(a); i++ { if a[i] > a[i+gap] { a[i], a[i+gap] = a[i+gap], a[i]; swapped = true } }
    }
${goShow}`),
  'gnome-sort': goNums(`    a := append([]int(nil), nums...)
    for i := 0; i < len(a); {
        if i == 0 || a[i] >= a[i-1] { i++ } else { a[i], a[i-1] = a[i-1], a[i]; i-- }
    }
${goShow}`),
  'odd-even-sort': goNums(`    a := append([]int(nil), nums...)
    swapped, phase := true, 0
    for swapped {
        swapped = false
        for i := phase % 2; i+1 < len(a); i += 2 { if a[i] > a[i+1] { a[i], a[i+1] = a[i+1], a[i]; swapped = true } }
        phase++
    }
${goShow}`),
  'counting-sort': goNums(`    a := append([]int(nil), nums...)
    m := a[0]; for _, v := range a { if v > m { m = v } }
    count := make([]int, m+1)
    for _, v := range a { count[v]++ }
    i := 0
    for v := 0; v <= m; v++ { for count[v] > 0 { a[i] = v; i++; count[v]-- } }
${goShow}`),
  'pancake-sort': goNums(`    a := append([]int(nil), nums...)
    flip := func(k int) { for i, j := 0, k-1; i < j; i, j = i+1, j-1 { a[i], a[j] = a[j], a[i] } }
    for size := len(a); size > 1; size-- {
        m := 0; for i := 1; i < size; i++ { if a[i] > a[m] { m = i } }
        if m != size-1 { if m != 0 { flip(m + 1) }; flip(size) }
    }
${goShow}`),
  'dutch-flag': goNums(`    a := append([]int(nil), nums...)
    lo, mid, hi := 0, 0, len(a)-1
    for mid <= hi {
        if a[mid] == 0 { a[lo], a[mid] = a[mid], a[lo]; lo++; mid++ } else if a[mid] == 2 { a[mid], a[hi] = a[hi], a[mid]; hi-- } else { mid++ }
    }
${goShow}`),
  'jump-search': goNums(`    target := nums[len(nums)-1]
    a := append([]int(nil), nums[:len(nums)-1]...)
    sortInts(a)
    step := int(mathSqrt(len(a))); if step < 1 { step = 1 }
    prev, end, found := 0, step, -1
    for prev < len(a) && a[min(end, len(a))-1] < target { prev, end = end, end+step }
    for i := prev; i < min(end, len(a)); i++ { if a[i] == target { found = i; break }; if a[i] > target { break } }
    fmt.Println(found)`),
  'interpolation-search': goNums(`    target := nums[len(nums)-1]
    a := append([]int(nil), nums[:len(nums)-1]...)
    sortInts(a)
    lo, hi, found := 0, len(a)-1, -1
    for lo <= hi && target >= a[lo] && target <= a[hi] {
        if a[hi] == a[lo] { if a[lo] == target { found = lo } else { found = -1 }; break }
        pos := lo + (target-a[lo])*(hi-lo)/(a[hi]-a[lo])
        if a[pos] == target { found = pos; break }
        if a[pos] < target { lo = pos + 1 } else { hi = pos - 1 }
    }
    fmt.Println(found)`),
  'exponential-search': goNums(`    target := nums[len(nums)-1]
    a := append([]int(nil), nums[:len(nums)-1]...)
    sortInts(a)
    found := -1; if a[0] == target { found = 0 }
    if found < 0 {
        bound := 1
        for bound < len(a) && a[bound] < target { bound *= 2 }
        lo, hi := bound/2, bound; if hi > len(a)-1 { hi = len(a) - 1 }
        for lo <= hi { mid := (lo + hi) / 2; if a[mid] == target { found = mid; break }; if a[mid] < target { lo = mid + 1 } else { hi = mid - 1 } }
    }
    fmt.Println(found)`),
  'quickselect': goNums(`    k := nums[len(nums)-1]
    a := append([]int(nil), nums[:len(nums)-1]...)
    lo, hi, want := 0, len(a)-1, k-1
    for lo <= hi {
        pivot, i := a[hi], lo
        for j := lo; j < hi; j++ { if a[j] < pivot { a[i], a[j] = a[j], a[i]; i++ } }
        a[i], a[hi] = a[hi], a[i]
        if i == want { fmt.Println(a[i]); break }
        if i < want { lo = i + 1 } else { hi = i - 1 }
    }`),
  'kadane': goNums(`    best, cur := nums[0], nums[0]
    for _, x := range nums[1:] { if cur+x < x { cur = x } else { cur += x }; if cur > best { best = cur } }
    fmt.Println(best)`),
  'coin-change': goNums(`    amount := nums[len(nums)-1]
    dp := make([]int, amount+1)
    for i := range dp { dp[i] = -1 }
    dp[0] = 0
    for _, c := range nums[:len(nums)-1] {
        for x := c; x <= amount; x++ { if dp[x-c] >= 0 && (dp[x] < 0 || dp[x-c]+1 < dp[x]) { dp[x] = dp[x-c] + 1 } }
    }
    fmt.Println(dp[amount])`),
  'lis': goNums(`    length := make([]int, len(nums))
    for i := range length { length[i] = 1 }
    best := 1
    for i := 1; i < len(nums); i++ {
        for j := 0; j < i; j++ { if nums[j] < nums[i] && length[j]+1 > length[i] { length[i] = length[j] + 1 } }
        if length[i] > best { best = length[i] }
    }
    fmt.Println(best)`),
  'activity-selection': goNums(`    type act struct{ s, f int }
    acts := []act{}
    for i := 0; i+1 < len(nums); i += 2 { acts = append(acts, act{nums[i], nums[i+1]}) }
    for i := 1; i < len(acts); i++ { for j := i; j > 0 && (acts[j].f < acts[j-1].f || (acts[j].f == acts[j-1].f && acts[j].s < acts[j-1].s)); j-- { acts[j], acts[j-1] = acts[j-1], acts[j] } }
    last, count := -1, 0
    for _, item := range acts { if item.s >= last { count++; last = item.f } }
    fmt.Println(count)`),
  'factorial': goNums(`    f := 1
    for i := 1; i <= nums[0]; i++ { f *= i }
    fmt.Println(f)`),
  'fast-power': goNums(`    base, result, exp := nums[0], 1, nums[1]
    for exp > 0 { if exp%2 == 1 { result *= base }; exp /= 2; if exp > 0 { base *= base } }
    fmt.Println(result)`),
  'naive-search': `package main
import ("bufio"; "fmt"; "os"; "strings")
func main() {
    in := bufio.NewScanner(os.Stdin); in.Buffer(make([]byte, 0, 1<<20), 1<<20)
    keys := map[string]string{}
    for in.Scan() {
        line := strings.TrimSpace(strings.SplitN(in.Text(), "#", 2)[0])
        head, tail, ok := strings.Cut(line, ":")
        if ok && strings.Trim(strings.TrimSpace(head), "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_") == "" && strings.TrimSpace(head) != "" {
            keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
        }
    }
    text, pattern := keys["text"], keys["pattern"]
    out := []string{}
    for s := 0; s+len(pattern) <= len(text); s++ {
        k := 0
        for k < len(pattern) && text[s+k] == pattern[k] { k++ }
        if k == len(pattern) { out = append(out, fmt.Sprint(s)) }
    }
    if len(out) == 0 { fmt.Println("none") } else { fmt.Println(strings.Join(out, " ")) }
}
`,
};

const rust = {
  'cocktail-sort': rustNums(`    let mut a = nums.clone();
    let (mut start, mut end, mut swapped) = (0isize, a.len() as isize - 1, true);
    while swapped {
        swapped = false;
        let mut i = start;
        while i < end { let u = i as usize; if a[u] > a[u + 1] { a.swap(u, u + 1); swapped = true; } i += 1; }
        end -= 1;
        if !swapped { break; }
        swapped = false;
        let mut i = end - 1;
        while i >= start { let u = i as usize; if a[u] > a[u + 1] { a.swap(u, u + 1); swapped = true; } i -= 1; }
        start += 1;
    }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'comb-sort': rustNums(`    let mut a = nums.clone();
    let (mut gap, mut swapped) = (a.len(), true);
    while gap > 1 || swapped {
        gap = ((gap as f64) / 1.3) as usize; if gap < 1 { gap = 1; }
        swapped = false;
        let mut i = 0;
        while i + gap < a.len() { if a[i] > a[i + gap] { a.swap(i, i + gap); swapped = true; } i += 1; }
    }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'gnome-sort': rustNums(`    let mut a = nums.clone(); let mut i = 0usize;
    while i < a.len() { if i == 0 || a[i] >= a[i - 1] { i += 1; } else { a.swap(i, i - 1); i -= 1; } }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'odd-even-sort': rustNums(`    let mut a = nums.clone(); let (mut swapped, mut phase) = (true, 0usize);
    while swapped {
        swapped = false; let mut i = phase % 2;
        while i + 1 < a.len() { if a[i] > a[i + 1] { a.swap(i, i + 1); swapped = true; } i += 2; }
        phase += 1;
    }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'counting-sort': rustNums(`    let mut a = nums.clone();
    let m = *a.iter().max().unwrap() as usize;
    let mut count = vec![0usize; m + 1];
    for v in &a { count[*v as usize] += 1; }
    let mut i = 0;
    for v in 0..=m { for _ in 0..count[v] { a[i] = v as i64; i += 1; } }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'pancake-sort': rustNums(`    let mut a = nums.clone();
    let n = a.len();
    for size in (2..=n).rev() {
        let mut m = 0; for i in 1..size { if a[i] > a[m] { m = i; } }
        if m != size - 1 {
            if m != 0 { a[0..=m].reverse(); }
            a[0..size].reverse();
        }
    }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'dutch-flag': rustNums(`    let mut a = nums.clone();
    let (mut lo, mut mid, mut hi) = (0isize, 0isize, a.len() as isize - 1);
    while mid <= hi {
        if a[mid as usize] == 0 { a.swap(lo as usize, mid as usize); lo += 1; mid += 1; }
        else if a[mid as usize] == 2 { a.swap(mid as usize, hi as usize); hi -= 1; }
        else { mid += 1; }
    }
    println!("{}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "));`),
  'jump-search': rustNums(`    let target = *nums.last().unwrap();
    let mut a = nums[..nums.len() - 1].to_vec(); a.sort();
    let step = (a.len() as f64).sqrt().floor() as usize;
    let step = step.max(1);
    let (mut prev, mut end, mut found) = (0usize, step, -1i64);
    while prev < a.len() && a[end.min(a.len()) - 1] < target { prev = end; end += step; }
    for i in prev..end.min(a.len()) { if a[i] == target { found = i as i64; break; } if a[i] > target { break; } }
    println!("{found}");`),
  'interpolation-search': rustNums(`    let target = *nums.last().unwrap();
    let mut a = nums[..nums.len() - 1].to_vec(); a.sort();
    let (mut lo, mut hi, mut found) = (0i64, a.len() as i64 - 1, -1i64);
    while lo <= hi && target >= a[lo as usize] && target <= a[hi as usize] {
        if a[hi as usize] == a[lo as usize] { found = if a[lo as usize] == target { lo } else { -1 }; break; }
        let pos = lo + (target - a[lo as usize]) * (hi - lo) / (a[hi as usize] - a[lo as usize]);
        if a[pos as usize] == target { found = pos; break; }
        if a[pos as usize] < target { lo = pos + 1; } else { hi = pos - 1; }
    }
    println!("{found}");`),
  'exponential-search': rustNums(`    let target = *nums.last().unwrap();
    let mut a = nums[..nums.len() - 1].to_vec(); a.sort();
    let mut found = if a[0] == target { 0 } else { -1 };
    if found < 0 {
        let mut bound = 1usize;
        while bound < a.len() && a[bound] < target { bound *= 2; }
        let (mut lo, mut hi) = (bound / 2, bound.min(a.len() - 1));
        while lo <= hi { let mid = (lo + hi) / 2; if a[mid] == target { found = mid as i64; break; } if a[mid] < target { lo = mid + 1; } else { hi = mid - 1; } }
    }
    println!("{found}");`),
  'quickselect': rustNums(`    let k = *nums.last().unwrap() as usize;
    let mut a = nums[..nums.len() - 1].to_vec();
    let (mut lo, mut hi, want) = (0isize, a.len() as isize - 1, k as isize - 1);
    while lo <= hi {
        let pivot = a[hi as usize]; let mut i = lo;
        let mut j = lo; while j < hi { if a[j as usize] < pivot { a.swap(i as usize, j as usize); i += 1; } j += 1; }
        a.swap(i as usize, hi as usize);
        if i == want { println!("{}", a[i as usize]); break; }
        if i < want { lo = i + 1; } else { hi = i - 1; }
    }`),
  'kadane': rustNums(`    let (mut best, mut cur) = (nums[0], nums[0]);
    for &x in &nums[1..] { cur = x.max(cur + x); best = best.max(cur); }
    println!("{best}");`),
  'coin-change': rustNums(`    let amount = *nums.last().unwrap() as usize;
    let mut dp = vec![-1i64; amount + 1]; dp[0] = 0;
    for &c in &nums[..nums.len() - 1] { let c = c as usize; let mut x = c; while x <= amount { if dp[x - c] >= 0 && (dp[x] < 0 || dp[x - c] + 1 < dp[x]) { dp[x] = dp[x - c] + 1; } x += 1; } }
    println!("{}", dp[amount]);`),
  'lis': rustNums(`    let mut length = vec![1i64; nums.len()];
    for i in 1..nums.len() { for j in 0..i { if nums[j] < nums[i] { length[i] = length[i].max(length[j] + 1); } } }
    println!("{}", length.iter().copied().max().unwrap());`),
  'activity-selection': rustNums(`    let mut acts: Vec<(i64, i64)> = nums.chunks(2).map(|p| (p[0], p[1])).collect();
    acts.sort_by(|p, q| p.1.cmp(&q.1).then(p.0.cmp(&q.0)));
    let (mut last, mut count) = (-1i64, 0i64);
    for (s, f) in acts { if s >= last { count += 1; last = f; } }
    println!("{count}");`),
  'factorial': rustNums(`    let mut f: i64 = 1; for i in 1..=nums[0] { f *= i; } println!("{f}");`),
  'fast-power': rustNums(`    let (mut base, mut exp, mut result) = (nums[0], nums[1], 1i64);
    while exp > 0 { if exp % 2 == 1 { result *= base; } exp /= 2; if exp > 0 { base *= base; } }
    println!("{result}");`),
  'naive-search': `use std::io::Read;
fn main() {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).ok();
    let mut keys = std::collections::HashMap::new();
    for line in raw.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            let head = head.trim();
            if !head.is_empty() && head.chars().all(|c| c.is_ascii_alphabetic() || c == '_') { keys.insert(head.to_lowercase(), tail.trim().to_string()); }
        }
    }
    let text = keys.get("text").cloned().unwrap_or_default();
    let pattern = keys.get("pattern").cloned().unwrap_or_default();
    let bytes = text.as_bytes(); let pat = pattern.as_bytes();
    let mut found = Vec::new();
    if !pat.is_empty() { for s in 0..=bytes.len().saturating_sub(pat.len()) { if &bytes[s..s + pat.len()] == pat { found.push(s.to_string()); } } }
    println!("{}", if found.is_empty() { "none".to_string() } else { found.join(" ") });
}
`,
};

const c = {
  'cocktail-sort': cNums(String.raw`    int *a = nums; int start = 0, end = n - 1, swapped = 1;
    while (swapped) {
        swapped = 0;
        for (int i = start; i < end; i++) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = 1; }
        end--; if (!swapped) break; swapped = 0;
        for (int i = end - 1; i >= start; i--) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = 1; }
        start++;
    }
    show(a, n);`),
  'comb-sort': cNums(String.raw`    int *a = nums, gap = n, swapped = 1;
    while (gap > 1 || swapped) {
        gap = (int)(gap / 1.3); if (gap < 1) gap = 1; swapped = 0;
        for (int i = 0; i + gap < n; i++) if (a[i] > a[i + gap]) { int t = a[i]; a[i] = a[i + gap]; a[i + gap] = t; swapped = 1; }
    }
    show(a, n);`),
  'gnome-sort': cNums(String.raw`    int *a = nums;
    for (int i = 0; i < n; ) { if (i == 0 || a[i] >= a[i - 1]) i++; else { int t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; i--; } }
    show(a, n);`),
  'odd-even-sort': cNums(String.raw`    int *a = nums, swapped = 1, phase = 0;
    while (swapped) {
        swapped = 0;
        for (int i = phase % 2; i + 1 < n; i += 2) if (a[i] > a[i + 1]) { int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; swapped = 1; }
        phase++;
    }
    show(a, n);`),
  'counting-sort': cNums(String.raw`    int *a = nums, m = a[0];
    for (int i = 1; i < n; i++) if (a[i] > m) m = a[i];
    int *count = calloc((size_t)m + 1, sizeof(int));
    for (int i = 0; i < n; i++) count[a[i]]++;
    for (int v = 0, i = 0; v <= m; v++) while (count[v]--) a[i++] = v;
    free(count); show(a, n);`),
  'pancake-sort': cNums(String.raw`    int *a = nums;
    for (int size = n; size > 1; size--) {
        int m = 0; for (int i = 1; i < size; i++) if (a[i] > a[m]) m = i;
        if (m != size - 1) {
            if (m) for (int i = 0, j = m; i < j; i++, j--) { int t = a[i]; a[i] = a[j]; a[j] = t; }
            for (int i = 0, j = size - 1; i < j; i++, j--) { int t = a[i]; a[i] = a[j]; a[j] = t; }
        }
    }
    show(a, n);`),
  'dutch-flag': cNums(String.raw`    int *a = nums, lo = 0, mid = 0, hi = n - 1;
    while (mid <= hi) {
        if (a[mid] == 0) { int t = a[lo]; a[lo] = a[mid]; a[mid] = t; lo++; mid++; }
        else if (a[mid] == 2) { int t = a[mid]; a[mid] = a[hi]; a[hi] = t; hi--; }
        else mid++;
    }
    show(a, n);`),
  'jump-search': cNums(String.raw`    int target = nums[n - 1]; qsort(nums, (size_t)n - 1, sizeof(int), cmp_int);
    int step = 1; while ((step + 1) * (step + 1) <= n - 1) step++;
    int prev = 0, end = step, found = -1, len = n - 1;
    while (prev < len && nums[(end < len ? end : len) - 1] < target) { prev = end; end += step; }
    for (int i = prev; i < (end < len ? end : len); i++) { if (nums[i] == target) { found = i; break; } if (nums[i] > target) break; }
    printf("%d\n", found);`),
  'interpolation-search': cNums(String.raw`    int target = nums[n - 1]; qsort(nums, (size_t)n - 1, sizeof(int), cmp_int);
    int lo = 0, hi = n - 2, found = -1;
    while (lo <= hi && target >= nums[lo] && target <= nums[hi]) {
        if (nums[hi] == nums[lo]) { found = nums[lo] == target ? lo : -1; break; }
        int pos = lo + (int)(((long long)(target - nums[lo]) * (hi - lo)) / (nums[hi] - nums[lo]));
        if (nums[pos] == target) { found = pos; break; }
        if (nums[pos] < target) lo = pos + 1; else hi = pos - 1;
    }
    printf("%d\n", found);`),
  'exponential-search': cNums(String.raw`    int target = nums[n - 1]; qsort(nums, (size_t)n - 1, sizeof(int), cmp_int);
    int len = n - 1, found = nums[0] == target ? 0 : -1;
    if (found < 0) {
        int bound = 1; while (bound < len && nums[bound] < target) bound *= 2;
        int lo = bound / 2, hi = bound < len ? bound : len - 1;
        while (lo <= hi) { int mid = (lo + hi) / 2; if (nums[mid] == target) { found = mid; break; } if (nums[mid] < target) lo = mid + 1; else hi = mid - 1; }
    }
    printf("%d\n", found);`),
  'quickselect': cNums(String.raw`    int k = nums[n - 1], lo = 0, hi = n - 2, want = k - 1;
    while (lo <= hi) {
        int pivot = nums[hi], i = lo;
        for (int j = lo; j < hi; j++) if (nums[j] < pivot) { int t = nums[i]; nums[i] = nums[j]; nums[j] = t; i++; }
        int t = nums[i]; nums[i] = nums[hi]; nums[hi] = t;
        if (i == want) { printf("%d\n", nums[i]); break; }
        if (i < want) lo = i + 1; else hi = i - 1;
    }`),
  'kadane': cNums(String.raw`    long long best = nums[0], cur = nums[0];
    for (int i = 1; i < n; i++) { long long x = nums[i]; cur = x > cur + x ? x : cur + x; if (cur > best) best = cur; }
    printf("%lld\n", best);`),
  'coin-change': cNums(String.raw`    int amount = nums[n - 1];
    int *dp = malloc((size_t)(amount + 1) * sizeof(int));
    for (int i = 0; i <= amount; i++) dp[i] = -1; dp[0] = 0;
    for (int c = 0; c + 1 < n; c++) for (int x = nums[c]; x <= amount; x++) if (dp[x - nums[c]] >= 0 && (dp[x] < 0 || dp[x - nums[c]] + 1 < dp[x])) dp[x] = dp[x - nums[c]] + 1;
    printf("%d\n", dp[amount]); free(dp);`),
  'lis': cNums(String.raw`    int *length = malloc((size_t)n * sizeof(int)), best = 1;
    for (int i = 0; i < n; i++) length[i] = 1;
    for (int i = 1; i < n; i++) { for (int j = 0; j < i; j++) if (nums[j] < nums[i] && length[j] + 1 > length[i]) length[i] = length[j] + 1; if (length[i] > best) best = length[i]; }
    printf("%d\n", best); free(length);`),
  'activity-selection': cNums(String.raw`    int count = n / 2;
    for (int i = 1; i < count; i++) for (int j = i; j > 0 && (nums[j * 2 + 1] < nums[(j - 1) * 2 + 1] || (nums[j * 2 + 1] == nums[(j - 1) * 2 + 1] && nums[j * 2] < nums[(j - 1) * 2])); j--) {
        int s = nums[j * 2], f = nums[j * 2 + 1]; nums[j * 2] = nums[(j - 1) * 2]; nums[j * 2 + 1] = nums[(j - 1) * 2 + 1]; nums[(j - 1) * 2] = s; nums[(j - 1) * 2 + 1] = f;
    }
    int last = -1, taken = 0;
    for (int i = 0; i < count; i++) if (nums[i * 2] >= last) { taken++; last = nums[i * 2 + 1]; }
    printf("%d\n", taken);`),
  'factorial': cNums(String.raw`    unsigned long long f = 1; for (int i = 1; i <= nums[0]; i++) f *= (unsigned long long)i;
    printf("%llu\n", f);`),
  'fast-power': cNums(String.raw`    unsigned long long base = (unsigned)nums[0], result = 1; int exp = nums[1];
    while (exp > 0) { if (exp % 2) result *= base; exp /= 2; if (exp) base *= base; }
    printf("%llu\n", result);`),
  'naive-search': `${cPrelude}
static char key_name[32][32]; static char key_value[32][512]; static int nkeys;
static const char *key_of(const char *name) { for (int i = 0; i < nkeys; i++) if (strcmp(key_name[i], name) == 0) return key_value[i]; return ""; }
int main(void) {
    char *textin = read_all(), *p = textin;
    while (*p && nkeys < 32) {
        char *line = p; while (*p && *p != '\\n') p++; if (*p == '\\n') *p++ = '\\0';
        char *hash = strchr(line, '#'); if (hash) *hash = '\\0';
        while (*line == ' ' || *line == '\\t' || *line == '\\r') line++;
        char *colon = strchr(line, ':'); if (!colon) continue;
        int kn = (int)(colon - line); while (kn && (line[kn - 1] == ' ' || line[kn - 1] == '\\t')) kn--;
        int ok = kn > 0; for (int i = 0; i < kn; i++) if (!isalpha((unsigned char)line[i]) && line[i] != '_') ok = 0;
        if (!ok) continue;
        for (int i = 0; i < kn && i < 31; i++) key_name[nkeys][i] = (char)tolower((unsigned char)line[i]);
        key_name[nkeys][kn < 31 ? kn : 31] = '\\0';
        char *v = colon + 1; while (*v == ' ' || *v == '\\t') v++;
        size_t len = strlen(v); while (len && (v[len - 1] == ' ' || v[len - 1] == '\\t' || v[len - 1] == '\\r')) v[--len] = '\\0';
        strncpy(key_value[nkeys], v, 511); key_value[nkeys][511] = '\\0'; nkeys++;
    }
    const char *text = key_of("text"), *pattern = key_of("pattern");
    int nlen = (int)strlen(text), m = (int)strlen(pattern), any = 0;
    for (int s = 0; s + m <= nlen; s++) {
        int k = 0; while (k < m && text[s + k] == pattern[k]) k++;
        if (k == m) { if (any) printf(" "); printf("%d", s); any = 1; }
    }
    if (!any) printf("none");
    printf("\\n"); free(textin); return 0;
}
`,
};

// Go search programs call helpers that the numeric prelude does not define.
const goHelpers = `
func min(x, y int) int { if x < y { return x }; return y }
func sortInts(a []int) { for i := 1; i < len(a); i++ { for j := i; j > 0 && a[j] < a[j-1]; j-- { a[j], a[j-1] = a[j-1], a[j] } } }
func mathSqrt(n int) int { s := 1; for (s+1)*(s+1) <= n { s++ }; return s }
`;

for (const id of ['jump-search', 'interpolation-search', 'exponential-search']) {
  go[id] = go[id].replace('func main() {', `${goHelpers}func main() {`);
}

cpp['jump-search'] = cpp['jump-search'].replace('#include <vector>', '#include <cmath>\n#include <vector>');

export const extra = { c, cpp, java, python: py, go, rust, javascript: js };
