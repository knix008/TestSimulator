// Small illustrations for the start page's 샘플·예제 cards: each sample gets a
// scene of what it is about (a query reaching a database for SQL injection,
// a memory buffer spilling over for the C overrun, …). Drawn in a 200×64
// viewBox with theme tokens (--bg, --fg, --danger, …) so they follow the
// dark / light theme; the language colour is the only fixed accent.
import React from 'react';

const MONO = "'Cascadia Mono', Consolas, Menlo, monospace";
const BAD = 'var(--danger)';
const WARN = 'var(--folder)';
const OK = 'var(--ok)';
const FG = 'var(--fg)';
const MUTED = 'var(--fg-muted)';
const PANEL = 'var(--bg-panel)';
const LINE = 'var(--border-strong)';

function Code({ x, y, children, fill = MUTED, size = 7, weight }) {
  return <text x={x} y={y} fontFamily={MONO} fontSize={size} fill={fill} fontWeight={weight}>{children}</text>;
}

/** A window frame (browser or terminal) with a title bar. */
function Win({ x, y, w, h, c, dark }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={dark ? 'var(--bg-elev)' : PANEL} stroke={LINE} />
      <path d={`M${x} ${y + 8}h${w}`} stroke={LINE} />
      <circle cx={x + 5} cy={y + 4} r={1.6} fill={BAD} opacity={0.8} />
      <circle cx={x + 10} cy={y + 4} r={1.6} fill={WARN} opacity={0.8} />
      <circle cx={x + 15} cy={y + 4} r={1.6} fill={OK} opacity={0.8} />
      {c && <rect x={x + 22} y={y + 2.5} width={Math.min(60, w - 30)} height={3} rx={1.5} fill={c} opacity={0.45} />}
    </g>
  );
}

/** A database cylinder. */
function Db({ x, y, w, h, c }) {
  const rx = w / 2;
  return (
    <g>
      <path d={`M${x} ${y}v${h}a${rx} 4 0 0 0 ${w} 0v${-h}`} fill={PANEL} stroke={c} strokeWidth={1.4} />
      <path d={`M${x} ${y + h / 2}a${rx} 4 0 0 0 ${w} 0`} fill="none" stroke={c} strokeWidth={1} opacity={0.6} />
      <ellipse cx={x + rx} cy={y} rx={rx} ry={4} fill={c} opacity={0.85} />
    </g>
  );
}

/** A key (hard-coded secret). */
function Key({ x, y, c = WARN }) {
  return (
    <g fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <circle cx={x} cy={y} r={4} />
      <path d={`M${x + 4} ${y}h11M${x + 12} ${y}v3.5M${x + 15} ${y}v2.5`} />
    </g>
  );
}

/** A warning triangle. */
function Warn({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -7L7.5 6H-7.5Z" fill={BAD} />
      <path d="M0 -2.5V2" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={0} cy={4} r={0.9} fill="#fff" />
    </g>
  );
}

