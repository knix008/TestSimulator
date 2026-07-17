# Northline Homepage

다국어(한국어 / 영어) 회사 홈페이지입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) → `/ko`로 이동합니다.

## 구조

- `/ko`, `/en` — 홈
- `/ko/products`, `/en/products` — 제품
- `/ko/about`, `/en/about` — 회사소개
- `/ko/contact`, `/en/contact` — 문의

번역 문구는 `messages/ko.json`, `messages/en.json`에서 수정합니다.
