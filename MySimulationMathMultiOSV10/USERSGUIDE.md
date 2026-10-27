# MySimulationMath 사용 설명서 / User's Guide

## 1. 시작하기 / Getting started

프로그램을 열면 왼쪽에 **현재 폴더**, 가운데에 **명령 창**, 오른쪽에 **작업 공간**과 **명령 기록**이 있습니다. 파일을 열면 가운데 위쪽에 문서 탭(편집기, 변수, 그림, 모델)이 생기고 명령 창은 그 아래로 내려갑니다.

When the program opens, the **Current Folder** is on the left, the **Command Window** in the middle and the **Workspace** and **Command History** on the right. Opening a file adds document tabs (editor, variables, figures, models) above the Command Window.

맨 위 줄은 제목 표시줄이자 도구 모음입니다. 빈 곳을 끌면 창이 움직이고, 두 번 클릭하면 최대화됩니다. 오른쪽 끝에 테마, 언어(KO/EN), 설정, 정보, 창 단추가 있습니다. 상태 표시줄 오른쪽 끝의 점 무늬를 끌면 창 크기가 바뀝니다.

The top row is both the title bar and the toolbar: drag an empty spot to move the window, double-click to maximise. Theme, language (KO/EN), settings, about and the window buttons are at the right. Drag the dots at the right end of the status bar to resize the window.

## 2. 명령 창 / Command Window

```
>> x = 1:5
>> disp(sum(x))
    15
```

| 키 / Key | 동작 / Action |
|---|---|
| Enter | 실행 (for, if 같은 블록이 열려 있으면 줄 바꿈) / run (new line while a block is open) |
| Shift+Enter | 줄 바꿈 / new line |
| ↑ / ↓ | 명령 기록 (입력한 글자로 시작하는 것만) / history (filtered by what you typed) |
| Tab | 자동 완성 / completion |
| Ctrl+C | 선택이 있으면 복사, 없으면 실행 중단 / copy a selection, otherwise interrupt |
| Esc | 입력 지우기 / clear the input |

오류는 빨간색으로 나오고, `파일.m:줄` 이나 `(line 12)` 부분을 누르면 편집기에서 그 줄이 열립니다. 실행 중에 입력한 명령은 차례를 기다렸다가 실행됩니다. `input()` 이 값을 물으면 입력하고 Enter를 누르세요. `clc` 는 명령 창을 지웁니다.

Errors are red; click `file.m:line` or `(line 12)` to open that line in the editor. Commands typed while the engine is busy wait their turn. When `input()` asks, type the value and press Enter. `clc` clears the window.

## 3. 편집기 / Editor