/** A line ending in an arrow head at `end`, pointing `angle` degrees. */
function Arrow({ d, end, angle = 0, c = MUTED, dash }) {
  return (
    <g>
      <path d={d} fill="none" stroke={c} strokeWidth={1.4} strokeDasharray={dash} />
      <path d="M-4.5 -3L1 0L-4.5 3z" fill={c} transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`} />
    </g>
  );
}

/** A cog with n teeth. */
function cogPath(cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2;
    const rr = (i % 4 < 2) ? r + 3 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

function Cell({ x, y, ch, fill, stroke, text = FG }) {
  return (
    <g>
      <rect x={x} y={y} width={13} height={15} rx={2} fill={fill} stroke={stroke} />
      <text x={x + 6.5} y={y + 10.5} textAnchor="middle" fontFamily={MONO} fontSize={7.5} fill={text}>{ch}</text>
    </g>
  );
}

const SCENES = {
  // Whole demo: a dashboard — languages, a severity donut and a magnifier.
  all: () => {
    const C = 2 * Math.PI * 11;
    const segs = [[BAD, 0.3], [WARN, 0.25], [OK, 0.45]];
    let off = 0;
    return (
      <g>
        <Win x={22} y={6} w={156} h={52} />
        {[['#f89820', 26], ['#f7df1e', 18], ['#3776ab', 32], ['#a8b9cc', 22], ['#00add8', 14], ['#e34c26', 20]].map(([col, h], i) => (
          <rect key={i} x={32 + i * 10} y={52 - h} width={7} height={h} rx={1.5} fill={col} opacity={0.85} />
        ))}
        <path d="M30 52.5h62" stroke={LINE} />
        <g transform="rotate(-90 116 32)">
          {segs.map(([col, f], i) => {
            const len = C * f;
            const el = <circle key={i} cx={116} cy={32} r={11} fill="none" stroke={col} strokeWidth={6} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        </g>
        <g fill="none" stroke={FG} strokeWidth={2} strokeLinecap="round" opacity={0.85}>
          <circle cx={150} cy={28} r={8} />
          <path d="M156 34l7 7" strokeWidth={3} />
        </g>
        <path d="M146 28h8M150 24v8" stroke={BAD} strokeWidth={1.6} opacity={0.8} />
      </g>
    );
  },

  // Java servlet: user input glued into a query that hits the database; a null.
  java: (c) => (
    <g>
      <rect x={22} y={10} width={92} height={36} rx={4} fill={PANEL} stroke={LINE} />
      <Code x={27} y={21}>"SELECT * FROM</Code>
      <Code x={27} y={30}> users WHERE id="</Code>
      <Code x={27} y={39} fill={BAD} weight={700}> + req.id</Code>
      <rect x={26} y={33} width={46} height={8} rx={2} fill="none" stroke={BAD} strokeDasharray="2 1.5" />
      <Arrow d="M116 28h13" end={[130, 28]} c={BAD} />
      <Db x={136} y={16} w={24} h={26} c={c} />
      <Warn x={163} y={14} s={0.85} />
      <rect x={26} y={50} width={40} height={10} rx={5} fill="none" stroke={WARN} />
      <Code x={46} y={57.5} fill={WARN} size={6.5} weight={700}><tspan textAnchor="middle">null.get()</tspan></Code>
    </g>
  ),

  // JavaScript: a browser where injected script pops an alert; eval().
  js: (c) => (
    <g>
      <Win x={22} y={6} w={112} h={52} c={c} />
      <rect x={30} y={20} width={60} height={4} rx={2} fill={MUTED} opacity={0.5} />
      <rect x={30} y={28} width={44} height={4} rx={2} fill={MUTED} opacity={0.5} />
      <rect x={58} y={30} width={66} height={22} rx={3} fill="var(--bg)" stroke={BAD} strokeWidth={1.3} />
      <Code x={64} y={40} fill={BAD} weight={700}>alert(1)</Code>
      <rect x={104} y={44} width={16} height={5} rx={2} fill={BAD} opacity={0.7} />
      <rect x={140} y={10} width={38} height={14} rx={7} fill={c} />
      <Code x={146} y={20} fill="#222" weight={700}>eval(</Code>
      <rect x={140} y={30} width={38} height={14} rx={7} fill="none" stroke={BAD} />
      <Code x={145} y={40} fill={BAD} size={6.5} weight={700}>&lt;script&gt;</Code>
    </g>
  ),

  // Python: a terminal running a shell command built from input; a secret key.
  py: (c) => (
    <g>
      <Win x={22} y={6} w={120} h={52} dark />
      <Code x={28} y={23} fill={c} weight={700}>&gt;&gt;&gt;</Code>
      <Code x={46} y={23} fill={FG}>os.system(</Code>
      <Code x={50} y={33} fill={BAD} weight={700}>"ping " + host</Code>
      <path d="M50 35.5h56" stroke={BAD} strokeWidth={1} strokeDasharray="2 1.5" />
      <Code x={28} y={47} fill={MUTED}>$ rm -rf ~</Code>
      <Warn x={128} y={46} s={0.8} />
      <Key x={156} y={22} />
      <rect x={146} y={32} width={34} height={12} rx={3} fill="none" stroke={WARN} />
      <Code x={163} y={40.5} fill={WARN} size={6}><tspan textAnchor="middle">pw=1234</tspan></Code>
    </g>
  ),

  // C#: a stream that is never disposed (leaking) and an empty catch.
  cs: (c) => (
    <g>
      <path d="M30 14h30v10h-6v-4H30z" fill={c} opacity={0.85} />
      <path d="M54 24v6" stroke={c} strokeWidth={4} />
      {[[56, 36], [53, 44], [57, 52]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 4}q3 4 0 5q-3 -1 0 -5z`} fill={BAD} opacity={0.9 - i * 0.2} />)}
      <Code x={26} y={44} fill={MUTED} size={6.5}>Stream</Code>
      <Code x={26} y={52} fill={MUTED} size={6.5}>no Dispose</Code>
      <rect x={80} y={10} width={98} height={44} rx={4} fill={PANEL} stroke={LINE} />
      <Code x={86} y={22} fill={FG}>try {'{'} Load(); {'}'}</Code>
      <Code x={86} y={34} fill={c} weight={700}>catch</Code>
      <rect x={110} y={27} width={20} height={10} rx={2} fill="none" stroke={BAD} strokeDasharray="2 1.5" />
      <Code x={113} y={34} fill={BAD} weight={700}>{'{ }'}</Code>
      <Code x={86} y={47} fill={MUTED} size={6.5}>// swallowed</Code>
    </g>
  ),

  // C: a fixed buffer that strcpy writes past — the overrun spills in red.
  c: (c) => {
    const chars = ['H', 'E', 'L', 'L', 'O', '\\0', 'W', 'O', 'R'];
    return (
      <g>
        <Code x={24} y={14} fill={FG} size={7}>char buf[6];</Code>
        <Code x={112} y={14} fill={BAD} size={7} weight={700}>strcpy(buf, s)</Code>
        {chars.map((ch, i) => (
          <Cell key={i} x={24 + i * 15.5} y={22} ch={ch} fill={i < 6 ? 'var(--bg-elev)' : 'color-mix(in srgb, var(--danger) 25%, transparent)'} stroke={i < 6 ? c : BAD} text={i < 6 ? FG : BAD} />
        ))}
        <path d="M24 41v3h92v-3" fill="none" stroke={c} strokeWidth={1.2} />
        <Code x={58} y={53} fill={MUTED} size={6.5}>6 bytes</Code>
        <Arrow d="M116 46h39" end={[156, 46]} c={BAD} />
        <Code x={124} y={56} fill={BAD} size={6.5} weight={700}>overrun</Code>
        <Warn x={174} y={29} s={0.9} />
      </g>
    );
  },

  // Go: two goroutines racing on one counter; an ignored error.
  go: (c) => (
    <g>
      <rect x={22} y={10} width={34} height={13} rx={6.5} fill={c} opacity={0.9} />
      <Code x={27} y={19} fill="#06202b" weight={700}>go f()</Code>
      <rect x={22} y={34} width={34} height={13} rx={6.5} fill={c} opacity={0.9} />
      <Code x={27} y={43} fill="#06202b" weight={700}>go f()</Code>
      <Arrow d="M58 16.5q20 0 29 8" end={[88, 25.5]} angle={42} c={c} />
      <Arrow d="M58 40.5q20 0 29 -8" end={[88, 31.5]} angle={-42} c={c} />
      <rect x={92} y={20} width={44} height={17} rx={3} fill={PANEL} stroke={BAD} strokeWidth={1.3} />
      <Code x={98} y={31.5} fill={FG} weight={700}>n++</Code>
      <path d="M126 12l-6 9h5l-5 9" fill="none" stroke={BAD} strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={142} y={14} width={36} height={13} rx={3} fill="none" stroke={WARN} />
      <Code x={146} y={23} fill={WARN} size={6.5} weight={700}>_ = err</Code>
      <Code x={92} y={52} fill={MUTED} size={6.5}>data race</Code>
    </g>
  ),

  // Rust: an unsafe block breaking the safety shield; unwrap() that panics.
  rs: (c) => (
    <g>
      <path d={cogPath(44, 32, 15, 10)} fill={c} opacity={0.85} />
      <circle cx={44} cy={32} r={6} fill="var(--bg)" />
      <path d="M86 10l22 6v14c0 12-10 19-22 22c-12-3-22-10-22-22V16z" fill={PANEL} stroke={c} strokeWidth={1.4} />
      <path d="M84 14l5 12-6 6 6 10" fill="none" stroke={BAD} strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={114} y={14} width={46} height={13} rx={3} fill="none" stroke={BAD} />
      <Code x={119} y={23.5} fill={BAD} weight={700}>unsafe {'{'}</Code>
      <rect x={114} y={34} width={64} height={13} rx={6.5} fill={WARN} opacity={0.9} />
      <Code x={120} y={43.5} fill="#2a1d00" weight={700}>.unwrap() !</Code>
    </g>
  ),

  // Ruby: a gem, eval of a string, and a weak MD5 hash.
  rb: (c) => (
    <g>
      <path d="M30 20l10-9h20l10 9-20 28z" fill={c} opacity={0.9} />
      <path d="M30 20h40M40 11l10 9 10-9M40 20l10 28 10-28" fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1} />
      <rect x={82} y={10} width={58} height={14} rx={3} fill={PANEL} stroke={BAD} />
      <Code x={87} y={20} fill={BAD} weight={700}>eval(params)</Code>
      <rect x={82} y={32} width={44} height={14} rx={3} fill={PANEL} stroke={WARN} />
      <Code x={87} y={42} fill={WARN} weight={700}>MD5 #</Code>
      <g fill="none" stroke={WARN} strokeWidth={1.8}>
        <rect x={134} y={36} width={16} height={12} rx={2} />
        <path d="M137 36v-4a5 5 0 0 1 10 -1" />
      </g>
    </g>
  ),

  // SQL: a result table; SELECT * and a DELETE that wipes every row.
  sql: (c) => (
    <g>
      <rect x={22} y={8} width={92} height={48} rx={3} fill={PANEL} stroke={LINE} />
      <rect x={22} y={8} width={92} height={9} rx={3} fill={c} opacity={0.8} />
      {[17, 26, 35, 44].map((y) => <path key={y} d={`M22 ${y}h92`} stroke={LINE} />)}
      {[45, 68, 91].map((x) => <path key={x} d={`M${x} 8v48`} stroke={LINE} />)}
      {[26, 35, 44].map((y) => <path key={y} d={`M24 ${y + 4.5}h88`} stroke={BAD} strokeWidth={1.4} opacity={0.85} />)}
      <rect x={122} y={10} width={56} height={13} rx={3} fill="none" stroke={WARN} />
      <Code x={126} y={19.5} fill={WARN} weight={700}>SELECT *</Code>
      <rect x={122} y={30} width={56} height={13} rx={3} fill={BAD} />
      <Code x={126} y={39.5} fill="#fff" weight={700}>DELETE ;</Code>
      <Code x={124} y={53} fill={MUTED} size={6}>no WHERE</Code>
    </g>
  ),

  // Shell: piping a download straight into sh; an unquoted variable.
  sh: (c) => (
    <g>
      <Win x={22} y={6} w={156} h={52} dark />
      <Code x={28} y={24} fill={c} weight={700}>$</Code>
      <Code x={36} y={24} fill={FG}>curl -s http://x</Code>
      <rect x={110} y={16} width={22} height={11} rx={2} fill={BAD} />
      <Code x={113} y={24.5} fill="#fff" weight={700}>| sh</Code>
      <Code x={28} y={40} fill={c} weight={700}>$</Code>
      <Code x={36} y={40} fill={FG}>rm -rf</Code>
      <Code x={66} y={40} fill={WARN} weight={700}>$DIR/</Code>
      <path d="M66 42.5h21" stroke={WARN} strokeWidth={1.2} strokeDasharray="2 1.5" />
      <Warn x={164} y={30} s={0.85} />
    </g>
  ),

  // HTML: a login form with a password field and an inline <script>.
  html: (c) => (
    <g>
      <Win x={22} y={6} w={110} h={52} c={c} />
      <rect x={34} y={18} width={22} height={3} rx={1.5} fill={MUTED} />
      <rect x={34} y={23} width={72} height={9} rx={2} fill="var(--bg)" stroke={LINE} />
      <rect x={34} y={36} width={22} height={3} rx={1.5} fill={MUTED} />
      <rect x={34} y={41} width={72} height={9} rx={2} fill="var(--bg)" stroke={WARN} />
      <Code x={38} y={48} fill={FG} weight={700}>••••••</Code>
      <rect x={110} y={41} width={16} height={9} rx={2} fill={c} />
      <rect x={138} y={14} width={42} height={14} rx={3} fill="none" stroke={BAD} />
      <Code x={141} y={24} fill={BAD} size={6.5} weight={700}>&lt;script&gt;</Code>
      <Key x={146} y={42} />
    </g>
  ),

  // Docker: container blocks on a hull; the :latest tag and a secret in ENV.
  docker: (c) => (
    <g>
      {[[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [2, 2]].map(([i, j]) => (
        <rect key={`${i}${j}`} x={36 + i * 12} y={30 - j * 10} width={10} height={8} rx={1} fill={c} opacity={0.85} />
      ))}
      <path d="M24 40h70c4 0 8-4 10-8c2 6-2 18-28 18H40c-10 0-16-4-16-10z" fill={c} />
      <rect x={112} y={10} width={50} height={13} rx={6.5} fill="none" stroke={WARN} />
      <Code x={118} y={19.5} fill={WARN} weight={700}>:latest</Code>
      <rect x={112} y={30} width={66} height={13} rx={3} fill="none" stroke={BAD} />
      <Code x={116} y={39.5} fill={BAD} size={6.5} weight={700}>ENV PASSWORD</Code>
      <Code x={112} y={54} fill={MUTED} size={6.5}>RUN sudo …</Code>
    </g>
  ),

  // Kubernetes: a helm wheel; a privileged pod on the host network.
  k8s: (c) => {
    const spokes = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      spokes.push(`M42 32L${(42 + Math.cos(a) * 18).toFixed(1)} ${(32 + Math.sin(a) * 18).toFixed(1)}`);
    }
    return (
      <g>
        <circle cx={42} cy={32} r={19} fill={c} />
        <circle cx={42} cy={32} r={12} fill="none" stroke="#fff" strokeWidth={2} />
        <path d={spokes.join('')} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        <circle cx={42} cy={32} r={3} fill="#fff" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={76 + i * 22} y={14} width={18} height={18} rx={3} fill={i === 1 ? 'color-mix(in srgb, var(--danger) 25%, transparent)' : PANEL} stroke={i === 1 ? BAD : c} strokeWidth={1.3} />
        ))}
        <path d="M100 20l2.5 3 2.5-4 2.5 4 2.5-3v7h-10z" fill={BAD} />
        <path d="M76 44h62" stroke={BAD} strokeWidth={2} strokeDasharray="4 2" />
        <Code x={76} y={56} fill={BAD} size={6.5} weight={700}>hostNetwork</Code>
        <Code x={144} y={27} fill={BAD} size={6.5} weight={700}>root</Code>
      </g>
    );
  },

  // Terraform: a cloud with a security group open to the world; a public bucket.
  tf: (c) => (
    <g>
      <path d="M34 40a10 10 0 0 1 4-19a14 14 0 0 1 26-3a10 10 0 0 1 12 9a7 7 0 0 1-2 13z" fill={c} opacity={0.85} />
      <g fill="none" stroke={BAD} strokeWidth={1.4}>
        <circle cx={104} cy={26} r={12} />
        <ellipse cx={104} cy={26} rx={5} ry={12} />
        <path d="M92 26h24M94 19h20M94 33h20" />
      </g>
      <Code x={86} y={52} fill={BAD} size={6.5} weight={700}>0.0.0.0/0</Code>
      <path d="M134 18h36l-4 26h-28z" fill={PANEL} stroke={WARN} strokeWidth={1.4} />
      <path d="M130 11l38 -4" stroke={WARN} strokeWidth={2.5} strokeLinecap="round" />
      <Code x={141} y={34} fill={WARN} size={6.5} weight={700}>public</Code>
    </g>
  ),

  // npm: a dependency tree with one vulnerable package and a git+http link.
  npm: (c) => {
    const box = (x, y, col, label, tc = '#fff') => (
      <g>
        <rect x={x} y={y} width={28} height={13} rx={2} fill={col} />
        <Code x={x + 14} y={y + 9} fill={tc} size={6.5} weight={700}><tspan textAnchor="middle">{label}</tspan></Code>
      </g>
    );
    return (
      <g>
        <path d="M50 17v8H86M50 25v14h36M50 25v-8" fill="none" stroke={LINE} strokeWidth={1.4} />
        <path d="M114 32h12" stroke={MUTED} strokeWidth={1.4} />
        {box(30, 6, c, 'app')}
        {box(86, 18, 'var(--bg-elev)', 'lib', FG)}
        {box(86, 33, BAD, 'CVE')}
        <path d="M50 39v10h36" fill="none" stroke={BAD} strokeWidth={1.4} strokeDasharray="3 2" />
        <Code x={90} y={52} fill={BAD} size={6} weight={700}>git+http</Code>
        <rect x={130} y={18} width={46} height={28} rx={2} fill={PANEL} stroke={LINE} />
        <Code x={134} y={28} fill={FG} size={6.5} weight={700}>SBOM</Code>
        {[33, 38, 43].map((y) => <rect key={y} x={134} y={y - 1.5} width={y === 38 ? 22 : 34} height={2.5} rx={1} fill={y === 38 ? BAD : MUTED} opacity={0.7} />)}
      </g>
    );
  },

  // Duplicated code: two files with the same highlighted block, linked.
  dup: (c) => {
    const doc = (x) => (
      <g>
        <path d={`M${x} 6h40l8 8v44h-48z`} fill={PANEL} stroke={LINE} />
        <path d={`M${x + 40} 6v8h8`} fill="none" stroke={LINE} />
        <rect x={x + 5} y={16} width={26} height={3} rx={1.5} fill={MUTED} opacity={0.6} />
        <rect x={x + 3} y={23} width={42} height={20} rx={2} fill={c} opacity={0.3} stroke={c} />
        {[27, 32, 37].map((y, i) => <rect key={y} x={x + 7 + (i === 1 ? 5 : 0)} y={y} width={i === 1 ? 26 : 32} height={2.5} rx={1} fill={FG} opacity={0.75} />)}
        <rect x={x + 5} y={48} width={20} height={3} rx={1.5} fill={MUTED} opacity={0.6} />
      </g>
    );
    return (
      <g>
        {doc(32)}
        {doc(120)}
        <path d="M80 33h40" stroke={BAD} strokeWidth={1.4} strokeDasharray="3 2" />
        <circle cx={100} cy={33} r={7} fill="var(--bg)" stroke={BAD} strokeWidth={1.4} />
        <path d="M96.5 31h7M96.5 35h7" stroke={BAD} strokeWidth={1.6} />
      </g>
    );
  },

  // C++ sensor logger: a thermometer, its signal and the CSV log it writes.
  sensor: (c) => (
    <g>
      <rect x={28} y={8} width={8} height={36} rx={4} fill={PANEL} stroke={c} strokeWidth={1.4} />
      <circle cx={32} cy={48} r={7} fill={c} />
      <rect x={30.5} y={22} width={3} height={22} fill={c} />
      <path d="M44 34q6-18 12 0t12 0t12-6t12 2" fill="none" stroke={c} strokeWidth={1.8} />
      <Arrow d="M96 32h13" end={[110, 32]} />
      <rect x={114} y={8} width={46} height={48} rx={2} fill={PANEL} stroke={LINE} />
      <Code x={118} y={18} fill={FG} size={6} weight={700}>t,temp</Code>
      {[26, 34, 42, 50].map((y, i) => <rect key={y} x={118} y={y - 3} width={i === 2 ? 26 : 34} height={3} rx={1} fill={i === 2 ? BAD : MUTED} opacity={0.75} />)}
      <Warn x={170} y={42} s={0.8} />
      <Code x={46} y={56} fill={MUTED} size={6}>C++17</Code>
    </g>
  ),

  // Fallback: a source file under a magnifier.
  generic: (c) => (
    <g>
      <path d="M64 6h48l10 10v42h-58z" fill={PANEL} stroke={LINE} />
      <path d="M112 6v10h10" fill="none" stroke={LINE} />
      {[18, 25, 32, 39, 46].map((y, i) => <rect key={y} x={70 + (i % 2) * 6} y={y} width={[30, 22, 34, 18, 26][i]} height={3} rx={1.5} fill={i === 2 ? BAD : c} opacity={i === 2 ? 0.95 : 0.7} />)}
      <g fill="none" stroke={FG} strokeWidth={2} strokeLinecap="round" opacity={0.85}>
        <circle cx={126} cy={38} r={9} />
        <path d="M133 45l8 8" strokeWidth={3} />
      </g>
    </g>
  ),
};

