// npm run tutorial:doc — doc/Tutorial.md and doc/Tutorial.en.md from the tutorial plan (scripts/tutorial-plan.mjs):
// the introduction, each lesson's steps, its picture (doc/images/<lang>/tut-robot-NN.png, taken by the video run
// at the end of the lesson) and the sample that holds its result. Then `npm run build:docs` makes the HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTRO, LESSONS, OUTRO } from './tutorial-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const lang of ['ko', 'en']) {
  const T = (x) => x[lang];
  const out = [];
  out.push(lang === 'ko' ? '# MyMechanics 튜토리얼 — 6축 다관절 로봇 만들기' : '# MyMechanics tutorial — building a six-axis articulated robot', '');
  out.push(T(INTRO), '');
  out.push(lang === 'ko' ? '같은 과정을 담은 동영상: `doc/video/MyMechanics-Tutorial.mp4`(도움말 › 튜토리얼).' : 'A video of the same steps: `doc/video/MyMechanics-Tutorial.en.mp4` (Help › Tutorial).', '');
  LESSONS.forEach((lesson, i) => {
    const n = i + 1;
    out.push(lang === 'ko' ? `## ${n}과. ${T(lesson.title)}` : `## Lesson ${n}. ${T(lesson.title)}`, '');
    out.push(T(lesson.sub), '');
    lesson.steps.forEach((step, k) => out.push(`${k + 1}. ${T(step.say)}`));
    out.push('');
    const img = `images/${lang}/tut-robot-${String(n).padStart(2, '0')}.png`;
    if (fs.existsSync(path.join(root, 'doc', img))) out.push(`   ![${T(lesson.title)}](${img})`, '');
    out.push(lang === 'ko' ? `> 이 과의 결과: 시작 화면 › 예제 › 튜토리얼 — 6축 로봇 › **${n}과**` : `> This lesson's result: start page › Samples › Tutorial — six-axis robot › **Lesson ${n}**`, '');
  });
  out.push(lang === 'ko' ? '## 마치며' : '## Wrapping up', '', T(OUTRO), '');
  fs.writeFileSync(path.join(root, 'doc', lang === 'ko' ? 'Tutorial.md' : 'Tutorial.en.md'), out.join('\n'));
  console.log(`doc/${lang === 'ko' ? 'Tutorial.md' : 'Tutorial.en.md'}: ${LESSONS.length} lessons`);
}
