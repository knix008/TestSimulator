# Assets

| File | Use |
|------|-----|
| `icon-source.png` | Master artwork |
| `app.ico` | PC client exe / window / MSI shortcuts & ARP |
| `app.png` | 512px PNG (docs, store artwork) |
| `device-sim.ico` | Device simulator exe / window |
| `device-sim.png` | Simulator PNG |
| `make_icons.py` | Regenerate `.ico` / `.png` from `icon-source.png` |

Style:
- Dark teal-slate rounded tile, transparent outer corners
- Soft glossy highlight on the upper-left
- Verify with `app-preview-checker.png` (checkerboard shows real alpha)

```powershell
python assets\make_icons.py
```

Then rebuild the app / MSI so exe and shortcuts pick up the new `.ico`.
