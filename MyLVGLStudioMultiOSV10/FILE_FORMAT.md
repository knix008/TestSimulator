# `.mylvgl` 파일 형식

My LVGL Studio 프로젝트 파일 형식 1판입니다. UTF-8 JSON 텍스트이므로 사람이 읽을 수 있고 버전 관리 도구로 비교할 수 있습니다.

| 항목 | 값 |
|---|---|
| 확장자 | `.mylvgl` |
| 미디어 유형 | `application/vnd.mylvgl+json` (앱에서 정의한 값이며 공식 등록은 아닙니다) |
| 인코딩 | UTF-8. 읽을 때 BOM은 허용하고, 쓸 때는 붙이지 않습니다. |
| 현재 형식 버전 | 1 |

## 예시

```json
{
  "format": "mylvgl",
  "formatVersion": 1,
  "name": "MyApp",
  "lvgl": "9.6.0",
  "device": { "w": 320, "h": 240 },
  "theme": { "dark": false, "primary": "#2196f3", "secondary": "#f44336" },
  "nextId": 3,
  "screens": [
    {
      "id": "n1",
      "type": "screen",
      "name": "Screen1",
      "props": {},
      "events": [],
      "children": [
        {
          "id": "n2",
          "type": "button",
          "name": "button1",
          "props": { "x": 40, "y": 40, "width": 110, "height": 44, "text": "Start" },
          "events": [
            { "trigger": "CLICKED", "action": "log", "target": "", "text": "pressed" }
          ],
          "children": []
        }
      ]
    }
  ]
}
```

## 최상위 항목

| 항목 | 형식 | 필수 | 내용 |
|---|---|---|---|
| `format` | 문자열 | 예 | 항상 `"mylvgl"` |
| `formatVersion` | 정수 | 예 | 형식 버전. 1 이상 |
| `name` | 문자열 | 예 | 프로젝트 이름 |
| `lvgl` | 문자열 | 예 | LVGL 버전 `N.N.N`. 8.3 이상의 v8 또는 v9 |
| `device` | 객체 | 예 | 화면 크기. `w`와 `h`는 1 이상의 정수 |
| `theme` | 객체 | 예 | LVGL 기본 테마. `dark`(논리값), `primary`와 `secondary`(`#rrggbb`) |
| `nextId` | 정수 | 아니요 | 다음 노드 번호. 없거나 작으면 읽을 때 기존 id보다 크게 고칩니다. |
| `screens` | 배열 | 예 | 화면 노드. 1개 이상이며 첫 화면이 시작 화면입니다. |

## 노드

화면과 위젯은 같은 구조입니다.

| 항목 | 형식 | 내용 |
|---|---|---|
| `id` | 문자열 | 파일 안에서 유일한 값. 앱은 `n<번호>` 형태로 만듭니다. |
| `type` | 문자열 | 아래 위젯 종류. 최상위는 `screen`만, 그 아래에는 `screen`이 올 수 없습니다. |
| `name` | 문자열 | 생성 코드의 이름. `ui_<name>` 변수가 됩니다. |
| `props` | 객체 | 속성. 없는 항목은 LVGL 테마의 기본값을 씁니다. |
| `events` | 배열 | 이벤트 |
| `children` | 배열 | 자식 노드. `screen`과 `container`만 자식을 가질 수 있습니다. 뒤에 있는 노드가 앞에 그려집니다. |

### 위젯 종류

`screen`, `container`, `label`, `button`, `checkbox`, `switch`, `slider`, `bar`, `arc`, `dropdown`, `roller`, `textarea`, `spinner`, `led`

### 속성

어떤 위젯이 어떤 속성을 쓰는지는 `src/lvgl/schema.js`의 표가 기준입니다. 해당 위젯이 쓰지 않는 속성은 무시합니다.

| 분류 | 속성 | 값 |
|---|---|---|
| 배치 | `x`, `y` | 정수(픽셀) |
| | `width`, `height` | 정수(픽셀), `"50%"`, `"content"` |
| | `align` | `DEFAULT`, `TOP_LEFT`, `TOP_MID`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_MID`, `BOTTOM_RIGHT`, `LEFT_MID`, `RIGHT_MID`, `CENTER` |
| | `flexFlow` | `ROW`, `COLUMN`, `ROW_WRAP`, `COLUMN_WRAP` |
| | `gap` | 정수 |
| 내용 | `text`, `placeholder` | 문자열 |
| | `options` | 줄바꿈으로 나눈 문자열 |
| | `selected`, `min`, `max`, `value`, `ledBright` | 정수 |
| | `checked` | 논리값 |
| 스타일 | `bgColor`, `borderColor`, `textColor`, `shadowColor`, `indicatorColor` | `#rrggbb` |
| | `bgOpa`, `opa` | 0–255 |
| | `borderWidth`, `radius`, `pad`, `shadowWidth` | 정수 |
| | `font` | 12, 14, 16, 18, 20, 24, 28, 32, 36, 48 |
| 동작 | `hidden`, `clickable`, `scrollable`, `disabled` | 논리값 |

### 이벤트

| 항목 | 값 |
|---|---|
| `trigger` | `CLICKED`, `PRESSED`, `RELEASED`, `VALUE_CHANGED` |
| `action` | `screen`, `setText`, `toggle`, `show`, `hide`, `log` |
| `target` | 대상 노드의 `id`. `log`는 쓰지 않습니다. `screen`은 화면, 나머지는 위젯을 가리킵니다. |
| `text` | `setText`와 `log`의 문자열 |

대상이 없는 이벤트와 알 수 없는 `trigger`는 코드에 포함하지 않습니다.

## 읽기 규칙

다음 경우에는 파일을 열지 않고 이유를 표시합니다.

- JSON이 아니거나 `format`이 `"mylvgl"`이 아닌 경우
- `formatVersion`이 앱이 아는 값보다 큰 경우(새 버전의 앱이 필요)
- 필수 항목이 없거나 형식이 틀린 경우, 지원하지 않는 LVGL 버전인 경우
- `id`가 중복되거나, 알 수 없는 위젯 종류이거나, 노드 구조 규칙을 어긴 경우

알 수 없는 최상위 항목이나 속성이 있어도 거부하지 않습니다.

## 형식 버전 관리

- 이전 버전의 앱이 안전하게 읽을 수 없는 변경을 하면 `formatVersion`을 올립니다.
- 새 앱은 이전 형식 버전의 파일도 읽어야 합니다.
- 생성 코드는 이 파일에서 언제든 다시 만들 수 있으므로 형식에 포함하지 않습니다.
