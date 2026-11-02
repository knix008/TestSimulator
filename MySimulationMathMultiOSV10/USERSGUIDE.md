# MySimulationMath 사용 설명서 / User's Guide

## 1. 시작하기 / Getting started

프로그램을 열면 왼쪽에 **현재 폴더**, 가운데 아래에 하단 패널(**명령 창** · **문제점** · **도움말** 탭), 오른쪽에 **작업 공간**과 **명령 기록**이 있습니다. 가운데 위쪽에는 문서 탭(편집기, 변수, 그림, 모델)이 생기고, 열린 문서가 없으면 그 자리에 **새 스크립트**, **새 모델**, **열기**, **시작 화면** 단추가 나옵니다(명령 창이 닫혀 있으면 **명령 창 열기** 도). 오른쪽 클릭 메뉴는 한 열이며, 데스크톱 앱에서는 메인 창 밖으로 나갈 수 있습니다.

When the program opens, the **Current Folder** is on the left, the bottom panel (**Command Window** · **Problems** · **Help** tabs) at the bottom center and the **Workspace** and **Command History** on the right. Document tabs (editor, variables, figures, models) appear above it; with no document open, that area shows **New Script**, **New Model**, **Open** and **Start Page** buttons (plus **Open Command Window** when it is closed). Right-click menus are one column, and in the desktop app they can extend past the main window.

맨 위 줄은 제목 표시줄이자 도구 모음입니다. 빈 곳을 끌면 창이 움직이고, 두 번 클릭하면 최대화됩니다. 오른쪽 끝에 테마, 언어(KO/EN), 설정, 정보, 창 단추가 있습니다. 상태 표시줄 오른쪽 끝의 점 무늬를 끌면 창 크기가 바뀝니다.

The top row is both the title bar and the toolbar: drag an empty spot to move the window, double-click to maximise. Theme, language (KO/EN), settings, about and the window buttons are at the right. Drag the dots at the right end of the status bar to resize the window.

## 2. 명령 창 / Command Window

```
>> x = 1:5
>> disp(sum(x))
    15
```

| 키 / Key | 동작 / Action |
| --- | --- |
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
- **모델로 변환** (리본 편집기, 또는 오른쪽 클릭 › 스크립트를 모델로 변환…): 스크립트(또는 선택 영역)의 수식으로 **수식으로 모델 만들기** 창을 열고, **새 모델** 로 모델 탭을 만듭니다.

