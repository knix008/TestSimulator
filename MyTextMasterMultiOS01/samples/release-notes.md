# Release Notes — v2.4.0

*Released 2026-11-03*

## Highlights

- **Split view** — edit and preview side by side, with synced scrolling.
- **Dark theme** has been redesigned for better contrast.
- Opening large files (50 MB+) is now about *3x faster*.

## New

- Added word and character counts to the status bar.
- Added "Sort lines" and "Remove duplicate lines" commands.
- Tables can now be aligned with `:---:` style separators.
- New keyboard shortcut: `Ctrl+Shift+P` opens the command palette.

## Improved

| Area | Before | After |
|:-----|-------:|------:|
| Startup time | 1.8 s | 0.9 s |
| Memory (idle) | 210 MB | 140 MB |
| Search 10k lines | 420 ms | 95 ms |

## Fixed

1. Korean IME composition no longer drops the last character.
2. The cursor no longer jumps to the top after undo.
3. Fixed a crash when saving to a read-only folder.
4. Line endings (CRLF / LF) are preserved on save.

## Known issues

- Printing very wide tables may cut off the last column.

> Upgrading from 1.x? Your settings are migrated automatically on first launch.
