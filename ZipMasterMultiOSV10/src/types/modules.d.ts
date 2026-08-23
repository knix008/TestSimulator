// 타입 정의가 없는 모듈 및 Vite 전용 import 접미사 선언.
declare module 'node-7z'

// Vite: `import x from '...?url'` → 문자열 URL
declare module '*?url' {
  const url: string
  export default url
}
