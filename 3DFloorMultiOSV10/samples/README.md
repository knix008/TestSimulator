# Sample images (2D floor plans only)

프로젝트 루트 `samples/` 에 위치합니다.  
비교 스크린샷(`_source/`)에서 **3D 변환 영역을 잘라낸 2D 도면만** 사용합니다.

| 파일 | 설명 |
|---|---|
| `example1.png` | 주택 평면도 (좌측 2D만, 우측 3D 제거) |
| `example2.png` | 아파트 평면도 (좌측 2D만, 우측 3D 제거) |
| `handDrawn.png` | 손그림 주석 평면도 (상단 2D만, 하단 3D 제거) |

다시 자르기:

```bash
npm run samples
```

원본 비교 스크린샷은 `samples/_source/`에 보관합니다.  
합성 테스트용 도면이 필요하면 `npm run samples:synthetic`을 사용하세요.
