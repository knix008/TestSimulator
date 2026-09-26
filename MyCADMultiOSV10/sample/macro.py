# MyCAD Python macro - runs in the sandboxed interpreter
import Part
import math

doc = App.newDocument("Bracket")

def plate(width, depth, thickness):
    return Part.makeBox(width, depth, thickness)

base = plate(80, 50, 10)
boss = Part.makeCylinder(12, 30)
hole = Part.makeCylinder(6, 40)
part = base + boss - hole

obj = doc.addObject("Part::Feature", "Bracket")
obj.Shape = part
doc.recompute()

print("volume", round(part.Volume, 1), "mm3")
print("area", round(part.Area, 1), "mm2")
for i in range(3):
    print("hole", i + 1, "at", i * 20)
