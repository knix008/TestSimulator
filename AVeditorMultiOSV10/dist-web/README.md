# AV Editor — Web Build

Serve this folder over HTTP (ES modules require a web server):

```bash
npx --yes serve dist-web
# or
npx --yes http-server dist-web -p 4173
```

Then open the printed URL in the browser.

## Notes
- Sample media under `samples/` appears in **Library** automatically when present.
- Use **Add media…** (+), toolbar Import, or drag files onto the left Library panel.
- Project Save downloads a `.avp` JSON file.
- Export is a placeholder in the web build.
