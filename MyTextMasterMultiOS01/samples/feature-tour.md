# MyTextMaster 기능 둘러보기

MyTextMaster 는 **Markdown**, *HTML*, 텍스트 문서를 편집하는 프로그램입니다.
왼쪽에서 쓰면 오른쪽 **미리 보기**가 바로 바뀝니다.

## 글자 꾸미기

| 문법 | 결과 |
| --- | --- |
| `**굵게**` | **굵게** |
| `*기울임*` | *기울임* |
| `~~취소선~~` | ~~취소선~~ |
| `` `코드` `` | `코드` |
| `[링크](https://example.com)` | [링크](https://example.com) |

## 목록

- 순서 없는 목록
  - 들여 쓴 항목
- 두 번째 항목

1. 순서 있는 목록
2. 두 번째

- [x] 끝낸 일
- [ ] 남은 일

## 인용과 코드

> 좋은 글은 고쳐 쓰기에서 나온다.

```js
function hello(name) {
  return `안녕하세요, ${name}님!`;
}
```

## 구분선과 그림

---

![MyTextMaster](https://via.placeholder.com/320x80?text=MyTextMaster)

## 바로 가기 키

- <kbd>Ctrl</kbd>+<kbd>B</kbd> 굵게, <kbd>Ctrl</kbd>+<kbd>I</kbd> 기울임
- <kbd>Ctrl</kbd>+<kbd>F</kbd> 찾기, <kbd>Ctrl</kbd>+<kbd>H</kbd> 바꾸기
- <kbd>Ctrl</kbd>+<kbd>\\</kbd> 편집 · 나란히 · 미리 보기 전환
