# Settings

Open the settings window with the gear in the title bar, **Home › Preferences** on the ribbon, or {{Ctrl+,}}. In the desktop edition it is a separate window with a fixed size. Changes are saved only when you click **OK**; **Cancel** reverts the theme and language preview. Each tab has a **Reset** button.

![Settings window](images/en/settings.png)

| Tab | Items |
| --- | --- |
| General | Language, start folder, reopen open files, ask to save on exit, `.m` file association (Windows) |
| Theme | Preview and choose from 40 themes (20 dark · 20 light) |
| Custom themes | Create your own theme (choose each color), import · export |
| Start Page | Show the start page on launch, **Tutorial prompt › Ask whether to run the tutorial on launch**, background type · speed · transparency · shuffle, card auto-arrange |
| Command Window | Font, size, numeric format (`format`), compact, number of lines to keep |
| Editor | Font, size, tab size, line numbers, line wrapping, auto save and interval |
| Figures | Default renderer, grid, rulers |
| Simulation | Default solver, stop time |
| Keyboard | {{Ctrl+Enter}} run section, {{Tab}} autocomplete, {{Ctrl+C}} copy, list of shortcuts |

All numeric values are edited with the − / + buttons and the value field between them (you can also type the value directly), and lists are chosen from dropdowns with icons.

## Tutorial Prompt Window

When the program starts, a "Run the tutorial?" window appears.

![Tutorial prompt window shown on launch](images/en/tutorial-ask.png)

- **Run**: starts the tutorial from the beginning.
- **Later**: closes the window.
- **User manual**: opens this manual.
- If you turn off **Show this window next time** and close the window, it no longer appears from the next launch on. You can turn it back on with **Ask whether to run the tutorial on launch** in Settings › Start Page.

## Where Settings Are Stored

| Edition | Location |
| --- | --- |
| Windows desktop | `%APPDATA%\MySimulationMath\settings.json` |
| macOS | `~/Library/Application Support/MySimulationMath/settings.json` |
| Linux | `~/.config/MySimulationMath/settings.json` |
| Web edition | The same settings folder on the server (change it with the environment variable `MSM_USER_DATA`) |

The command history, breakpoints, and the user manual's font size and reading position are stored separately in browser storage (localStorage).
