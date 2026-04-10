# Ollama Local Chat Widget Demo

로컬에 설치된 Ollama를 사용하는 웹 채팅 위젯 데모입니다.

## 주요 기능

- 브라우저 우측 하단에 고정된 플로팅 채팅 위젯
- 기본 상태는 작은 런처 버튼(`AI 도우미`)으로 표시
- 클릭 시 채팅 창을 별도 윈도우처럼 열고 닫기
- 답변 생성 중 로딩 스피너 애니메이션 표시
- Ollama 모델 목록 자동 조회 및 수동 새로고침
- 사용자 모델 선택 또는 자동 기본 모델 선택

## 1) Ollama 준비

1. Ollama 실행
2. 모델 다운로드 예시

```bash
ollama pull gemma4:26b
```

## 2) 데모 실행

```bash
cd AgentV10
node server.js
```

서버가 뜨면 브라우저에서 아래 주소를 열면 됩니다.

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

## 3) 환경 변수 (선택)

- `PORT`: 서버 포트 (기본 3000)
- `OLLAMA_URL`: Ollama API 주소 (기본 `http://127.0.0.1:11434/api/chat`)
- `OLLAMA_MODEL`: 기본 모델명 (기본 `gemma4:26b`)

PowerShell 예시:

```powershell
$env:OLLAMA_MODEL="gemma4:26b"
node server.js
```

## API

- `POST /api/chat`
  - 요청: `messages`, `model`
  - 동작: Ollama `/api/chat` 호출 후 답변 반환
- `GET /api/models`
  - 동작: Ollama `/api/tags` 조회 후 모델 목록/기본 모델 반환
  - 응답: `models`, `defaultModel`

## 프로젝트 구조

```text
AgentV10/
  public/
    index.html
    app.js
    styles.css
  routes/
    chat.js
    models.js
  ollama/
    index.js
    ollama.js
  server.js
```

## 동작 흐름

1. 브라우저가 시작 시 `/api/models`를 호출해 모델 목록을 불러옵니다.
2. 사용자가 메시지를 보내면 `/api/chat`으로 전송합니다.
3. 서버 라우트(`routes/*`)가 Ollama 모듈(`ollama/*`)을 통해 실제 Ollama API를 호출합니다.
4. 응답이 오기 전까지 UI에 "답변 생성 중" 스피너를 표시합니다.
