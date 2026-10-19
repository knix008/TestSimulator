# Spell check (English)

My Editor checks the spelling of **English** words. It uses the en_US (American English) Hunspell dictionary bundled with the app, so no internet connection is needed. Spelling in Korean and other languages is not checked.

![Spell check](images/spell.png)
*Figure: Wavy underlines on misspelled words and suggestions in the right-click menu*

## Turning it on and off

Turn it on or off with any of the following (on by default):

- **F7**
- The **Spell check** button on the toolbar (✓ icon)
- **Editor › Spell check (English)**
- **English spell check** under Settings › General › Editing aids

When you first turn it on, "Loading dictionary…" may appear briefly while the dictionary loads.

## What is checked

- In **plain text · Markdown** documents, every word is checked.
- In **code** documents (.c, .js, .py …), **only words inside comments and strings** are checked. Identifiers such as variable · function names are left alone.
- The following tokens are not treated as words and are skipped:
  - Tokens mixed with digits · underscores · `.` · `/` · `@` — URLs, e-mail addresses, file names, `snake_case` identifiers and so on
  - Words with capitals in the middle, like `camelCase`
  - Short upper-case abbreviations (`HTML`, `API` and so on)

Words that appear to be misspelled get a **wavy underline**.

## Correcting and adding to the dictionary

**Right-clicking** an underlined word shows the following items at the top of the edit menu.

| Item | Description |
|---|---|
| Suggested words | Clicking one replaces the word with it. With no suggestions, "(no suggestions)" |
| Add "word" to dictionary | Puts it in your dictionary so it is never marked as wrong again. It is saved in the settings and kept on the next launch |
| Ignore "word" for now | Ignores the word only for this run. It is checked again after you restart the program |

After adding or ignoring, the word's underline disappears right away in the open documents.

## Checking every word in code files

To also check words outside comments · strings in code files, turn on one of these (off by default):

- **Editor › Check every word in code files too** (available only while spell check is on)
- **Check every word in code files too (off: comments and strings only)** under Settings › General › Editing aids

Many keywords and abbreviated names may then be flagged. Add names you use often to the dictionary.

> Tip: When you are only reading a document for a moment and the underlines get in the way, turn spell check off with F7 and back on later. Words added to the dictionary stay.
