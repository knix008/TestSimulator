# AV Editor — Web Build

Serve this folder over HTTP (ES modules require a web server):

```bash
npx --yes serve dist-web
# or
npx --yes http-server dist-web -p 4173
```

Then open the printed URL in a browser.

## Notes
- Use **Import** or drag files onto the preview/timeline.
- Left panel "Library" lists imported media for this session.
- Project Save downloads a `.avp` JSON file.
- Export is a placeholder in the web build.
