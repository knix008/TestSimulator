# Lists every command FreeCAD's GUI registers, per workbench, with its menu
# text and tooltip: the ground truth for MyCAD's FreeCAD coverage table.
# Run with the FreeCAD GUI: freecad.exe scripts/freecad/list_commands.py
# (MYCAD_FC_OUT = the JSON file to write).
import json
import os
import FreeCAD
import FreeCADGui as Gui

out = os.environ.get("MYCAD_FC_OUT", "freecad-commands.json")
initial = sorted(Gui.listCommands())
seen = set(initial)
result = {"version": ".".join(FreeCAD.Version()[:3]), "workbenches": {}}
for name in sorted(Gui.listWorkbenches()):
    if name in ("NoneWorkbench",):
        continue
    try:
        Gui.activateWorkbench(name)
    except Exception as error:  # an add-on that fails to load
        result["workbenches"][name] = {"error": str(error), "commands": []}
        continue
    now = set(Gui.listCommands())
    new = sorted(now - seen)
    seen |= now
    commands = []
    for command in new:
        info = {}
        try:
            c = Gui.Command.get(command)
            info = c.getInfo() if c else {}
        except Exception:
            pass
        commands.append({"name": command, "menu": info.get("menuText", ""), "tip": info.get("toolTip", "")})
    result["workbenches"][name] = {"commands": commands}
# The commands registered before any workbench was activated (Std_*, and the
# C++ workbenches loaded at start-up: Part, PartDesign, Sketcher...).
base = []
for command in initial:
    if True:
        try:
            info = Gui.Command.get(command).getInfo()
        except Exception:
            info = {}
        base.append({"name": command, "menu": info.get("menuText", ""), "tip": info.get("toolTip", "")})
result["workbenches"]["StartUp"] = {"commands": base}
with open(out, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
Gui.getMainWindow().close()
FreeCAD.closeDocument  # keep linters quiet
os._exit(0)
