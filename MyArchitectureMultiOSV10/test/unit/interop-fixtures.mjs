// Hand-written fixtures for the importers of other programs' files, shared
// by test/unit/interop.test.mjs and the GUI smoke test: a deflated ZIP
// writer, a Sweet Home 3D Home.xml and a gbXML model.

import zlib from "node:zlib";
import { crc32 } from "../../src/io/zip.js";

// A ZIP with DEFLATE entries, like the ones Sweet Home 3D and other programs write.
export function deflateZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const comp = new Uint8Array(zlib.deflateRawSync(data));
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x800, true); dv.setUint16(8, 8, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, comp);
    central.push(cd);
    offset += local.length + comp.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const b of [...parts, ...central, end]) { out.set(b, p); p += b.length; }
  return out;
}

export const HOME_XML = `<?xml version='1.0'?>
<home version='6400' name='C:\\Users\\me\\TestHome.sh3d' camera='topCamera' wallHeight='250.0'>
  <property name='com.eteks.sweethome3d.SweetHome3D.PlanScale' value='0.5'/>
  <environment groundColor='FF336633'/>
  <compass x='-100' y='50' diameter='100' northDirection='30.0' longitude='2.2165682' latitude='0.6544985' timeZone='Asia/Seoul' visible='true'/>
  <level id='level0' name='Ground' elevation='0.0' floorThickness='12.0' height='250.0' elevationIndex='0'/>
  <level id='level1' name='Upstairs' elevation='262.0' floorThickness='12.0' height='250.0' elevationIndex='0'/>
  <level id='level2' name='Upstairs layer' elevation='262.0' floorThickness='12.0' height='250.0' elevationIndex='1'/>
  <pieceOfFurniture level='level0' name='Lit double' x='600' y='350' width='160' depth='200' height='50'/>
  <pieceOfFurniture level='level0' name='Canapé 3 places' x='60' y='300' angle='1.5707964' width='210' depth='90' height='80' color='FF6F7F94'/>
  <pieceOfFurniture level='level0' catalogId='eTeks#fridge' name='Frigo' x='750' y='50' width='60' depth='65' height='180'/>
  <pieceOfFurniture level='level0' name='Spaceship' x='600' y='530' width='100' depth='100' height='100' color='FF336699'/>
  <pieceOfFurniture level='level0' name='Cup' x='600' y='350' elevation='50' width='8' depth='8' height='10'/>
  <pieceOfFurniture level='level0' name='Ghost' x='100' y='100' width='50' depth='50' height='50' visible='false'/>
  <light level='level0' catalogId='eTeks#floorLamp' name='Floor lamp' x='40' y='40' width='40' depth='40' height='160' power='0.5'>
    <lightSource x='0.5' y='0.5' z='0.9' color='FFFFFF'/>
  </light>
  <furnitureGroup level='level0' name='Dining' x='330' y='480' width='105' depth='50' height='90'>
    <pieceOfFurniture level='level0' name='Chair' x='300' y='480' width='45' depth='50' height='90'/>
    <pieceOfFurniture name='Chaise' x='360' y='480' width='45' depth='50' height='90'/>
  </furnitureGroup>
  <pieceOfFurniture level='level0' catalogId='eTeks#staircase' name='Staircase' x='300' y='200' width='100' depth='300' height='262'/>
  <doorOrWindow level='level0' catalogId='eTeks#frontDoor' name='Front door' x='200' y='600' width='90' depth='20' height='210' wallThickness='1' wallDistance='0'/>
  <doorOrWindow level='level0' name='Fenêtre double' x='600' y='0' elevation='90' width='120' depth='20' height='120'/>
  <doorOrWindow level='level0' name='Fixed window' x='600' y='0' elevation='215' width='120' depth='20' height='30'/>
  <doorOrWindow level='level0' name='Porte-fenêtre' x='800' y='300' angle='1.5707964' width='140' depth='20' height='215' modelMirrored='true'/>
  <doorOrWindow level='level0' name='Window in the garden' x='2000' y='2000' elevation='90' width='100' depth='20' height='100'/>
  <wall id='wall0' level='level0' wallAtEnd='wall1' xStart='0' yStart='0' xEnd='800' yEnd='0' height='250' thickness='20' leftSideColor='FFECE8E1'/>
  <wall id='wall1' level='level0' wallAtStart='wall0' xStart='800' yStart='0' xEnd='800' yEnd='600' height='250' thickness='20'/>
  <wall id='wall2' level='level0' xStart='800' yStart='600' xEnd='0' yEnd='600' height='250' thickness='20'/>
  <wall id='wall3' level='level0' xStart='0' yStart='600' xEnd='0' yEnd='0' height='250' thickness='20'/>
  <wall id='wall4' level='level0' xStart='400' yStart='0' xEnd='400' yEnd='600' height='250' thickness='10'/>
  <wall id='wall5' level='level1' xStart='0' yStart='0' xEnd='800' yEnd='0' height='250' heightAtEnd='300' thickness='20'/>
  <wall id='wall6' level='level1' xStart='800' yStart='0' xEnd='800' yEnd='600' thickness='20'/>
  <wall id='wall7' level='level1' xStart='800' yStart='600' xEnd='0' yEnd='600' height='250' thickness='20'/>
  <wall id='wall8' level='level1' xStart='0' yStart='600' xEnd='0' yEnd='0' height='250' thickness='20' arcExtent='-1.5707964'/>
  <room level='level0' name='Living' floorColor='FFC49A6C' areaVisible='true'>
    <point x='10' y='10'/><point x='395' y='10'/><point x='395' y='590'/><point x='10' y='590'/>
  </room>
  <room level='level0' name='Bedroom'>
    <texture attribute='floorTexture' name='Carrelage blanc' width='30' height='30' image='3'/>
    <point x='405' y='10'/><point x='790' y='10'/><point x='790' y='590'/><point x='405' y='590'/>
  </room>
  <room level='level2' name='Attic room'>
    <point x='10' y='10'/><point x='790' y='10'/><point x='790' y='590'/><point x='10' y='590'/>
  </room>
  <room level='level0'><point x='0' y='0'/><point x='1' y='0'/></room>
  <dimensionLine level='level0' xStart='0' yStart='-50' xEnd='800' yEnd='-50' offset='20'/>
  <label level='level1' x='400' y='300' angle='1.5707964'>
    <textStyle fontSize='30.0' bold='true'/>
    <text>Étage &amp; combles</text>
  </label>
  <polyline level='level0' color='FFFF0000' closedPath='false'>
    <point x='0' y='700'/><point x='400' y='750'/><point x='800' y='700'/>
  </polyline>
</home>`;

