# X11 프로토콜 참고

## 기본 구조

### 요청 (Request)

- 클라이언트 → 서버
- 고정 헤더 + 가변 데이터

### 응답 (Reply)

- 서버 → 클라이언트
- 일부 요청에만 응답

### 이벤트 (Event)

- 서버 → 클라이언트
- 비동기적 전송

### 에러 (Error)

- 서버 → 클라이언트
- 요청 실패 시

## 주요 Opcode

| Opcode | 이름                   | 설명                 |
| ------ | ---------------------- | -------------------- |
| 1      | CreateWindow           | 윈도우 생성          |
| 2      | ChangeWindowAttributes | 윈도우 속성 변경     |
| 3      | GetWindowAttributes    | 윈도우 속성 조회     |
| 4      | DestroyWindow          | 윈도우 삭제          |
| 8      | MapWindow              | 윈도우 표시          |
| 10     | UnmapWindow            | 윈도우 숨김          |
| 12     | ConfigureWindow        | 윈도우 설정          |
| 55     | CreateGC               | 그래픽 컨텍스트 생성 |
| 62     | CopyArea               | 영역 복사            |
| 70     | PolyFillRectangle      | 사각형 채우기        |
| 76     | ImageText8             | 8비트 텍스트 그리기  |

## 이벤트 타입

| 값  | 이름            | 설명                         |
| --- | --------------- | ---------------------------- |
| 2   | KeyPress        | 키 눌림                      |
| 3   | KeyRelease      | 키 뗌                        |
| 4   | ButtonPress     | 마우스 버튼 눌림             |
| 5   | ButtonRelease   | 마우스 버튼 뗌               |
| 6   | MotionNotify    | 마우스 이동                  |
| 12  | Expose          | 윈도우 노출 (다시 그려야 함) |
| 22  | ConfigureNotify | 윈도우 설정 변경             |

## 연결 설정 구조

```
Connection Setup Request:
  byte-order (1 byte): 'B' or 'l'
  unused (1 byte)
  protocol-major-version (2 bytes)
  protocol-minor-version (2 bytes)
  authorization-protocol-name-length (2 bytes)
  authorization-protocol-data-length (2 bytes)
  unused (2 bytes)
  authorization-protocol-name (n bytes)
  authorization-protocol-data (d bytes)
```

```
Connection Setup Response:
  success (1 byte): 0=Failed, 1=Success, 2=Authenticate
  unused (1 byte)
  protocol-major-version (2 bytes)
  protocol-minor-version (2 bytes)
  additional-data-length (2 bytes): 4-byte 단위
  ...
```

## CreateWindow 요청 구조

```
1    opcode
1    depth
2    request-length
4    wid: WINDOW
4    parent: WINDOW
2    x: INT16
2    y: INT16
2    width: CARD16
2    height: CARD16
2    border-width: CARD16
2    class: CARD16
4    visual: VISUALID
4    value-mask: BITMASK
...  value-list: LISTofVALUE
```

## Graphics Context (GC)

GC는 그리기 속성을 담는 객체:

- foreground/background 색상
- 선 너비, 스타일
- 폰트
- 클리핑 영역 등

## 리소스 ID

X11에서 모든 리소스는 32비트 ID로 식별:

- Window
- Pixmap
- GContext
- Colormap
- Cursor
- Font

클라이언트가 ID를 할당하고, 서버가 유효성 검사.
