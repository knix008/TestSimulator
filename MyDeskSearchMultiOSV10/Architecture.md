# MyDeskSearch Architecture

MyDeskSearch is a Rust workspace. `desksearch-core` is the tested search engine. The `mydesksearch` binary, in `crates/desksearch`, is a borderless egui window and system-tray shell for Linux, macOS, and Windows.

## Crates

### desksearch-core

- `query` / `text` / `score` / `memory` parse `*` (AND) and `+` (OR), wildcards, and regular expressions, then score names. Names are compared as Unicode NFC. A pasted path is reduced to its last segment unless it contains a wildcard.
- `store` keeps the SQLite index. Literal terms of three or more characters use an FTS5 trigram index; shorter terms, case-sensitive queries, and wildcards use `LIKE`. Regular expressions are scored in pages of 20,000 rows. Results are capped at 2,000.
- `index` writes every full scan to `index.building.db`. Search reads `index.db` when it exists, otherwise the building database. Promotion happens only after every root succeeds. A failed root is retried three times inside the pass and is not marked complete. Cancelling leaves the building database in place. The next process start deletes it and scans again.
- `scan` walks roots with `walkdir`, skips known system directories, and honors legacy excluded folders. One SQLite writer ingests batches, so roots are scanned one after another.
- `watch` applies create and delete events to the live database and can reconcile a root with the current disk tree.
- `settings` loads PascalCase `settings.json`, clamps appearance values, and migrates older `ExcludedDrives` lists into `IncludedDrives`. `Language` is `ko` or `en`. An installer may seed `{"Language":"en"}`; missing fields are filled on the next launch, and an existing settings file is left unchanged when the user keeps data.

## Packaging

`packaging/windows/build.ps1`, `packaging/linux/build.sh`, and `packaging/macos/build.sh` produce the installer for that OS. The Windows installer is `install.ps1` (wrapped by Inno Setup when ISCC is available). Linux and macOS share `packaging/unix/install.sh`. A `.deb` asks through debconf, and a `.pkg` asks through the same script before replacing `/Applications/MyDeskSearch.app`.

Reinstall always deletes the previous program files, shortcuts, desktop entries, and login item, then copies a new build. User data (`settings.json`, `index.db`, and the rest of the MyDeskSearch data directory) is deleted only after an explicit keep/delete choice. The install language is written when that directory has no `settings.json`.
- `inclusion` matches Windows drive roots and Unix absolute paths, including mount points discovered from `/proc/mounts` or macOS `/Volumes`.
- `locale` serves Korean and English from the same key set.
- `instance` uses an exclusive file lock plus a localhost port so a second launch asks the running process to show its window.
- `platform` opens files with `explorer` / `open` / `xdg-open`, and writes the login entry for the current OS (HKCU Run, `~/.config/autostart`, or a LaunchAgent plist).

### desksearch

The window is borderless, resizable between 280 and 720 pixels, and can stay above other windows. Closing it hides the window; Exit from the menu or tray quits. Settings edits are previewed and reverted on cancel. Saving a changed index scope starts a fresh full index. The worker thread owns scanning so search requests can still be answered from the stable database while a rebuild is running.

## Tests

`cargo test -p desksearch-core` covers the search grammar, sort orders, SQLite/FTS behavior, the 2,000-result cap, dual-database promotion, scan retries, settings migration, path scope, locales, the single-instance signal, and autostart file contents.
