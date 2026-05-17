# XManWindowsV10에 기여하기

프로젝트에 기여해주셔서 감사합니다! 이 가이드는 기여 방법을 안내합니다.

## 개발 환경 설정

1. 저장소 클론
2. [BUILD.md](docs/BUILD.md) 참고하여 빌드 환경 구성
3. 코드 변경
4. 테스트
5. Pull Request 제출

## 코딩 스타일

### C++ 스타일

- **네이밍**:
  - 클래스: PascalCase (예: `XManServer`)
  - 함수/메서드: PascalCase (예: `ProcessRequest`)
  - 변수: camelCase (예: `windowManager`)
  - 멤버 변수: m\_ 접두사 + camelCase (예: `m_running`)
  - 상수: UPPER_SNAKE_CASE (예: `DEFAULT_X_PORT`)

- **들여쓰기**: 4칸 스페이스

- **중괄호**: K&R 스타일

  ```cpp
  if (condition) {
      // code
  }
  ```

- **네임스페이스**:
  ```cpp
  namespace XMan {
  // code
  } // namespace XMan
  ```

### 헤더 가드

```cpp
#pragma once
```

### 주석

- 복잡한 로직에는 설명 추가
- TODO 주석으로 미완성 작업 표시
  ```cpp
  // TODO: 이미지 렌더링 구현
  ```

## 커밋 메시지

명확하고 설명적인 커밋 메시지 작성:

```
[Component] Brief description

Detailed explanation if necessary.

Fixes #123
```

예시:

```
[X11Protocol] Add support for ConfigureWindow request

Implemented parsing and handling of ConfigureWindow opcode.
Window position and size are now properly updated.

Fixes #42
```

## Pull Request

1. 기능 브랜치 생성: `feature/your-feature-name`
2. 변경사항 커밋
3. 테스트 작성 및 실행
4. PR 생성
5. 리뷰 대기

### PR 체크리스트

- [ ] 코드가 빌드됨
- [ ] 기존 테스트 통과
- [ ] 새 기능에 테스트 추가
- [ ] 문서 업데이트
- [ ] 코딩 스타일 준수

## 이슈 리포팅

버그를 발견하셨나요? 이슈를 작성해주세요!

**포함할 내용:**

- 문제 설명
- 재현 단계
- 예상 동작
- 실제 동작
- 환경 정보 (OS, 버전 등)

## 아이디어 제안

새로운 기능이나 개선사항이 있으신가요?

1. 이슈로 제안
2. 커뮤니티와 논의
3. 승인 후 구현 시작

## 우선순위 작업

현재 도움이 필요한 영역:

1. **X11 프로토콜 완성**
   - 더 많은 opcode 구현
   - 이벤트 처리

2. **DirectX 렌더링**
   - 기본 도형 그리기
   - 텍스트 렌더링
   - 이미지 처리

3. **성능 최적화**
   - 배치 렌더링
   - 캐싱 전략

4. **테스트 추가**
   - 단위 테스트
   - 통합 테스트

## 질문이 있으신가요?

- 이슈에 질문 올리기
- 토론(Discussions) 활용

## 행동 강령

- 서로 존중
- 건설적인 피드백
- 포용적인 환경 조성

감사합니다! 🙏
