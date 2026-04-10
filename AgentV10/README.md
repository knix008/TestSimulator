# Ollama Local Chat Widget Demo

로컬에 설치된 Ollama를 사용하는 웹 채팅 위젯 데모입니다.

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

## 동작 방식

- 브라우저에서 `/api/chat`으로 질문 전송
- Node 서버가 로컬 Ollama API에 질의
- 응답을 브라우저 채팅창에 출력
