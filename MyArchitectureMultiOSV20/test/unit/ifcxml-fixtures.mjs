// Hand-written ifcXML files for test/unit/ifcxml.test.mjs, one per flavour:
// the same little model (one storey at 0, a 5 m and a 4 m wall 200 mm thick
// and 3 m high, a door in the first) written the way the IFC4 ifcXML schema
// writes it (simple values as XML attributes, the spatial structure through
// inverse elements nested in their owner, xsi:type references) and the way
// IFC2x3 ifcXML does (iso_10303_28 / uos, every attribute an element,
// ex:double-wrapper lists, references inside attribute elements).

export const IFC4_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2" xmlns:ifc="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="uos_1">
  <header><name>Hand made</name><time_stamp>2026-01-02T03:04:05</time_stamp></header>
  <IfcProject id="p1" GlobalId="0YvctVUKr0kugbFTf53O9L" Name="Hand made &amp; tested">
    <RepresentationContexts>
      <IfcGeometricRepresentationContext id="ctx" ContextType="Model" CoordinateSpaceDimension="3" Precision="0.01">
        <WorldCoordinateSystem xsi:type="IfcAxis2Placement3D" id="wcs"><Location xsi:type="IfcCartesianPoint" id="o" Coordinates="0 0 0"/></WorldCoordinateSystem>
      </IfcGeometricRepresentationContext>
    </RepresentationContexts>
    <UnitsInContext>
      <Units><IfcSIUnit UnitType="lengthunit" Prefix="milli" Name="metre"/><IfcSIUnit UnitType="planeangleunit" Name="radian"/></Units>
    </UnitsInContext>
    <IsDecomposedBy>
      <IfcRelAggregates GlobalId="1YvctVUKr0kugbFTf53O9L">
        <RelatedObjects>
          <IfcSite id="site" GlobalId="2YvctVUKr0kugbFTf53O9L" Name="Site" CompositionType="element">
            <IsDecomposedBy>
              <IfcRelAggregates GlobalId="3YvctVUKr0kugbFTf53O9L">
                <RelatedObjects>
                  <IfcBuilding id="bld" GlobalId="4YvctVUKr0kugbFTf53O9L" Name="House" CompositionType="element">
                    <IsDecomposedBy>
                      <IfcRelAggregates GlobalId="5YvctVUKr0kugbFTf53O9L">
                        <RelatedObjects>
                          <IfcBuildingStorey id="st1" GlobalId="6YvctVUKr0kugbFTf53O9L" Name="Ground floor" CompositionType="element" Elevation="0">
                            <ObjectPlacement xsi:type="IfcLocalPlacement" id="stp"><RelativePlacement xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/></ObjectPlacement>
                            <ContainsElements>
                              <IfcRelContainedInSpatialStructure GlobalId="7YvctVUKr0kugbFTf53O9L">
                                <RelatedElements>
                                  <IfcWall ref="w1" xsi:nil="true"/>
                                  <IfcWall ref="w2" xsi:nil="true"/>
                                  <IfcDoor ref="d1" xsi:nil="true"/>
                                </RelatedElements>
                              </IfcRelContainedInSpatialStructure>
                            </ContainsElements>
                          </IfcBuildingStorey>
                        </RelatedObjects>
                      </IfcRelAggregates>
                    </IsDecomposedBy>
                  </IfcBuilding>
                </RelatedObjects>
              </IfcRelAggregates>
            </IsDecomposedBy>
          </IfcSite>
        </RelatedObjects>
      </IfcRelAggregates>
    </IsDecomposedBy>
  </IfcProject>
  <IfcCartesianPoint id="mid1" Coordinates="2500 0"/>
  <IfcCartesianPoint id="mid2" Coordinates="0 2000"/>
  <IfcDirection id="up" DirectionRatios="0 0 1"/>
  <IfcWall id="w1" GlobalId="8YvctVUKr0kugbFTf53O9L" Name="South wall" PredefinedType="standard">
    <ObjectPlacement xsi:type="IfcLocalPlacement" id="w1p">
      <PlacementRelTo xsi:type="IfcLocalPlacement" ref="stp" xsi:nil="true"/>
      <RelativePlacement xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
    </ObjectPlacement>
    <Representation xsi:type="IfcProductDefinitionShape">
      <Representations>
        <IfcShapeRepresentation RepresentationIdentifier="Body" RepresentationType="SweptSolid">
          <ContextOfItems xsi:type="IfcGeometricRepresentationContext" ref="ctx" xsi:nil="true"/>
          <Items>
            <IfcExtrudedAreaSolid Depth="3000">
              <SweptArea xsi:type="IfcRectangleProfileDef" ProfileType="area" XDim="5000" YDim="200">
                <Position xsi:type="IfcAxis2Placement2D"><Location xsi:type="IfcCartesianPoint" ref="mid1" xsi:nil="true"/></Position>
              </SweptArea>
              <Position xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
              <ExtrudedDirection xsi:type="IfcDirection" ref="up" xsi:nil="true"/>
            </IfcExtrudedAreaSolid>
          </Items>
        </IfcShapeRepresentation>
      </Representations>
    </Representation>
    <HasOpenings ref="v1" xsi:type="IfcRelVoidsElement" xsi:nil="true"/>
  </IfcWall>
  <IfcWall id="w2" GlobalId="9YvctVUKr0kugbFTf53O9L" Name="West wall">
    <ObjectPlacement xsi:type="IfcLocalPlacement">
      <PlacementRelTo xsi:type="IfcLocalPlacement" ref="stp" xsi:nil="true"/>
      <RelativePlacement xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
    </ObjectPlacement>
    <Representation xsi:type="IfcProductDefinitionShape">
      <Representations>
        <IfcShapeRepresentation RepresentationIdentifier="Body" RepresentationType="SweptSolid">
          <ContextOfItems xsi:type="IfcGeometricRepresentationContext" ref="ctx" xsi:nil="true"/>
          <Items>
            <IfcExtrudedAreaSolid Depth="3000">
              <SweptArea xsi:type="IfcRectangleProfileDef" ProfileType="area" XDim="200" YDim="4000">
                <Position xsi:type="IfcAxis2Placement2D"><Location xsi:type="IfcCartesianPoint" ref="mid2" xsi:nil="true"/></Position>
              </SweptArea>
              <Position xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
              <ExtrudedDirection xsi:type="IfcDirection" ref="up" xsi:nil="true"/>
            </IfcExtrudedAreaSolid>
          </Items>
        </IfcShapeRepresentation>
      </Representations>
    </Representation>
  </IfcWall>
  <IfcRelVoidsElement id="v1" GlobalId="AYvctVUKr0kugbFTf53O9L">
    <RelatedOpeningElement xsi:type="IfcOpeningElement" id="op1" GlobalId="BYvctVUKr0kugbFTf53O9L">
      <ObjectPlacement xsi:type="IfcLocalPlacement">
        <PlacementRelTo xsi:type="IfcLocalPlacement" ref="w1p" xsi:nil="true"/>
        <RelativePlacement xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
      </ObjectPlacement>
      <Representation xsi:type="IfcProductDefinitionShape">
        <Representations>
          <IfcShapeRepresentation RepresentationIdentifier="Body" RepresentationType="SweptSolid">
            <ContextOfItems xsi:type="IfcGeometricRepresentationContext" ref="ctx" xsi:nil="true"/>
            <Items>
              <IfcExtrudedAreaSolid Depth="2100">
                <SweptArea xsi:type="IfcRectangleProfileDef" ProfileType="area" XDim="900" YDim="400">
                  <Position xsi:type="IfcAxis2Placement2D"><Location xsi:type="IfcCartesianPoint" Coordinates="1500 0"/></Position>
                </SweptArea>
                <Position xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
                <ExtrudedDirection xsi:type="IfcDirection" ref="up" xsi:nil="true"/>
              </IfcExtrudedAreaSolid>
            </Items>
          </IfcShapeRepresentation>
        </Representations>
      </Representation>
      <HasFillings ref="f1" xsi:type="IfcRelFillsElement" xsi:nil="true"/>
    </RelatedOpeningElement>
  </IfcRelVoidsElement>
  <IfcRelFillsElement id="f1" GlobalId="CYvctVUKr0kugbFTf53O9L">
    <RelatedBuildingElement xsi:type="IfcDoor" ref="d1" xsi:nil="true"/>
  </IfcRelFillsElement>
  <IfcDoor id="d1" GlobalId="DYvctVUKr0kugbFTf53O9L" Name="Front door" OverallHeight="2100" OverallWidth="900" PredefinedType="door" OperationType="single_swing_left">
    <ObjectPlacement xsi:type="IfcLocalPlacement">
      <PlacementRelTo xsi:type="IfcLocalPlacement" ref="w1p" xsi:nil="true"/>
      <RelativePlacement xsi:type="IfcAxis2Placement3D" ref="wcs" xsi:nil="true"/>
    </ObjectPlacement>
  </IfcDoor>
