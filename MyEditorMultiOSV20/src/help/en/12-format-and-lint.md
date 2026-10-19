# Format and lint

**Format document** tidies code by fixing indentation · line breaks · spacing according to the language's conventions, and **code check (lint)** finds and marks syntax errors and suspicious code. Both use external tools for each language, and the tools you need can be installed from within the app.

## Formatting a document

Run it with any of the following. The **whole** document being edited is formatted.

- **Shift+Alt+F**
- **Edit › Format document**
- The **Format document** button on the toolbar
- The right-click menu of the editing area or the tab › Format document

After formatting, the cursor stays on the same line. The result is shown in the status bar as "Formatted with tool", "Already formatted (tool)", or on failure "Formatting failed (tool)" with the reason. When the document is empty, formatting is off for its language, or it is already formatted, the button and menu item are greyed out (hovering shows why). Formatting can also be undone with Ctrl+Z.

With **Format on save** (Settings › Formatting, off by default) turned on, the document is formatted first every time you save.

## Choosing a formatter

To the right of the Format document button on the toolbar is **the name of the formatter used for this document**. Clicking it shows a list for choosing that language's formatter; the Settings › Formatting tab sets all languages at once.

![Formatting settings](images/settings-format.png)
*Figure: Settings › Formatting — choosing a formatter for each language*

For each language you can choose:

- **Auto (tool name)**: the first tool installed (the bundled Prettier included). If there is none, only the editor's indentation is fixed.
- **Each tool**: tools that are not installed are marked "not installed · installed automatically when formatting" or "not installed · manual install".
- **Editor indentation only**: re-aligns just the indentation using the editor's grammar rules.
- **Off**: turns formatting off for that language.

| Language | Formatters |
|---|---|
| JavaScript · TypeScript · JSX · TSX · JSON · HTML · CSS · SCSS · LESS · Markdown · YAML · Vue | **Prettier (bundled)** — nothing needs to be installed. Prettier from the project or PATH can also be chosen |
| JSON · XML | Built-in JSON formatter · Built-in XML formatter too |
| Python | black · ruff format · autopep8 · yapf |
| C · C++ · C# · Objective-C | clang-format |
| Java | google-java-format · clang-format |
| Go | gofmt · goimports |
| Rust | rustfmt |
| Shell | shfmt |
| PowerShell | PSScriptAnalyzer (Invoke-Formatter) |
| SQL (including MySQL · PostgreSQL · SQLite) | sql-formatter |
| XML | xmllint |
| Ruby | rubocop · rufo |
| PHP | php-cs-fixer |
| Lua | stylua |
| Dart | dart format |
| Kotlin | ktlint |
| Swift | swiftformat |

- The bundled Prettier follows a `.prettierrc` next to the file, and uses the editor settings for tab size and tabs/spaces.
- External tools are looked up first in the project's `node_modules/.bin`, then on PATH (and `~/.cargo/bin`, `~/go/bin`, Python modules).
- If a tool you just installed still shows "not installed", press **Look again** under Settings › Formatting, or add it to PATH and restart the app.

## Installing tools

Formatters that are not installed can be installed right from the app.

- **Installed automatically when formatting**: choose a tool marked "not installed · installed automatically when formatting", then press Format document, and it asks "Download and install it now?" Pressing **Install** shows a progress window, and formatting runs as soon as it finishes.
- **Installing from Settings**: the **⬇ (Install)** or **↻ (Reinstall)** button next to each language under Settings › Formatting. For a tool that is already installed, you choose **Remove and reinstall / Install over it / Cancel**.

The install progress window shows four steps as a checklist — **Check the package manager → Download the package → Install → Ready to use** — and can expand the command being run and **Show install log** (live output). You can cancel, and if it fails you can **Try again**.

