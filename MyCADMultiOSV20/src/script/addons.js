// The macros that come with MyCAD (the addon manager's catalogue): each runs
// in the script console — Python ones with the FreeCAD / Part modules and
// `mycad`, JavaScript ones with `cad`. Others can be installed from a web
// address (.py / .FCMacro / .js) or a file.

export const ADDON_CATALOG = [
  {
    id: 'plate-with-holes', language: 'python',
    name: { ko: '구멍 뚫린 판 (Part)', en: 'Plate with holes (Part)' },
    description: { ko: 'FreeCAD Part 매크로처럼: 판에 구멍 네 개를 빼서 도면에 넣고 부피를 알려 줍니다.', en: 'Like a FreeCAD Part macro: cuts four holes from a plate, shows it and prints its volume.' },
    code: `import FreeCAD as App
import Part

plate = Part.makeBox(120, 80, 10)
for x, y in [(15, 15), (105, 15), (105, 65), (15, 65)]:
    plate = plate.cut(Part.makeCylinder(5, 10, App.Vector(x, y, 0)))
Part.show(plate, "Plate")
print("Volume:", round(plate.Volume, 1), "mm³")
`,
  },
  {
    id: 'box-grid', language: 'python',
    name: { ko: '상자 배열 (문서 객체)', en: 'Grid of boxes (document objects)' },
    description: { ko: 'App.ActiveDocument.addObject("Part::Box") 로 3 × 3 상자를 만들고 높이를 차례로 바꿉니다.', en: 'Makes a 3 × 3 grid with addObject("Part::Box") and steps their heights.' },
    code: `import FreeCAD as App

doc = App.ActiveDocument
for i in range(3):
    for j in range(3):
        box = doc.addObject("Part::Box", f"Box{i}{j}")
        box.Length, box.Width = 20, 20
        box.Height = 5 + 5 * (i + j)
        box.Placement = App.Placement(App.Vector(30 * i, 30 * j, 0), App.Rotation())
doc.recompute()
App.Console.PrintMessage(f"{len(doc.Objects)} boxes\\n")
`,
  },
  {
    id: 'solid-report', language: 'python',
    name: { ko: '솔리드 목록과 부피', en: 'Solid list with volumes' },
    description: { ko: '도면의 모든 솔리드 이름 · 종류 · 부피를 표로 출력합니다 (부품표 기초).', en: 'Prints every solid with its kind and volume (a start for a bill of materials).' },
    code: `import json
import mycad

solids = [e for e in json.loads(mycad.json(mycad.entities())) if e["type"] == "solid"]
total = 0
for e in solids:
    v = json.loads(mycad.json(mycad.properties(mycad.obj(json.dumps(e)))))["volume"]
    total += v
    print(f'{e.get("name") or e["kind"]:<24} {e["kind"]:<12} {v:>12.1f} mm³')
print(f'{"Total":<37} {total:>12.1f} mm³')
`,
  },
  {
    id: 'bolt-circle', language: 'js',
    name: { ko: '볼트 원 구멍', en: 'Bolt circle' },
    description: { ko: '원점 둘레 지름 100 원 위에 구멍 8개와 피치 원을 그립니다 (JavaScript).', en: 'Draws eight holes and the pitch circle on a Ø100 circle round the origin (JavaScript).' },
    code: `const n = 8, r = 50, hole = 4.5;
cad.circle(0, 0, r);
for (let i = 0; i < n; i++) {
  const a = (2 * Math.PI * i) / n;
  cad.circle(r * Math.cos(a), r * Math.sin(a), hole);
}
cad.zoomFit();
print(n + ' holes on Ø' + 2 * r);
`,
  },
  {
    id: 'spiral-stairs', language: 'python',
    name: { ko: '나선 계단 디딤판', en: 'Spiral stair treads' },
    description: { ko: '디딤판 16개를 22.5° 씩 돌리고 180 mm 씩 올려 나선 계단을 만듭니다.', en: 'Sixteen treads, each turned 22.5° and raised 180 mm: a spiral stair.' },
    code: `import FreeCAD as App
import Part

for i in range(16):
    tread = Part.makeBox(900, 300, 40)
    tread.Placement = App.Placement(App.Vector(0, 0, 180 * i), App.Rotation(App.Vector(0, 0, 1), 22.5 * i))
    Part.show(tread, f"Tread{i + 1}")
Part.show(Part.makeCylinder(80, 180 * 16), "Column")
`,
  },
  {
    id: 'clear-dimensions', language: 'js',
    name: { ko: '치수 모두 지우기', en: 'Remove all dimensions' },
    description: { ko: '도면의 치수를 모두 지웁니다 (실행 취소 한 번이면 되돌아옵니다).', en: 'Removes every dimension of the drawing (one undo brings them back).' },
    code: `const dims = cad.entities('dim').map((d) => d.id);
if (dims.length) cad.remove(dims);
print(dims.length + ' dimensions removed');
`,
  },
];