export const poly = (pts) => `<PolyLoop>${pts.map((q) => `<CartesianPoint>${q.map((c) => `<Coordinate>${c}</Coordinate>`).join("")}</CartesianPoint>`).join("")}</PolyLoop>`;
const planar = (pts) => `<PlanarGeometry>${poly(pts)}</PlanarGeometry>`;
// A vertical wall rectangle from (x1, y1) to (x2, y2), z0..z1 (gbXML: y north, z up).
export const wallRect = (x1, y1, x2, y2, z0, z1) => [[x1, y1, z0], [x2, y2, z0], [x2, y2, z1], [x1, y1, z1]];
export const floorRect = (x1, y1, x2, y2, z) => [[x1, y1, z], [x2, y1, z], [x2, y2, z], [x1, y2, z]];
export const surface = (id, type, pts, { inner = "", adj = [], cons = "" } = {}) => `<Surface id="${id}" surfaceType="${type}"${cons ? ` constructionIdRef="${cons}"` : ""}>${adj.map((s) => `<AdjacentSpaceId spaceIdRef="${s}"/>`).join("")}${planar(pts)}${inner}</Surface>`;
const opening = (id, type, pts) => `<Opening id="${id}" openingType="${type}"><Name>${id}</Name>${planar(pts)}</Opening>`;

