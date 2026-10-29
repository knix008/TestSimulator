# User Manual and Tutorial

## User Manual Window

![User manual window: table of contents on the left, content on the right, toolbar at the top](images/en/guide.png)

This manual opens in a separate window (a real child window in the desktop edition, a new browser window in the web edition; if the browser blocks pop-ups, a floating window inside the page).

- **Open**: {{F1}}, the book button in the title bar, **User manual** on the Start Page, or **Help › User Manual** on the ribbon.
- **Table of contents on the left**: the structure of chapters and sections. Click an entry to jump there; as you scroll the content, the section you are reading is highlighted. Expand and collapse chapters with the ▸ to their left.
- **Content on the right**: all chapters are joined together so you can keep reading down.
- **Document**: switches between the User manual and the Tutorial document.
- **Language**: Korean / English. Initially it follows the program's language.
- **Font size**: [−] 12px [+]. The default is 12px, and the chosen size is remembered.
- **Print**: choose **Whole manual** or **Current chapter** in the selector next to it, then click **Print** ({{Ctrl+P}}). A print page including the images is generated, and a print window with page setup and preview opens.
- **Run tutorial**: starts the tutorial in the main window.
- The window position and size and your reading position come back the next time you open it.
- It follows the program's theme, and when you change the theme the open manual changes immediately.

## Tutorial

![Tutorial card and highlight](images/en/tour.png)

The tutorial is a guide that runs on top of the real interface. At each step it highlights the part being explained with a yellow border and shows the explanation on a card. The tutorial opens the screens it needs (Start Page, editor, figures, model editor …) by itself and runs the example code by itself.

- **Start**: **Run** in the prompt window on launch, **Run tutorial** on the Start Page, the graduation-cap button in the title bar, **Help › Run Tutorial** on the ribbon, or **Run tutorial** in the manual window.
- **Card**: chapter name and position within the chapter, progress bar, title and explanation. Drag the header to move it.
- **Buttons**: ⏮ from the beginning, ◀ previous, ▶ autoplay / ⏸ pause, **Next ▶**, and **Done ✓** on the last step.
- **Chapter list**: at the bottom left of the card; jump straight to the chapter you want.
- **Keys**: {{→}} / {{Space}} next, {{←}} previous, {{Esc}} quit.

The tutorial creates variables such as `x`, `y`, `A`, `X`, `Y` and `Z` in the workspace and draws a few figures. Script and model tabs opened by the tutorial are closed when it moves on to the next chapter.

The **Tutorial document** (the **Document** selector in the manual window, or **Tutorial document** on the Start Page) summarizes the same steps with pictures.


## The Help tab

The **Help** tab at the right end of the title bar gathers everything that helps you.

![The Help ribbon](images/en/ribbon-help.png)

| Button | Action |
| --- | --- |
| User Manual | This manual ({{F1}}) |
| Run Tutorial | The interactive tutorial from the beginning |
| Tutorial Document | The tutorial steps with pictures |
| Command Help | Runs `help` in the Command Window |
| Find Functions | Asks for a word and runs `lookfor` |
| Shortcuts | The main keyboard shortcuts |
| Samples | The samples card of the Start Page |
| Preferences | The settings window |
| About | Version and license |

## Help from Commands

| Command | Contents |
| --- | --- |
| `help` | Help contents |
| `help plot` | Description of one function |
| `lookfor word` | Functions whose description contains the word |
| `doc plot` | Detailed help |