- **새 스크립트** (Ctrl+N), **열기** (Ctrl+O), **저장** (Ctrl+S), **다른 이름으로 저장**.
- **실행** (F5): 저장한 뒤 스크립트를 실행합니다. **섹션 실행** (Ctrl+Enter): `%%` 로 나눈 현재 구간만 실행합니다. **F9**: 선택한 코드를 실행합니다.
- **중단점**: 줄 번호 왼쪽을 누르거나 F12. 멈추면 초록 줄이 표시되고 명령 창 프롬프트가 `K>>` 로 바뀝니다. 계속(F5), 한 단계(F10), 안으로(F11), 밖으로(Shift+F11), 중지.
- **찾기/바꾸기** (Ctrl+F), **줄로 이동** (Ctrl+G), **주석** (Ctrl+R) / **주석 해제** (Ctrl+T), **들여쓰기** (Ctrl+]) / **내어쓰기** (Ctrl+[).
- 저장하지 않은 탭에는 ● 표시가 붙고, 닫거나 끝낼 때 저장할지 묻습니다. 설정에서 자동 저장을 켤 수 있습니다.

- **New Script** (Ctrl+N), **Open** (Ctrl+O), **Save** (Ctrl+S), **Save As**.
- **Run** (F5) saves and runs the script; **Run Section** (Ctrl+Enter) runs the current `%%` section; **F9** evaluates the selection.
- **Breakpoints**: click left of the line numbers or press F12. When execution stops, the line turns green and the prompt becomes `K>>`. Continue (F5), Step (F10), Step In (F11), Step Out (Shift+F11), Stop.
- **Find/replace** (Ctrl+F), **Go to line** (Ctrl+G), **Comment** (Ctrl+R) / **Uncomment** (Ctrl+T), **Indent** (Ctrl+]) / **Outdent** (Ctrl+[).
- Unsaved tabs show ●; closing or quitting asks to save. Autosave can be turned on in Settings.

## 4. 작업 공간과 변수 편집기 / Workspace and Variable Editor

작업 공간에는 변수의 이름, 값, 크기, 클래스가 나옵니다. 머리글을 누르면 정렬되고, 위쪽 칸으로 걸러 볼 수 있습니다. 두 번 클릭하면 **변수 편집기** 탭이 열립니다. 숫자 행렬은 칸을 두 번 클릭하거나 Enter로 고칠 수 있고(`3.5`, `1+2i`, `Inf`, `NaN`), 데이터 바로 다음 빈 행/열에 쓰면 행렬이 커집니다. 고친 내용은 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다. 오른쪽 클릭 메뉴: 열기, 그림 그리기, 이름 복사/바꾸기, 복제, MAT 파일로 저장, 지우기.

The Workspace lists each variable's name, value, size and class. Click a header to sort, type in the box to filter, double-click to open the **Variable Editor**. Numeric matrices can be edited (double-click or Enter; `3.5`, `1+2i`, `Inf`, `NaN`); typing in the empty row or column after the data grows the matrix. Edits can be undone (Ctrl+Z). Right-click: open, plot, copy / rename, duplicate, save as MAT file, clear.

## 5. 현재 폴더 / Current Folder

위쪽 경로 칸에 폴더를 입력하거나 ↑(상위 폴더), 폴더 단추(찾아보기)를 씁니다. 폴더를 두 번 클릭하면 그 폴더로 이동하고, 파일을 두 번 클릭하면:

| 파일 | 동작 |
|---|---|
| `.m` 와 텍스트 | 편집기에서 열기 / open in the editor |
| `.msim`, `.smdl` | 모델 편집기에서 열기 / open in the model editor |
| `.mat` | `load` 로 작업 공간에 불러오기 / load into the workspace |
| 그림, 소리, CSV | 변수로 가져오기 / import into a variable |

오른쪽 클릭: 새 스크립트 / 새 모델 / 새 폴더, 이름 바꾸기(F2), 삭제(Del, 파일은 실행 취소로 복구), 실행(F9), 경로 복사.

## 6. 리본 / Ribbon

- **홈 / Home**: 새 스크립트, 새 모델, 열기, 저장, 파일 찾기, 데이터 가져오기, 작업 공간 지우기, 명령 지우기, 실행 취소/다시 실행, 창 켜기/끄기(현재 폴더·작업 공간·명령 기록), 레이아웃(기본 / 명령 창만), 환경 설정.
- **플롯 / Plots**: 작업 공간에서 고른 변수로 plot, area, bar, barh, stairs, stem, scatter, histogram, pie, polarplot, semilogy, surf, mesh, contour, imagesc 를 실행합니다(명령 창에 명령이 보입니다).
- **앱 / Apps**: 데이터 가져오기, 변수 편집기, 플롯 갤러리, 그림 영역, 블록 라이브러리, 파일 찾기, 엔진 다시 시작.
- **편집기 / Editor**: 실행, 섹션 실행, 디버그 단추, 중단점, 찾기, 주석, 들여쓰기.
- **시뮬레이션 / Simulation**: 새 모델, 모델 열기, 저장, 라이브러리, 실행, 중지 (솔버와 정지 시간의 기본값은 설정 › 시뮬레이션).

창이 좁아지면 리본의 글자가 숨고 아이콘만 남습니다. 각 단추 위에 마우스를 올리면 이름과 바로 가기 키가 나옵니다.

## 7. 설정 / Settings

설정 창(Ctrl+, 또는 톱니바퀴)은 크기가 고정된 창입니다. 확인을 눌러야 저장되고 취소하면 미리 보기가 되돌아갑니다. 탭마다 초기화가 있습니다.

| 탭 | 항목 |
|---|---|
| 일반 / General | 언어, 테마, 시작 폴더, 열린 파일 다시 열기, 끝낼 때 저장 묻기, `.m` 파일 연결(Windows) |
| 테마 / Theme, 사용자 정의 테마 | 40가지 테마, 내 테마 만들기 · 가져오기 · 내보내기 |
| 명령 창 / Command Window | 글꼴, 크기, 숫자 형식(`format`), compact, 보관 줄 수 |
| 편집기 / Editor | 글꼴, 크기, 탭 크기, 줄 번호, 줄 바꿈, 자동 저장 |
| 그림 / Figures | 기본 렌더러, 격자, 눈금자 |
| 시뮬레이션 / Simulation | 기본 솔버, 정지 시간 |
| 키보드 / Keyboard | Ctrl+Enter 섹션 실행, Tab 자동 완성, Ctrl+C 복사, 바로 가기 키 목록 |

## 8. 웹 판 / Web version

`npm run web` 은 화면을 빌드하고 웹 서버를 시작합니다(`--root 폴더` 로 작업 폴더 지정). 웹 판은 작업 폴더 밖의 파일을 볼 수 없고 `system()` 이 동작하지 않습니다. 파일 열기·저장은 화면 안의 파일 선택 창을 씁니다.

`npm run web` builds the page and starts the web host (`--root folder` sets the work folder). The web version cannot see files outside the work folder and `system()` does not work; Open / Save use the in-page file chooser.

## 9. 터미널 / Terminal

```bash
npm run msm                         # >> 프롬프트, exit 로 끝냄
npm run msm -- -r "x = magic(3)"    # 코드 실행
npm run msm -- --cd work run_me.m   # 폴더를 바꾸고 스크립트 실행
```
