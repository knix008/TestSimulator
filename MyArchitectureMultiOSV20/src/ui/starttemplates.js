// 새로 시작 (start page): what a project can start from, by kind of building.
// Every group has the same number of tiles (test/unit/starttemplates.test.mjs).
// Tile: [kind, id, icon, name, description] — kind "preset" makes a blank
// project of that kind (core/presets.js), "sample" opens that sample as a
// starting point (its name comes from sample/index.json once loaded; `name`
// is the fallback) and "cmd" runs a command. Pure data: Node tests import it.

export const START_GROUPS = [
  { id: "houses", icon: "home", title: "Houses", items: [
    ["preset", "house", "new", "Blank house", "Two storeys of 2.8 m, ready for walls and a roof"],
    ["sample", "03-two-storey-house.myarch", "building", "Two-storey house", "Two levels, stairs, gable roof"],
    ["sample", "14-courtyard-house.myarch", "home", "Courtyard house", "A U-shaped house around a pool"],
    ["sample", "16-modern-villa.myarch", "curtainwall", "Modern villa", "Glass walls and a pool"],
    ["sample", "17-townhouse.myarch", "levels", "Townhouse", "Four levels and a roof terrace"],
    ["sample", "18-modern-farmhouse.myarch", "roof", "Modern farmhouse", "Timber and a steep gable roof"],
    ["sample", "19-duplex.myarch", "mirror", "Duplex", "Two mirrored homes"],
    ["sample", "20-compact-house.myarch", "room", "Compact house", "Small plan, shed roof"],
    ["sample", "05-wooden-cabin.myarch", "tree", "Wooden cabin", "Shed roof, timber materials"],
  ] },
  { id: "flats", icon: "room", title: "Flats and interiors", items: [
    ["preset", "flat", "new", "Blank apartment unit", "One 2.7 m storey with 4.2 m bays"],
    ["preset", "apartments", "new", "Blank apartment block", "Five 2.9 m storeys on a 6 m grid"],
    ["sample", "01-studio.myarch", "sofa", "Studio apartment", "One room, furnished"],
    ["sample", "02-two-bedroom.myarch", "room", "Two-bedroom apartment", "Rooms, areas and schedules"],
    ["sample", "40-penthouse.myarch", "sofa", "Penthouse", "Luxury interior, every room furnished"],
    ["sample", "08-apartment-block.myarch", "levels", "Apartment block", "Three levels, grid, columns"],
    ["sample", "11-mixed-use.myarch", "building", "Mixed-use building", "Shops below, flats above"],
    ["sample", "32-residential-complex.myarch", "building", "Residential complex", "Two towers on a podium"],
    ["sample", "37-u-shaped-apartments.myarch", "building", "U-shaped apartment block", "Seven storeys round a courtyard"],
  ] },
  { id: "work", icon: "building", title: "Offices and industry", items: [
    ["preset", "office", "new", "Blank office building", "Four 3.6 m storeys on an 8.4 m grid"],
    ["preset", "retail", "new", "Blank shop building", "Two 4.2 m storeys, open 8 m bays"],
    ["preset", "tower", "new", "Blank high-rise", "Twelve 3.8 m storeys and a basement, 9 m grid"],
    ["preset", "warehouse", "new", "Blank warehouse", "One 8 m hall on a 12 × 20 m grid"],
    ["sample", "04-small-office.myarch", "column", "Small office", "Columns and glass walls"],
    ["sample", "10-office-tower.myarch", "building", "Office tower", "Core, curtain wall, column grid"],
    ["sample", "33-atrium-office.myarch", "levels", "Atrium office", "Six storeys, bridges across an atrium"],
    ["sample", "36-terraced-office.myarch", "stairs", "Terraced office", "Five stepped storeys with terraces"],
    ["sample", "29-hotel.myarch", "building", "City hotel", "Podium and guest-room floors"],
  ] },
  { id: "public", icon: "library", title: "Public and culture", items: [
    ["preset", "public", "new", "Blank public building", "Three 4 m storeys on a 7.2 m grid"],
    ["sample", "12-hospital.myarch", "catHealth", "Community hospital", "Two levels along a corridor"],
    ["sample", "34-general-hospital.myarch", "catHealth", "General hospital", "Podium and two ward wings"],
    ["sample", "13-school.myarch", "catSchool", "Primary school", "Classrooms along a corridor"],
    ["sample", "35-courtyard-school.myarch", "catSchool", "Courtyard school", "Three storeys round a courtyard"],
    ["sample", "30-university-library.myarch", "library", "University library", "Four levels around an atrium"],
    ["sample", "31-sports-centre.myarch", "catFitness", "Sports centre", "A long-span hall with beams"],
    ["sample", "38-museum.myarch", "curtainwall", "Museum", "A gallery wing at an angle"],
    ["sample", "39-cafe-bistro.myarch", "catRestaurant", "Café-bistro", "Bar, dining room and kitchen, furnished"],
  ] },
  { id: "structures", icon: "bridge", title: "Bridges and towers", items: [
    ["cmd", "build.bridge", "bridge", "Bridge…", "Ten kinds of bridge, by parameters"],
    ["cmd", "build.tower", "tower", "Lattice tower…", "A parametric steel tower"],
    ["sample", "22-lattice-towers.myarch", "tower", "Lattice towers", "Steel members by parameters"],
    ["sample", "23-bridges.myarch", "bridge", "Bridges across a river", "Several bridge types side by side"],
    ["sample", "24-deck-arch-bridge.myarch", "bridge", "Deck arch bridge", "A concrete arch over a gorge"],
    ["sample", "25-haunched-girder-bridge.myarch", "beam", "Haunched girder bridge", "Deeper girders at the piers"],
    ["sample", "26-harp-cable-stayed-bridge.myarch", "member", "Harp cable-stayed bridge", "One pylon, parallel cables"],
    ["sample", "27-extradosed-bridge.myarch", "member", "Extradosed bridge", "Low masts, stiff deck"],
    ["sample", "28-stress-ribbon-footbridge.myarch", "walk", "Stress-ribbon footbridge", "A slender deck in a park"],
  ] },
  { id: "cad", icon: "bim", title: "Massing, CAD and BIM", items: [
    ["sample", "07-massing-study.myarch", "massShape", "Massing study", "Push/pull masses and scenes"],
    ["sample", "06-renovation-bim.myarch", "bim", "Renovation (BIM phases)", "Wall types, phases, cost"],
    ["sample", "09-cad-tracing.myarch", "dxf", "Tracing a DXF drawing", "CAD layers traced into walls"],
    ["cmd", "file.importDxf", "dxf", "Start from a DXF drawing…", "Trace AutoCAD plans into walls"],
    ["cmd", "file.importIfc", "bim", "Start from an IFC model…", "Walls, slabs and spaces from BIM"],
    ["cmd", "file.importBim", "bim", "Sweet Home 3D, gbXML…", "Projects of other programs"],
    ["cmd", "file.importModel", "model3d", "Start from a 3D model…", "OBJ, FBX, GLB, STL, DAE, 3MF"],
    ["sample", "15-sketchup-complex.myarch", "skComponent", "Cultural complex", "SketchUp-style components and tags"],
    ["sample", "21-interior-design.myarch", "material", "Interior design apartment", "Wall finishes, skirting, scenes"],
  ] },
];

export const START_TILE_COUNT = START_GROUPS.reduce((n, g) => n + g.items.length, 0);

/** Every translatable string of the groups (scripts/i18n-keys.mjs). */
export function startTemplateStrings() {
  return START_GROUPS.flatMap((g) => [g.title, ...g.items.flatMap(([, , , name, desc]) => [name, desc])]);
}