| Tool | Installed with |
|---|---|
| Prettier · sql-formatter | npm — installed inside the app's settings folder (tools/node) |
| black · ruff · autopep8 · yapf · clang-format | pip (`pip install --user`, run as `python -m …`) |
| stylua | cargo |
| shfmt · goimports | go |
| rubocop · rufo | gem |
| rustfmt | rustup |
| PSScriptAnalyzer | PowerShell (Install-Module) |
| gofmt · dart · ktlint · swiftformat · php-cs-fixer · google-java-format · xmllint | Manual install needed — instructions are shown |

If a required package manager (Python, Node.js and so on) is missing, you are told what is needed, and may be asked whether to install it first with the official installer. Once that finishes, the tool installation continues.

## Code check (lint)

A moment (about 0.7 seconds) after you open or change a document, the language's checker runs in the **background** (as a separate process) to find problems. Typing is never blocked, and results appear as soon as they are ready. The unsaved content is checked as is, and nothing is created next to the file.

![Problems panel](images/lint.png)
*Figure: Dots next to the line numbers, wavy underlines, and the Problems panel below*

Check results show up in several places:

- **Dots in the gutter** next to the line numbers: red error · yellow warning · blue info
- **Wavy underlines** at the problem spots. Hovering shows the message.
- The code check item in the **status bar**: `✕ errors ⚠ warnings ℹ info`, **✓** when there are no problems, **—** when there is no checker for this language. Hovering shows the name of the tool used, and clicking opens the Problems panel.
- **F8** (Editor › Next problem): moves to the next problem after the cursor.

Where to turn it on and off: **Editor › Code check (lint)**, Settings › General › Editing aids, and the top of the Settings › Checks tab (on by default). When off, the dots · underlines · status bar item disappear.

## The Problems panel

Open the **Problems** tab of the bottom panel with the **Problems** button on the toolbar, **View › Problems**, **Editor › Problems**, or the check item in the status bar. Opening this tab while code checking is off turns checking on.

- The header shows the current document's name and a summary ("eslint · 2 errors · 1 warnings · 0 info", or "Checking…" while checking), and the **Check again** button checks again right away.
- The list shows the current document's problems with a severity mark · line:column · message (rule name). **Clicking one moves** the cursor there.
- The **⚙ (Problem settings)** at the right of the panel header opens the Settings › Checks tab directly.
- Depending on the situation, notices appear such as "Code checking is off", "No file is open.", "This file is not code-checked." (binary files and so on), "No problems." and "No checker for this language, or it is not installed".

## Choosing a checker

On the Settings › Checks tab, choose which tool to use for each language. **Auto** takes the first one installed, and **Off** turns checking off for that language.

![Check settings](images/settings-lint.png)
*Figure: Settings › Checks — choosing a checker for each language*

| Language | Checkers (in this order when on Auto) |
|---|---|
| JavaScript · JSX | ESLint → node --check (syntax check) |
| TypeScript · TSX | ESLint |
| Python | ruff → pyflakes → python syntax check |
| JSON | Built-in check |
| YAML | Built-in YAML check · built-in Kubernetes check · kubeconform · kubectl --dry-run · yamllint |
| Shell | shellcheck |
| PowerShell | PSScriptAnalyzer |
| C | gcc · clang · cc (`-fsyntax-only -Wall`) |
| C++ | g++ · clang++ · gcc · clang |
| Go | gofmt · go vet |
| PHP | php -l |
| Ruby | RuboCop → ruby -c |
| Dockerfile | hadolint |
| Markdown | markdownlint |
| CSS · SCSS · LESS | stylelint |
| Java | javac |

- For **Kubernetes manifests** (YAML), the built-in check verifies required fields, container name/image, untagged images, whether selectors match labels, whether containerPort is a number, and so on.
- When the project has no configuration file, ESLint · stylelint check with the default configuration bundled with the app.
- Choosing a tool that is not installed ("not installed · asked when selected") shows the **install steps** (check the package manager → download → install → use it as the checker for this language), and if you agree, it is installed with the same progress window as the formatters. The ⬇ button next to the language installs it too.
- **Look again** checks the installed tools again.