- **New Script** (Ctrl+N), **Open** (Ctrl+O), **Save** (Ctrl+S), **Save As**.
- **Run** (F5) saves and runs the script; **Run Section** (Ctrl+Enter) runs the current `%%` section; **F9** evaluates the selection.
- **Breakpoints**: click left of the line numbers or press F12. When execution stops, the line turns green and the prompt becomes `K>>`. Continue (F5), Step (F10), Step In (F11), Step Out (Shift+F11), Stop.
- **Find/replace** (Ctrl+F), **Go to line** (Ctrl+G), **Comment** (Ctrl+R) / **Uncomment** (Ctrl+T), **Indent** (Ctrl+]) / **Outdent** (Ctrl+[).
- Unsaved tabs show ●; closing or quitting asks to save. Autosave can be turned on in Settings.
- **To Model** (Editor ribbon, or right-click › Convert Script to Model…) opens **Model from equations** filled with the script (or the selection); **New model** builds a model tab.

## 4. 작업 공간과 변수 편집기 / Workspace and Variable Editor

작업 공간에는 변수의 이름, 값, 크기, 클래스가 나옵니다. 머리글을 누르면 정렬되고, 위쪽 칸으로 걸러 볼 수 있습니다. 두 번 클릭하면 **변수 편집기** 탭이 열립니다. 숫자 행렬은 칸을 두 번 클릭하거나 Enter로 고칠 수 있고(`3.5`, `1+2i`, `Inf`, `NaN`), 데이터 바로 다음 빈 행/열에 쓰면 행렬이 커집니다. 고친 내용은 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다. 오른쪽 클릭 메뉴: 열기, 그림 그리기, 이름 복사/바꾸기, 복제, MAT 파일로 저장, 지우기.

The Workspace lists each variable's name, value, size and class. Click a header to sort, type in the box to filter, double-click to open the **Variable Editor**. Numeric matrices can be edited (double-click or Enter; `3.5`, `1+2i`, `Inf`, `NaN`); typing in the empty row or column after the data grows the matrix. Edits can be undone (Ctrl+Z). Right-click: open, plot, copy / rename, duplicate, save as MAT file, clear.

## 5. 현재 폴더 / Current Folder

위쪽 경로 칸에 폴더를 입력하거나 ↑(상위 폴더), 폴더 단추(찾아보기)를 씁니다. 폴더를 두 번 클릭하면 그 폴더로 이동하고, 파일을 두 번 클릭하면:

| 파일 | 동작 |
| --- | --- |
| `.m` 와 텍스트 | 편집기에서 열기 / open in the editor |
| `.msim`, `.smdl` | 모델 편집기에서 열기 / open in the model editor |
| `.mat` | `load` 로 작업 공간에 불러오기 / load into the workspace |
| 그림, 소리, CSV | 변수로 가져오기 / import into a variable |

오른쪽 클릭: 새 스크립트 / 새 모델 / 새 폴더, 이름 바꾸기(F2), 삭제(Del, 파일은 실행 취소로 복구), 실행(F9), 경로 복사.

## 6. 리본 / Ribbon

- **홈 / Home**: 새 스크립트, 새 모델, 열기, 저장, 파일 찾기, 데이터 가져오기, 작업 공간 지우기, 명령 지우기, 실행 취소/다시 실행, 창 켜기/끄기(현재 폴더·작업 공간·명령 기록), 레이아웃(기본 / 명령 창만), 환경 설정.
- **플롯 / Plots**: 작업 공간에서 고른 변수로 plot, area, bar, barh, stairs, stem, scatter, histogram, pie, polarplot, semilogy, surf, mesh, contour, imagesc 를 실행합니다(명령 창에 명령이 보입니다).
- **앱 / Apps**: 데이터 가져오기, 변수 편집기, 플롯 갤러리, 그림 영역, 블록 라이브러리, 파일 찾기, 엔진 다시 시작.
- **편집기 / Editor**: 실행, 섹션 실행, 디버그 단추, 중단점, 찾기, 주석, 들여쓰기, 모델로 변환.
- **시뮬레이션 / Simulation**: 새 모델, 모델 열기, 저장, 인쇄, 라이브러리, 실행(일시 정지 중에는 계속), 일시 정지, 한 단계, 중지 — 상태에 맞는 단추만 켜집니다 (솔버와 정지 시간의 기본값은 설정 › 시뮬레이션).

창이 좁아지면 리본의 글자가 숨고 아이콘만 남습니다. 각 단추 위에 마우스를 올리면 이름과 바로 가기 키가 나옵니다.

## 7. 설정 / Settings

설정 창(Ctrl+, 또는 톱니바퀴)은 크기가 고정된 창입니다. 확인을 눌러야 저장되고 취소하면 미리 보기가 되돌아갑니다. 탭마다 초기화가 있습니다.

| 탭 | 항목 |
| --- | --- |
| 일반 / General | 언어, 테마, 시작 폴더, 열린 파일 다시 열기, 끝낼 때 저장 묻기, `.m` 파일 연결(Windows) |
| 테마 / Theme, 사용자 정의 테마 | 40가지 테마, 내 테마 만들기 · 가져오기 · 내보내기 |
| 명령 창 / Command Window | 글꼴, 크기, 숫자 형식(`format`), compact, 보관 줄 수 |
| 편집기 / Editor | 글꼴, 크기, 탭 크기, 줄 번호, 줄 바꿈, 자동 저장 |
| 그림 / Figures | 기본 렌더러, 격자, 눈금자 |
| 시뮬레이션 / Simulation | 기본 솔버, 정지 시간 |
| 키보드 / Keyboard | Ctrl+Enter 섹션 실행, Tab 자동 완성, Ctrl+C 복사, 바로 가기 키 목록 |

## 8. 그림 / Figures

그림 도구 모음의 **선** 을 끄면 면만 그리고, 3D 곡면은 칸 사이의 색과 빛을 부드럽게 이어 선 무늬가 남지 않습니다. **상자** 는 3D 상자의 모서리 12개를 그리고, 끄면 눈금이 있는 축 모서리와 격자가 그려진 뒷벽의 테두리만 남깁니다(그림 오른쪽 클릭 메뉴에도 있고, 켜짐 상태는 기억됩니다). 상자 모서리 바로 옆의 격자선은 빼고, 바닥 격자는 축 눈금 간격을 따릅니다. 컬러바는 끌어서 옆으로 옮기고 두 번 클릭하면 제자리로 돌아갑니다.

In the figure toolbar, **Edges** off draws faces only, and 3D surfaces blend colour and light across the cells so no line pattern remains. **Box** draws all 12 edges of the 3D box; off keeps only the labelled axis edges and the outline of the gridded back walls (also in the figure's right-click menu; the state is remembered). Grid lines right next to a box edge are left out, and the floor grid follows the axis tick spacing. Drag the colorbar sideways to move it; double-click puts it back.

## 9. 블록 다이어그램 / Block diagrams

- 모델 도구 모음의 **코드** 는 캔버스 옆에 모델의 M 코드를 보여 주고(경계를 끌어 너비 조절), **적용** 하면 열린 모델이 다시 만들어집니다. **스크립트로**(또는 빈 곳 오른쪽 클릭 › 모델을 스크립트로 변환)는 실행하면 모델을 만들고 모델 작업 공간 값을 변수로 정한 뒤 여는 스크립트를 새 탭에 씁니다.
- 블록 오른쪽 클릭 › **입력·출력 그래프**: 블록의 입력 신호와 출력을 보여 주는 Floating Scope(`이름 IO`)를 옆에 두고 실행합니다. 보통 블록이라 저장되고 Ctrl+Z로 되돌리며, 다 보면 삭제합니다.
- **실행** 하면 서브시스템 안의 것까지 모든 스코프 창이 열립니다(8개까지). 실행 단추는 상태를 따릅니다: 멈춤 → 실행·한 단계, 실행 중 → 일시 정지·정지, 일시 정지 → 계속·한 단계·정지.
- 선 모양은 선 오른쪽 클릭이나 블록 속성 › 색에서 직선 · 꺾은 선 · 곡선으로 고릅니다.

- **Code** on the model toolbar shows the model as M code beside the canvas (drag the boundary to resize); **Apply** rebuilds the open model. **To script** (or right-click an empty spot › Convert model to script) writes a script in a new tab that creates the model, sets the model workspace values as variables and opens it.
- Right-click a block › **Graph of inputs and outputs** puts a Floating Scope (`name IO`) beside it showing the block's input signals and outputs, and runs. It is a normal block: saved, undone with Ctrl+Z, deleted when done.
- **Run** opens the window of every scope, subsystems included (up to 8). The run buttons follow the state: stopped → Run, Step; running → Pause, Stop; paused → Continue, Step, Stop.
- Pick the line shape (straight, elbow, curve) by right-clicking a line or in Block Properties › Colour.

## 10. 웹 판 / Web version

`npm run web` 은 화면을 빌드하고 웹 서버를 시작합니다(`--root 폴더` 로 작업 폴더 지정). 웹 판은 작업 폴더 밖의 파일을 볼 수 없고 `system()` 이 동작하지 않습니다. 파일 열기·저장은 화면 안의 파일 선택 창을 씁니다.

`npm run web` builds the page and starts the web host (`--root folder` sets the work folder). The web version cannot see files outside the work folder and `system()` does not work; Open / Save use the in-page file chooser.

## 11. 터미널 / Terminal

```bash
npm run msm                         # >> 프롬프트, exit 로 끝냄
npm run msm -- -r "x = magic(3)"    # 코드 실행
npm run msm -- --cd work run_me.m   # 폴더를 바꾸고 스크립트 실행
```