</ifcXML>
`;

export const IFC2X3_XML = `<?xml version="1.0" encoding="utf-8"?>
<ex:iso_10303_28 version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common">
  <ex:iso_10303_28_header><ex:name>Hand made 2x3</ex:name><ex:time_stamp>2026-01-02T03:04:05</ex:time_stamp></ex:iso_10303_28_header>
  <uos id="uos_1" configuration="i_ifc2x3" xmlns="http://www.iai-tech.org/ifcXML/IFC2x3/FINAL">
    <IfcSIUnit id="i1"><UnitType>lengthunit</UnitType><Name>metre</Name></IfcSIUnit>
    <IfcUnitAssignment id="i2"><Units ex:cType="set"><IfcSIUnit ref="i1" xsi:nil="true" pos="0"/></Units></IfcUnitAssignment>
    <IfcCartesianPoint id="i3"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">0.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.</IfcLengthMeasure><IfcLengthMeasure pos="2">0.</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcAxis2Placement3D id="i4"><Location><IfcCartesianPoint ref="i3" xsi:nil="true"/></Location></IfcAxis2Placement3D>
    <IfcGeometricRepresentationContext id="i5"><ContextType>Model</ContextType><CoordinateSpaceDimension>3</CoordinateSpaceDimension><Precision>1.E-05</Precision><WorldCoordinateSystem><IfcAxis2Placement3D ref="i4" xsi:nil="true"/></WorldCoordinateSystem></IfcGeometricRepresentationContext>
    <IfcPerson id="i6"><FamilyName>Tester</FamilyName></IfcPerson>
    <IfcOrganization id="i7"><Name>Lab</Name></IfcOrganization>
    <IfcPersonAndOrganization id="i8"><ThePerson><IfcPerson ref="i6" xsi:nil="true"/></ThePerson><TheOrganization><IfcOrganization ref="i7" xsi:nil="true"/></TheOrganization></IfcPersonAndOrganization>
    <IfcApplication id="i9"><ApplicationDeveloper><IfcOrganization ref="i7" xsi:nil="true"/></ApplicationDeveloper><Version>1</Version><ApplicationFullName>Hand</ApplicationFullName><ApplicationIdentifier>Hand</ApplicationIdentifier></IfcApplication>
    <IfcOwnerHistory id="i10"><OwningUser><IfcPersonAndOrganization ref="i8" xsi:nil="true"/></OwningUser><OwningApplication><IfcApplication ref="i9" xsi:nil="true"/></OwningApplication><ChangeAction>added</ChangeAction><CreationDate>0</CreationDate></IfcOwnerHistory>
    <IfcProject id="i11"><GlobalId>0YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>Hand made 2x3</Name><RepresentationContexts ex:cType="set"><IfcGeometricRepresentationContext ref="i5" xsi:nil="true" pos="0"/></RepresentationContexts><UnitsInContext><IfcUnitAssignment ref="i2" xsi:nil="true"/></UnitsInContext></IfcProject>
    <IfcLocalPlacement id="i12"><RelativePlacement><IfcAxis2Placement3D ref="i4" xsi:nil="true"/></RelativePlacement></IfcLocalPlacement>
    <IfcBuilding id="i13"><GlobalId>1YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>House</Name><ObjectPlacement><IfcLocalPlacement ref="i12" xsi:nil="true"/></ObjectPlacement><CompositionType>element</CompositionType></IfcBuilding>
    <IfcCartesianPoint id="i14"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">0.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.</IfcLengthMeasure><IfcLengthMeasure pos="2">3.</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcAxis2Placement3D id="i15"><Location><IfcCartesianPoint ref="i14" xsi:nil="true"/></Location></IfcAxis2Placement3D>
    <IfcLocalPlacement id="i16"><PlacementRelTo><IfcLocalPlacement ref="i12" xsi:nil="true"/></PlacementRelTo><RelativePlacement><IfcAxis2Placement3D ref="i4" xsi:nil="true"/></RelativePlacement></IfcLocalPlacement>
    <IfcLocalPlacement id="i17"><PlacementRelTo><IfcLocalPlacement ref="i12" xsi:nil="true"/></PlacementRelTo><RelativePlacement><IfcAxis2Placement3D ref="i15" xsi:nil="true"/></RelativePlacement></IfcLocalPlacement>
    <IfcBuildingStorey id="i18"><GlobalId>2YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>EG</Name><ObjectPlacement><IfcLocalPlacement ref="i16" xsi:nil="true"/></ObjectPlacement><CompositionType>element</CompositionType><Elevation>0.</Elevation></IfcBuildingStorey>
    <IfcBuildingStorey id="i19"><GlobalId>3YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>OG</Name><ObjectPlacement><IfcLocalPlacement ref="i17" xsi:nil="true"/></ObjectPlacement><CompositionType>element</CompositionType><Elevation>3.</Elevation></IfcBuildingStorey>
    <IfcRelAggregates id="i20"><GlobalId>4YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><RelatingObject><IfcProject ref="i11" xsi:nil="true"/></RelatingObject><RelatedObjects ex:cType="set"><IfcBuilding ref="i13" xsi:nil="true" pos="0"/></RelatedObjects></IfcRelAggregates>
    <IfcRelAggregates id="i21"><GlobalId>5YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><RelatingObject><IfcBuilding ref="i13" xsi:nil="true"/></RelatingObject><RelatedObjects ex:cType="set"><IfcBuildingStorey ref="i18" xsi:nil="true" pos="0"/><IfcBuildingStorey ref="i19" xsi:nil="true" pos="1"/></RelatedObjects></IfcRelAggregates>
    <IfcCartesianPoint id="i22"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">0.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcCartesianPoint id="i23"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">6.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcCartesianPoint id="i24"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">6.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.25</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcCartesianPoint id="i25"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">0.</IfcLengthMeasure><IfcLengthMeasure pos="1">0.25</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcPolyline id="i26"><Points ex:cType="list"><IfcCartesianPoint ref="i22" xsi:nil="true" pos="0"/><IfcCartesianPoint ref="i23" xsi:nil="true" pos="1"/><IfcCartesianPoint ref="i24" xsi:nil="true" pos="2"/><IfcCartesianPoint ref="i25" xsi:nil="true" pos="3"/><IfcCartesianPoint ref="i22" xsi:nil="true" pos="4"/></Points></IfcPolyline>
    <IfcArbitraryClosedProfileDef id="i27"><ProfileType>area</ProfileType><OuterCurve><IfcPolyline ref="i26" xsi:nil="true"/></OuterCurve></IfcArbitraryClosedProfileDef>
    <IfcDirection id="i28"><DirectionRatios ex:cType="list"><ex:double-wrapper pos="0">0.</ex:double-wrapper><ex:double-wrapper pos="1">0.</ex:double-wrapper><ex:double-wrapper pos="2">1.</ex:double-wrapper></DirectionRatios></IfcDirection>
    <IfcExtrudedAreaSolid id="i29"><SweptArea><IfcArbitraryClosedProfileDef ref="i27" xsi:nil="true"/></SweptArea><Position><IfcAxis2Placement3D ref="i4" xsi:nil="true"/></Position><ExtrudedDirection><IfcDirection ref="i28" xsi:nil="true"/></ExtrudedDirection><Depth>2.8</Depth></IfcExtrudedAreaSolid>
    <IfcShapeRepresentation id="i30"><ContextOfItems><IfcGeometricRepresentationContext ref="i5" xsi:nil="true"/></ContextOfItems><RepresentationIdentifier>Body</RepresentationIdentifier><RepresentationType>SweptSolid</RepresentationType><Items ex:cType="set"><IfcExtrudedAreaSolid ref="i29" xsi:nil="true" pos="0"/></Items></IfcShapeRepresentation>
    <IfcProductDefinitionShape id="i31"><Representations ex:cType="list"><IfcShapeRepresentation ref="i30" xsi:nil="true" pos="0"/></Representations></IfcProductDefinitionShape>
    <IfcLocalPlacement id="i32"><PlacementRelTo><IfcLocalPlacement ref="i17" xsi:nil="true"/></PlacementRelTo><RelativePlacement><IfcAxis2Placement3D ref="i4" xsi:nil="true"/></RelativePlacement></IfcLocalPlacement>
    <IfcWallStandardCase id="i33"><GlobalId>6YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>Upper wall</Name><ObjectPlacement><IfcLocalPlacement ref="i32" xsi:nil="true"/></ObjectPlacement><Representation><IfcProductDefinitionShape ref="i31" xsi:nil="true"/></Representation></IfcWallStandardCase>
    <IfcPropertySingleValue id="i34"><Name>FireRating</Name><NominalValue><IfcLabel>REI 60</IfcLabel></NominalValue></IfcPropertySingleValue>
    <IfcPropertySingleValue id="i35"><Name>IsExternal</Name><NominalValue><IfcBoolean>true</IfcBoolean></NominalValue></IfcPropertySingleValue>
    <IfcPropertySet id="i36"><GlobalId>7YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><Name>Pset_WallCommon</Name><HasProperties ex:cType="set"><IfcPropertySingleValue ref="i34" xsi:nil="true" pos="0"/><IfcPropertySingleValue ref="i35" xsi:nil="true" pos="1"/></HasProperties></IfcPropertySet>
    <IfcRelDefinesByProperties id="i37"><GlobalId>8YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><RelatedObjects ex:cType="set"><IfcWallStandardCase ref="i33" xsi:nil="true" pos="0"/></RelatedObjects><RelatingPropertyDefinition><IfcPropertySet ref="i36" xsi:nil="true"/></RelatingPropertyDefinition></IfcRelDefinesByProperties>
    <IfcRelContainedInSpatialStructure id="i38"><GlobalId>9YvctVUKr0kugbFTf53O9L</GlobalId><OwnerHistory><IfcOwnerHistory ref="i10" xsi:nil="true"/></OwnerHistory><RelatedElements ex:cType="set"><IfcWallStandardCase ref="i33" xsi:nil="true" pos="0"/></RelatedElements><RelatingStructure><IfcBuildingStorey ref="i19" xsi:nil="true"/></RelatingStructure></IfcRelContainedInSpatialStructure>
  </uos>
</ex:iso_10303_28>
`;
