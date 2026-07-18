# xorriso binaries

Place a platform-native `xorriso` binary in the matching folder, **or** install via a package manager (the app also auto-detects common install paths).

| Platform | Path |
|----------|------|
| Windows  | `vendor/xorriso/win32/xorriso.exe` |
| macOS    | `vendor/xorriso/darwin/xorriso` |
| Linux    | `vendor/xorriso/linux/xorriso` |

## Windows (recommended: MSYS2)

MSYS2가 있으면:

```bash
# MSYS2 터미널에서
pacman -S xorriso
```

설치 후 보통 `C:\msys64\usr\bin\xorriso.exe` 에 생기며, ISO Maker가 자동으로 찾습니다.

또는 해당 exe를 `vendor/xorriso/win32/xorriso.exe` 로 복사해도 됩니다.

## macOS

```bash
brew install xorriso
```

## Linux

```bash
sudo apt install xorriso
# 또는
sudo dnf install xorriso
```
