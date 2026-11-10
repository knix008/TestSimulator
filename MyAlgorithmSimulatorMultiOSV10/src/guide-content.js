// The user's guide. Each chapter is shown in the contents list and in the page.

const chapter = (id, koTitle, enTitle, ko, en) => ({ id, title: { ko: koTitle, en: enTitle }, html: { ko, en } });

export const GUIDE = [
  chapter('start', '시작하기', 'Getting started', `
    <p>MyAlgorithmSimulator는 알고리즘이 한 단계씩 어떻게 움직이는지 그림으로 보고, 같은 알고리즘을 여러 프로그래밍 언어로 읽어 보고 실행해 보는 학습 프로그램입니다.</p>
    <p>처음 열면 시작 화면이 나옵니다. 움직이는 배경 위에서 알고리즘을 고르거나, <b>이어서 학습</b>으로 최근에 보던 알고리즘을 다시 엽니다.</p>
    <ul>
      <li><b>설정</b>은 재생 속도, 시작 화면 배경, 배경 속도와 투명도를 바꿉니다.</li>
      <li><b>프로그램 정보</b>는 버전과 만든 이를 보여 줍니다.</li>
      <li><b>사용 설명서</b>는 지금 보고 있는 이 창을 엽니다.</li>
    </ul>`, `
    <p>MyAlgorithmSimulator shows how an algorithm moves, one step at a time, and lets you read and run the same algorithm in several programming languages.</p>
    <p>The program opens on the start screen. Pick an algorithm over the moving background, or choose <b>Continue</b> to reopen the one you looked at last.</p>
    <ul>
      <li><b>Settings</b> changes the playback speed, the start-screen background, and that background's speed and opacity.</li>
      <li><b>About</b> shows the version and the author.</li>
      <li><b>User's guide</b> opens this window.</li>
    </ul>`),
  chapter('layout', '화면 구성', 'The window', `
    <p>알고리즘을 열면 창이 네 부분으로 나뉩니다.</p>
    <ul>
      <li><b>왼쪽</b>은 알고리즘 목록과 입력입니다. 목록은 정렬, 탐색, 그래프처럼 종류별로 묶여 있고, 각 알고리즘에 자기 아이콘이 있습니다.</li>
      <li><b>가운데</b>는 지금 단계의 그림입니다. 비교 중인 값, 교환, 방문한 정점, 경로가 색으로 구분됩니다.</li>
      <li><b>아래</b>는 프로그램 창입니다. <b>프로그램</b> 탭은 소스 코드, <b>의사코드</b> 탭은 그 단계의 문장입니다. 그림이 바뀌면 해당하는 줄이 함께 강조됩니다.</li>
      <li><b>오른쪽</b>은 설명, 그 단계의 변수, 코드를 실행한 결과입니다.</li>
    </ul>
    <p>메뉴의 <b>보기</b>에서 왼쪽 패널, 오른쪽 패널, 프로그램 창을 숨기거나 다시 보일 수 있습니다.</p>`, `
    <p>Opening an algorithm splits the window into four parts.</p>
    <ul>
      <li><b>Left</b> is the algorithm list and the input. Algorithms are grouped by kind, and each one has its own icon.</li>
      <li><b>Centre</b> is the picture of the current step. Comparisons, swaps, visited vertices and paths each have a colour.</li>
      <li><b>Bottom</b> is the program panel. <b>Program</b> is the source code and <b>Pseudocode</b> is the statement for this step. The matching line is highlighted as the picture changes.</li>
      <li><b>Right</b> is the explanation, the variables at this step, and the result of running the code.</li>
    </ul>
    <p>The <b>View</b> menu hides or shows the left panel, the right panel and the program panel.</p>`),
  chapter('steps', '단계로 보기', 'Stepping through', `
    <p>도구 모음으로 알고리즘을 한 단계씩, 또는 자동으로 진행합니다.</p>
    <ul>
      <li><b>이전</b>과 <b>단계 실행</b>은 한 단계 뒤와 앞으로 이동합니다.</li>
      <li><b>자동 실행</b>은 단계가 끝날 때까지 그림을 넘깁니다. 한 번 더 누르면 멈춥니다.</li>
      <li><b>처음</b>은 첫 단계로 돌아갑니다.</li>
      <li>슬라이더는 원하는 단계로 바로 이동합니다.</li>
      <li>속도 메뉴는 0.25배에서 8배까지입니다.</li>
    </ul>
    <p>단계가 바뀔 때마다 가운데 그림, 아래쪽 문장, 소스에서 표시된 줄, 오른쪽 변수 값이 같은 단계를 가리킵니다. 소스에 단계 표시가 있는 줄만 빛납니다. 표시가 없는 알고리즘은 문장 안내만 바뀝니다.</p>`, `
    <p>The toolbar moves the algorithm one step at a time, or plays it automatically.</p>
    <ul>
      <li><b>Back</b> and <b>Step</b> move one step backward and forward.</li>
      <li><b>Auto run</b> keeps turning the picture until the end. Click it again to pause.</li>
      <li><b>Start</b> returns to the first step.</li>
      <li>The slider jumps straight to a step.</li>
      <li>The speed menu runs from 0.25× to 8×.</li>
    </ul>
    <p>On every step the picture, the statement under it, the marked source line and the variables on the right all refer to the same step. Only a source line that carries a step marker lights up. Without a marker, the statement still changes.</p>`),
  chapter('code', '코드와 샘플', 'Code and samples', `
    <p>프로그램 창에서 언어를 고르면 그 언어의 샘플이 열립니다. 언어는 C, C++, Java, Python, Go, Rust, JavaScript입니다.</p>
    <p>샘플은 왼쪽 입력 상자의 내용을 표준 입력으로 읽고, 결과를 표준 출력으로 씁니다. 코드를 고쳐 보고 <b>샘플</b>로 처음 코드를 다시 불러올 수 있습니다. <b>파일</b> 메뉴에서 코드를 저장하거나 기존 파일을 엽니다.</p>
    <p>Java 프로그램의 클래스 이름은 <code>Main</code>이어야 합니다.</p>`, `
    <p>Choosing a language in the program panel opens that language's sample. The languages are C, C++, Java, Python, Go, Rust and JavaScript.</p>
    <p>A sample reads the left-hand input box as standard input and writes its result to standard output. Edit the code, and use <b>Sample</b> to load the original again. The <b>File</b> menu saves the code or opens an existing file.</p>
    <p>A Java program's class must be named <code>Main</code>.</p>`),
  chapter('run', '코드 실행', 'Running code', `
    <p><b>실행</b>은 지금 편집 중인 코드를 컴파일하고 실행한 뒤, 오른쪽 <b>실행 결과</b>에 출력합니다. 실행 시간은 15초를 넘기면 멈춥니다.</p>
    <p>웹 브라우저에서는 JavaScript만 실행됩니다. C, C++, Java, Python, Go, Rust는 데스크톱 앱에서 실행됩니다. 컴파일러가 없으면 <b>개발 도구 설치</b>에서 설치할 수 있습니다. Windows는 winget, macOS는 Homebrew, Linux는 apt 또는 dnf를 사용합니다.</p>`, `
    <p><b>Run</b> compiles and runs the code you are editing, then shows the output on the right. A run stops if it takes longer than 15 seconds.</p>
    <p>The web browser runs JavaScript only. C, C++, Java, Python, Go and Rust run in the desktop app. If a compiler is missing, <b>Install developer tools</b> can install it: winget on Windows, Homebrew on macOS, and apt or dnf on Linux.</p>`),
  chapter('input', '입력', 'Input', `
    <p>왼쪽 아래 입력 상자는 그 알고리즘이 받는 값입니다. 정렬은 정수 목록, 문자열 알고리즘은 글, 그래프는 간선, A*는 격자입니다.</p>
    <ul>
      <li><b>적용</b>은 고친 입력으로 단계를 처음부터 다시 만듭니다.</li>
      <li><b>무작위</b>는 새 입력을 만듭니다.</li>
      <li>A* 격자는 그림을 클릭해 벽을 넣거나 지울 수 있습니다. <code>S</code>는 시작, <code>G</code>는 목표, <code>#</code>는 벽입니다.</li>
    </ul>
    <p>입력 형식이 맞지 않으면 상자 아래에 이유가 표시되고 그림은 이전 단계를 유지합니다.</p>`, `
    <p>The box at the lower left is the value the algorithm receives. Sorting takes a list of integers, string algorithms take text, graphs take edges, and A* takes a grid.</p>
    <ul>
      <li><b>Apply</b> rebuilds the steps from the edited input.</li>
      <li><b>Random</b> makes a new input.</li>
      <li>On an A* grid, click the picture to add or remove a wall. <code>S</code> is the start, <code>G</code> is the goal and <code>#</code> is a wall.</li>
    </ul>
    <p>If the input does not match the expected form, the reason appears under the box and the picture keeps the previous steps.</p>`),
  chapter('look', '테마, 배경, 언어', 'Theme, background and language', `
    <p>도구 모음의 <b>테마</b> 버튼은 지금 테마 이름을 보여 주고, 누르면 밝은 테마와 어두운 테마 목록이 열립니다. 고른 테마는 이 설명서 창에도 그대로 적용됩니다.</p>
    <p>시작 화면의 배경은 스물한 가지이고, 막대·트리·그래프·격자처럼 알고리즘이 움직이는 그림입니다. 이름을 고르거나 <b>배경 바꾸기</b>로 다른 배경을 고르고, 속도와 투명도는 슬라이드와 감소·증가 버튼으로 0~100% 사이에서 바꿉니다. 속도의 기본값은 20%입니다. <b>무작위 선택</b>을 켜면 <b>섞기 간격</b>마다 다른 배경으로 바뀝니다. 간격은 5초에서 120초입니다.</p>
    <p>언어 버튼은 국기로 표시됩니다. 화면이 한국어이면 영국 국기, 영어이면 한국 국기입니다. 누르면 메뉴와 설명이 그 언어로 바뀝니다. 이 창의 국기 버튼은 설명서의 언어만 바꿉니다.</p>`, `
    <p>The <b>Theme</b> button on the toolbar shows the current theme name and opens the light and dark themes. The theme you pick is applied to this guide window as well.</p>
    <p>The start screen has twenty-one backgrounds, and each one is a picture of an algorithm moving: bars, a tree, a graph, a grid and the rest. Pick a name, or use <b>Change background</b>, and set the speed and opacity from 0 to 100% with the slider or the decrease and increase buttons. The speed starts at 20%. Turn on <b>Random</b> and the background changes every <b>shuffle interval</b>, from 5 to 120 seconds.</p>
    <p>The language button is a flag. A Korean screen shows the UK flag, and an English screen shows the Korean flag. Clicking it switches the menus and the explanations. The flag in this window changes only the guide.</p>`),
  chapter('keys', '단축키', 'Shortcuts', `
    <table>
      <tr><th>키</th><th>동작</th></tr>
      <tr><td>Space</td><td>자동 실행 / 일시정지</td></tr>
      <tr><td>→</td><td>한 단계 앞으로</td></tr>
      <tr><td>←</td><td>한 단계 뒤로</td></tr>
      <tr><td>Home</td><td>첫 단계</td></tr>
      <tr><td>R</td><td>무작위 입력</td></tr>
      <tr><td>Ctrl+Enter</td><td>입력 적용</td></tr>
    </table>`, `
    <table>
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td>Space</td><td>Auto run / pause</td></tr>
      <tr><td>→</td><td>One step forward</td></tr>
      <tr><td>←</td><td>One step back</td></tr>
      <tr><td>Home</td><td>First step</td></tr>
      <tr><td>R</td><td>Random input</td></tr>
      <tr><td>Ctrl+Enter</td><td>Apply the input</td></tr>
    </table>`),
];
