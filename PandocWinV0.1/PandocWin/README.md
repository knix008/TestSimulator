# PandocWin

Pandoc을 위한 Windows GUI 래퍼 애플리케이션입니다. 다양한 문서 형식 간의 변환을 간편하게 수행할 수 있습니다.

## 요구 사항

- Windows OS
- [.NET Framework 4.7.2](https://dotnet.microsoft.com/download/dotnet-framework/net472)
- [Pandoc](https://pandoc.org/installing.html) (`C:\Program Files\Pandoc\pandoc.exe`)
- PDF 변환 시: [XeLaTeX](https://miktex.org/) (MiKTeX 또는 TeX Live)

## 지원 입력 형식

| 형식 | 확장자 |
|------|--------|
| Markdown | `.md`, `.markdown` |
| Plain Text | `.txt` |
| reStructuredText | `.rst` |
| Word | `.docx`, `.doc` |
| HTML | `.html` |
| ODT | `.odt` |
| LaTeX | `.tex`, `.latex` |
| EPUB | `.epub`, `.mobi`, `.fb2` |
| PowerPoint | `.pptx` |
| RTF | `.rtf` |
| Org-mode | `.org` |
| AsciiDoc | `.asciidoc` |
| CSV / JSON / XML | `.csv`, `.json`, `.xml` |
| JATS | `.jats` |
| PDF | `.pdf` |

## 지원 출력 형식

- **Word** (`.docx`)
- **HTML** (`.html`)
- **ODT** (`.odt`)
- **LaTeX** (`.tex`)
- **EPUB** (`.epub`)
- **PDF** (`.pdf`) — XeLaTeX 엔진 사용

## 사용 방법

1. 애플리케이션을 실행합니다.
2. **파일 선택** 버튼을 클릭하여 변환할 입력 파일을 선택합니다.
3. 원하는 출력 형식을 라디오 버튼으로 선택합니다.
4. **변환** 버튼을 클릭합니다.
5. 변환된 파일은 입력 파일과 동일한 디렉토리에 저장됩니다.

## 빌드

Visual Studio 2017 이상에서 `PandocWin.sln`을 열고 빌드합니다.

```
Configuration: Release | AnyCPU
Target Framework: .NET Framework 4.7.2
Output: bin\Release\PandocWin.exe
```

## 주의 사항

- Pandoc이 `C:\Program Files\Pandoc\pandoc.exe` 경로에 설치되어 있어야 합니다.
- PDF 출력은 XeLaTeX(`xelatex`)이 설치된 경우에만 동작합니다.
- 출력 파일은 입력 파일과 같은 위치에 생성되며, 동일한 이름으로 확장자만 변경됩니다.