// The project samples (samples/<folder>) by folder id, else by main language.
const PROJECT_SCENES = { demo: 'all', 'cpp-sensor': 'sensor' };
const LANG_SCENES = { java: 'java', js: 'js', ts: 'js', py: 'py', cs: 'cs', c: 'c', go: 'go', rs: 'rs', rb: 'rb', sql: 'sql', sh: 'sh', html: 'html', docker: 'docker', yaml: 'k8s', tf: 'tf', json: 'npm' };

/** The scene for an API sample ({ id, title, languages }). */
export function projectScene(sample) {
  const id = String((sample && sample.id) || '').toLowerCase();
  if (PROJECT_SCENES[id]) return PROJECT_SCENES[id];
  const text = `${id} ${(sample && sample.title) || ''}`.toLowerCase();
  if (/sensor|센서|iot|embedded|임베디드/.test(text)) return 'sensor';
  const langs = Object.entries((sample && sample.languages) || {}).sort((a, b) => b[1] - a[1]);
  if (langs.length > 3) return 'all';
  const top = langs.length ? langs[0][0] : '';
  if (top === 'cpp') return 'sensor';
  return LANG_SCENES[top] || 'generic';
}

/** One sample card's picture, plus the issue count badge when there are issues. */
export function SampleArt({ scene, color = 'var(--accent)', issues = 0 }) {
  const draw = SCENES[scene] || SCENES.generic;
  return (
    <svg className="sample-preview" viewBox="0 0 200 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-scene={SCENES[scene] ? scene : 'generic'}>
      {draw(color)}
      {issues > 0 && <g><rect x="160" y="46" width="34" height="14" rx="7" fill="var(--danger)" /><text x="177" y="56.5" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">{issues}</text></g>}
    </svg>
  );
}
