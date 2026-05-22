# CommandCenterGTKv10 (FileMaster)

FileMasterWinV10를 참고하여 GTK3로 작성한 Linux용 듀얼 패널 파일 관리자입니다.

## 특징

- 좌/우 듀얼 패널 파일 브라우저
- 패널 간 복사(F5) / 이동(F6)
- 폴더 트리 드롭다운, 빠른 경로(홈, /, /tmp, 마운트)
- 파일 미리보기 (이미지, 텍스트, 메타정보)
- 즐겨찾기 (JSON 저장)
- 세션 복원 (마지막 경로, 분할 위치)
- 재귀 파일 검색 (F9)
- 새 폴더/파일, 이름 바꾸기(F2), 삭제(F8)
- 클립보드 복사/붙여넣기 (URI 목록)
- 한국어 UI

## 의존성

- GTK 3.x (`libgtk-3-dev`)
- pkg-config, GCC
- GLib/GIO (GTK와 함께 설치)

## 빌드

```sh
make                 # 의존성 검사 → 누락 시 자동 설치 → 빌드
./CommandCenterGTKv10
# 또는
make run
```

실행 파일은 프로젝트 루트의 `./CommandCenterGTKv10` 에 생성됩니다. 오브젝트 파일만 `build/` 에 둡니다.

```sh
make check-deps      # 의존성만 검사
make install-deps    # 누락 패키지 수동 설치
make clean           # build/ 및 실행 파일 삭제
```

`make` 시 의존성이 없으면 apt/dnf/pacman으로 자동 설치를 시도합니다. 끄려면 `CC_AUTO_INSTALL=0 make`.

## 설정 파일

`~/.config/CommandCenterGTKv10/`

- `session.json` — 좌/우 패널 경로, 분할 위치
- `bookmarks.json` — 즐겨찾기 목록

## 단축키

| 키 | 동작 |
|----|------|
| F2 | 이름 바꾸기 |
| F5 | 반대 패널로 복사 |
| F6 | 반대 패널로 이동 |
| F7 | 새 폴더 |
| F8 | 삭제 |
| F9 | 검색 |

## 라이선스

MIT License
