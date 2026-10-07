# MyWeather 사용 설명서

MyWeather 1.0.0은 선택한 나라와 도시의 일간, 주간, 월간 날씨를 보여 줍니다. 한국어와 영어를 지원합니다.

English notes are included in each section.

## 설치

Windows에서는 프로젝트 루트의 `MyWeather-Setup-1.0.0.exe`를 실행합니다. 설치 파일의 아이콘은 프로그램 아이콘과 같은 `assets/icon.ico`입니다.

1. 설치 언어를 고릅니다. English 또는 한국어입니다.
2. 이미 설치된 MyWeather가 있으면 프로그램 폴더와 이전 바로가기를 완전히 지운 뒤 다시 설치합니다.
3. 이전에 저장한 설정이나 날씨 파일이 있으면 삭제할지 물어봅니다. 아니오를 고르면 그 데이터는 남습니다.
4. 바탕화면 바로가기와 시작 메뉴 바로가기를 각각 선택할 수 있습니다. 둘 다 만들지 않을 수도 있습니다. 만들어지는 바로가기는 프로그램 아이콘 파일을 그대로 사용합니다.

Linux와 macOS의 `installer/linux/install.sh`, `installer/macos/install.sh`도 같은 질문을 합니다. 언어, 기존 설치 삭제, 사용자 데이터 삭제, 바탕화면 바로가기, 시작 메뉴에 해당하는 바로가기를 사용자가 결정합니다.

The Windows setup file asks for the language first. An existing installation is removed completely and installed again. Saved data is deleted only if you answer yes. Desktop and Start menu shortcuts are separate checkboxes and use the program icon.

## 실행

프로그램을 실행하면 창은 열리지만 작업 표시줄에는 아이콘이 나타나지 않습니다. 아이콘은 시스템 트레이에 있습니다.

트레이 아이콘을 누르거나 마우스 오른쪽 단추로 누르면 메뉴가 열립니다. 맨 위의 창 표시는 프로그램 창만 다시 엽니다. 날씨, 파일, 편집은 하위 메뉴이고, 설정, 프로그램 정보, 종료는 바로 표시됩니다. 각 항목에는 아이콘이 있습니다.

- 날씨: 새로고침, 일간 예보, 주간 예보, 월간 예보
- 파일: 새로 만들기, 열기, 저장, 다른 이름으로 저장, 인쇄
- 편집: 실행 취소, 다시 실행, 복사, 붙여넣기

The window stays off the taskbar. Click the tray icon to open these menus. Every entry has an icon. English labels are used when the app language is English.

## 날씨 보기

창 위쪽의 세 단추는 일간, 주간, 월간 예보를 엽니다. 단추에 마우스를 올리면 툴팁이 보입니다. 예보 칸에는 테두리가 없고, 마우스를 올리면 조금 떠 보입니다.

위치는 설정에서 나라와 도시로 고르거나, 위도와 경도를 직접 넣을 수 있습니다. 위치 탭이 하나일 때는 도시 이름 탭을 숨기고, 도시 이름은 날씨 그림 쪽에 둡니다. 위치를 더 추가하면 탭 이름은 사용자가 붙인 이름이나 번호입니다.

## 설정

설정은 일반, 모양, 바탕 그림, 글꼴, 데이터, 최근 파일로 나뉩니다.

배경 투명도는 0부터 100까지입니다. 0은 배경이 완전히 불투명합니다. 100이어도 배경은 약 25% 불투명도로 남아 창이 사라지지 않습니다. 글자는 투명해지지 않습니다.

테마는 라이트 20개, 다크 20개, 사용자 정의입니다. 바탕 그림은 별도의 그림 투명도를 가집니다. 그림 투명도 0은 그림을 숨깁니다. 이것은 창 배경 투명도와 다른 값입니다.

Background transparency runs from 0 through 100. At 100 the window background stays visible. Wallpaper opacity is a different control and may be 0.

## 파일

날씨 문서는 `.myweather` 파일입니다. 이 파일의 아이콘은 프로그램 아이콘과 다른 문서 아이콘입니다. 최근 파일은 설정과 창 메뉴에서 다시 열 수 있습니다.

창을 닫거나 트레이에서 종료를 고르면, 저장하지 않은 내용이 있을 때 저장, 버리기, 취소를 묻습니다.
