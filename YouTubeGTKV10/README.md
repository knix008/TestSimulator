# YouTube GTK Player Downloader (C)

GTK4(C)로 만든 간단한 YouTube 링크 재생/다운로드 앱입니다.

## 기능

- YouTube 링크 입력
- `mpv`로 재생
- `yt-dlp`로 다운로드
- 다운로드 파일 저장 위치: `./downloads`

## 필수 패키지

- GTK4 개발 패키지
- `mpv`
- `yt-dlp`
- `pkg-config`
- `gcc` 또는 `clang`

Ubuntu 계열 예시:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libgtk-4-dev mpv yt-dlp
```

## 빌드/실행

```bash
make
./youtube
```

또는:

```bash
make run
```