export function gbxmlFixture(unit = "Meters") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gbXML xmlns="http://www.gbxml.org/schema" version="6.01" lengthUnit="${unit}" areaUnit="SquareMeters" temperatureUnit="C" useSIUnitsForResults="true">
 <Campus id="campus">
  <Name>Test campus</Name>
  <Location><Name>Seoul</Name><Latitude>37.5</Latitude><Longitude>127.0</Longitude></Location>
  <Building id="bldg" buildingType="SingleFamily">
   <Name>Test building</Name>
   <BuildingStorey id="st-a"><Name>Ground floor</Name><Level>0</Level></BuildingStorey>
   <BuildingStorey id="st-b"><Name>First floor</Name><Level>3</Level></BuildingStorey>
   <Space id="sp1" buildingStoreyIdRef="st-a"><Name>Living</Name>
    <ShellGeometry id="sh1"><ClosedShell>${poly(floorRect(0, 0, 6, 6, 0))}${poly(floorRect(0, 0, 6, 6, 3))}${poly(wallRect(0, 0, 6, 0, 0, 3))}</ClosedShell></ShellGeometry>
   </Space>
   <Space id="sp2" buildingStoreyIdRef="st-a"><Name>Kitchen</Name>${planar(floorRect(6, 0, 10, 6, 0))}</Space>
   <Space id="sp3"><Name>Bedroom</Name>
    <ShellGeometry id="sh3"><ClosedShell>${poly(floorRect(0, 0, 10, 6, 3))}${poly(floorRect(0, 0, 10, 6, 6))}</ClosedShell></ShellGeometry>
   </Space>
  </Building>
  ${surface("s-south-a", "ExteriorWall", wallRect(0, 0, 10, 0, 0, 3), { cons: "c-ext", adj: ["sp1"], inner: opening("win-a", "OperableWindow", wallRect(2, 0, 3.2, 0, 0.9, 2.1)) + opening("door-slide", "SlidingDoor", wallRect(7, 0, 8.8, 0, 0, 2.1)) })}
  <Surface id="s-north-a" surfaceType="ExteriorWall" constructionIdRef="c-ext"><AdjacentSpaceId spaceIdRef="sp1"/>
   <RectangularGeometry><Azimuth>0</Azimuth><CartesianPoint><Coordinate>10</Coordinate><Coordinate>6</Coordinate><Coordinate>0</Coordinate></CartesianPoint><Tilt>90</Tilt><Width>10</Width><Height>3</Height></RectangularGeometry>
   ${planar(wallRect(10, 6, 0, 6, 0, 3))}
   <Opening id="door-rect" openingType="NonSlidingDoor"><RectangularGeometry><CartesianPoint><Coordinate>1</Coordinate><Coordinate>0</Coordinate></CartesianPoint><Width>0.9</Width><Height>2.1</Height></RectangularGeometry></Opening>
  </Surface>
  ${surface("s-west-a", "ExteriorWall", wallRect(0, 6, 0, 0, 0, 3), { cons: "c-ext", adj: ["sp1"] })}
  ${surface("s-east", "ExteriorWall", wallRect(10, 0, 10, 6, 0, 6), { cons: "c-ext", adj: ["sp2", "sp3"] })}
  ${surface("s-int-1", "InteriorWall", wallRect(6, 0, 6, 6, 0, 3), { adj: ["sp1", "sp2"], inner: opening("pass", "Air", wallRect(6, 2, 6, 3, 0, 2.1)) })}
  ${surface("s-int-2", "InteriorWall", wallRect(6, 6, 6, 0, 0, 3), { adj: ["sp2", "sp1"] })}
  ${surface("s-south-b", "ExteriorWall", wallRect(0, 0, 10, 0, 3, 6), { cons: "c-ext", adj: ["sp3"], inner: opening("win-b", "FixedWindow", wallRect(4, 0, 5.5, 0, 3.9, 5.1)) })}
  ${surface("s-north-b", "ExteriorWall", wallRect(10, 6, 0, 6, 3, 6), { cons: "c-ext", adj: ["sp3"] })}
  ${surface("s-west-b", "ExteriorWall", wallRect(0, 6, 0, 0, 3, 6), { cons: "c-ext", adj: ["sp3"] })}
  ${surface("s-roof", "Roof", floorRect(0, 0, 10, 6, 6), { adj: ["sp3"], inner: opening("sky", "OperableSkylight", floorRect(4, 2, 5, 3, 6)) })}
  ${surface("s-slab", "SlabOnGrade", floorRect(0, 0, 10, 6, 0), { adj: ["sp1"] })}
  ${surface("s-floor", "InteriorFloor", floorRect(0, 0, 10, 6, 3), { adj: ["sp3", "sp1"] })}
  ${surface("s-shade", "Shade", floorRect(0, -1, 10, 0, 2.4))}
 </Campus>
 <Construction id="c-ext"><LayerId layerIdRef="l-ext"/><Name>Exterior wall</Name></Construction>
 <Layer id="l-ext"><MaterialId materialIdRef="m-brick"/><MaterialId materialIdRef="m-ins"/></Layer>
 <Material id="m-brick"><Name>Brick</Name><Thickness unit="Meters">0.19</Thickness></Material>
 <Material id="m-ins"><Name>Insulation</Name><Thickness unit="Centimeters">6</Thickness></Material>
 <DocumentHistory><ProgramInfo id="pi"><ProductName>Hand written</ProductName><Version>1</Version></ProgramInfo></DocumentHistory>
</gbXML>`;
}
