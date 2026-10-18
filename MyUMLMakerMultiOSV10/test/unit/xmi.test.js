// XMI 2.x interchange: the sample project out to XMI and back (Enterprise
// Architect flavour with its diagram extension, and model only), hand-written
// files as Enterprise Architect 2.1, MagicDraw (UML DI) and Papyrus write them,
// and broken input (warnings, never an exception).
import assert from 'node:assert/strict';
import test from 'node:test';
import { exportXmi, importXmi, multiplicityText, parseGeometry, parseMultiplicity, readXmi } from '../../src/domain/interop/xmi.js';
import { parseXml, writeXml, x } from '../../src/domain/interop/xml.js';
import { buildSample } from '../../src/domain/templates.js';
import { isOpenableFileName, isXmiFileName, normalizeProject } from '../../src/domain/format.js';
import * as M from '../../src/domain/model.js';

// ───────────────────────── helpers

/** Elements of the UML part of a project: UML types under UML owners (relationships: both ends too). */
const NOT_IN_XMI = new Set(['UMLTimeSegment', 'UMLTimeTick', 'UMLContainment', 'UMLAssociationEnd', 'UMLTag', 'UMLTemplateParameter', 'UMLAssociationClassLink', 'UMLTemplateBinding', 'UMLCollaborationUse', 'UMLEndpoint', 'UMLGate']);
function umlPart(project) {
  const index = M.buildIndex(project);
  const ok = new Set();
  M.walk(project, (el, parent) => {
    if (el._type === 'Project') return;
    if (!/^UML/.test(el._type) || NOT_IN_XMI.has(el._type) || (parent && parent._type !== 'Project' && !ok.has(parent._id))) return false;
    if (!M.isDiagram(el)) ok.add(el._id);
  });
  for (const id of [...ok]) { const el = index.get(id); if (M.isRelationship(el) && M.relationshipEnds(el).some((end) => !ok.has(end))) ok.delete(id); }
  return [...ok].map((id) => index.get(id));
}
const countByType = (list) => { const out = {}; for (const el of list) out[el._type] = (out[el._type] ?? 0) + 1; return out; };
const find = (project, test) => M.elementsWhere(project, test)[0] ?? null;
const named = (project, type, name) => find(project, (e) => e._type === type && e.name === name);
const umlDiagrams = (project) => M.allDiagrams(project).filter((d) => /^UML/.test(d._type));
/** Node views of a diagram as "ViewType@left,top" (elements the XMI can carry). */
const positions = (diagram, project) => {
  const index = M.buildIndex(project);
  const kept = new Set(umlPart(project).map((e) => e._id));
  return diagram.ownedViews.filter((v) => !M.isEdgeView(v) && (v._type === 'UMLNoteView' || (v.model && kept.has(M.refId(v.model)) && index.get(v.model))))
    .map((v) => `${v._type}@${v.left},${v.top}`).sort();
};
const typeName = (project, value) => (value && typeof value === 'object' ? M.findById(project, value)?.name ?? '?' : value ?? '');

// ───────────────────────── small parts

test('multiplicities and EA geometry are read and written', () => {
  assert.deepEqual(parseMultiplicity('0..*'), { lower: '0', upper: '*' });
  assert.deepEqual(parseMultiplicity('*'), { lower: '0', upper: '*' });
  assert.deepEqual(parseMultiplicity('1'), { lower: '1', upper: '1' });
  assert.deepEqual(parseMultiplicity('2..5'), { lower: '2', upper: '5' });
  assert.equal(parseMultiplicity('many'), null);
  assert.equal(multiplicityText('0', '-1'), '0..*');
  assert.equal(multiplicityText('1', '1'), '1');
  assert.equal(multiplicityText(undefined, '*'), '0..*');
  assert.equal(multiplicityText(undefined, undefined), '');
  assert.deepEqual(parseGeometry('Left=10;Top=20;Right=110;Bottom=80;'), { Left: '10', Top: '20', Right: '110', Bottom: '80' });
});

test('the XML reader handles entities, CDATA, comments and namespaces and the writer escapes', () => {
  const { root, warnings } = parseXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- c --><a:r x="1 &amp; 2" y=\'&#x41;\'><b>t&lt;u<![CDATA[<raw>]]></b><c/></a:r>');
  assert.deepEqual(warnings, []);
  assert.equal(root.name, 'a:r');
  assert.equal(root.attrs.x, '1 & 2');
  assert.equal(root.attrs.y, 'A');
  assert.equal(root.children[0].text, 't<u<raw>');
  const out = writeXml(x('n', { v: 'a"<b>\n' }, x('m', { skip: undefined, no: false })));
  assert.equal(out, '<n v="a&quot;&lt;b&gt;&#10;">\n\t<m/>\n</n>');
  assert.equal(parseXml(out).root.attrs.v, 'a"<b>\n');
});

test('.xmi, .xml and .uml files open as projects', () => {
  assert.ok(isXmiFileName('model.XMI') && isXmiFileName('a.xml') && isXmiFileName('papyrus.uml') && !isXmiFileName('a.mdj'));
  assert.ok(isOpenableFileName('model.xmi'));
});

// ───────────────────────── the sample project, out and back

test('the sample project goes to EA-flavoured XMI and back with the same model and diagrams', () => {
  const original = buildSample('en');
  const xmi = exportXmi(original);
  assert.match(xmi, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<xmi:XMI xmlns:xmi="http:\/\/www.omg.org\/spec\/XMI\/20131001" xmlns:uml="http:\/\/www.omg.org\/spec\/UML\/20161101"/);
  assert.match(xmi, /<xmi:Extension extender="Enterprise Architect" extenderID="6.5">/);
  assert.match(xmi, /geometry="Left=\d+;Top=\d+;Right=\d+;Bottom=\d+;"/);
  assert.match(xmi, /<ShopProfile:Controller xmi:id="[^"]+" base_Class="EAID_/);
  assert.match(xmi, /<lowerValue xmi:type="uml:LiteralInteger" xmi:id="[^"]+" value="0"\/>/);
  assert.match(xmi, /href="http:\/\/www.omg.org\/spec\/UML\/20161101\/PrimitiveTypes.xmi#String"/);
  assert.ok(!/ERDEntity|BPMN|C4Person/.test(xmi), 'non-UML notations stay out');
  assert.doesNotThrow(() => parseXml(xmi));
  assert.deepEqual(parseXml(xmi).warnings, []);

  const { project, warnings } = readXmi(xmi);
  normalizeProject(project);
  assert.deepEqual(warnings, []);
  assert.equal(project.name, original.name);
  assert.equal(project.documentation, original.documentation);

  // Same packages, classifiers, features and relationships.
  const before = countByType(umlPart(original));
  const after = countByType(umlPart(project));
  for (const type of new Set([...Object.keys(before), ...Object.keys(after)])) assert.equal(after[type], before[type], `${type}: ${before[type]} → ${after[type]}`);
  for (const type of ['UMLPackage', 'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLAttribute', 'UMLOperation', 'UMLParameter', 'UMLAssociation', 'UMLGeneralization', 'UMLInterfaceRealization', 'UMLDependency', 'UMLInclude', 'UMLExtend', 'UMLTransition', 'UMLMessage', 'UMLControlFlow']) {
    assert.ok(after[type] > 0, `${type} present`);
  }

  // Details.
  const order = named(project, 'UMLClass', 'Order');
  assert.equal(order.documentation, 'What a customer ordered at one time');
  const status = order.attributes.find((a) => a.name === 'status');
  assert.equal(typeName(project, status.type), 'OrderStatus');
  assert.equal(typeof status.type, 'object', 'a classifier type stays a reference');
  assert.equal(status.defaultValue, 'NEW');
  assert.equal(status.visibility, 'private');
  assert.equal(order.attributes.find((a) => a.name === 'id').type, 'long');
  assert.equal(named(project, 'UMLEnumeration', 'OrderStatus').literals.map((l) => l.name).join(','), 'NEW,PAID,SHIPPED,CANCELLED');
  assert.ok(named(project, 'UMLClass', 'Product').isAbstract);
  const total = order.operations.find((o) => o.name === 'total');
  assert.ok(total.isQuery);
  assert.equal(total.parameters[0].direction, 'return');
  assert.equal(typeName(project, total.parameters[0].type), 'Money');
  const customerOrder = find(project, (e) => e._type === 'UMLAssociation' && typeName(project, e.end1.reference) === 'Customer' && typeName(project, e.end2.reference) === 'Order');
  assert.equal(customerOrder.end2.multiplicity, '0..*');
  assert.equal(customerOrder.end2.name, 'orders');
  assert.equal(customerOrder.end2.navigable, 'navigable');
  assert.equal(customerOrder.end1.multiplicity, '1');
  const composition = find(project, (e) => e._type === 'UMLAssociation' && typeName(project, e.end1.reference) === 'Order' && typeName(project, e.end2.reference) === 'OrderLine');
  assert.equal(composition.end1.aggregation, 'composite', 'the diamond stays at the whole');
  assert.equal(composition.end2.aggregation, 'none');
  const controller = named(project, 'UMLClass', 'OrderController');
  assert.equal(typeName(project, controller.stereotype), 'Controller');
  assert.equal(M.findById(project, controller.stereotype)?._type, 'UMLStereotype');
  const book = named(project, 'UMLClass', 'Book');
  assert.ok(book.ownedElements.some((g) => g._type === 'UMLGeneralization' && typeName(project, g.target) === 'Product'));
  const paid = named(project, 'UMLState', 'PAID');
  assert.equal(paid.entryActivity, 'reserveStock()');
  const pay = find(project, (e) => e._type === 'UMLTransition' && e.triggers === 'pay');
  assert.equal(pay.guard, 'amount > 0');
  assert.ok(find(project, (e) => e._type === 'UMLExtension'));
  assert.ok(find(project, (e) => e._type === 'UMLTimingLifeline' && /Idle/.test(e.states)));

  // Same diagrams with the views where they were.
  const originals = umlDiagrams(original);
  const imported = umlDiagrams(project);
  assert.equal(imported.length, originals.length);
  assert.equal(imported.filter((d) => d.defaultDiagram).length, 1);
  for (const d of originals) {
    const back = imported.find((i) => i._type === d._type && i.name === d.name);
    assert.ok(back, `diagram ${d.name}`);
    assert.deepEqual(positions(back, project), positions(d, original), `views of ${d.name}`);
    const edges = (diagram) => diagram.ownedViews.filter(M.isEdgeView).length;
    assert.equal(edges(back), edges(d), `lines of ${d.name}`);
    assert.equal(M.ownerOf(project, back._id)?._type, M.ownerOf(original, d._id)?._type, `owner of ${d.name}`);
  }
  // Message order and position on the sequence diagram.
  const seq = (p) => M.allDiagrams(p).find((d) => d._type === 'UMLSequenceDiagram');
  assert.deepEqual(seq(project).ownedViews.filter((v) => v._type === 'UMLMessageView').map((v) => v.y), seq(original).ownedViews.filter((v) => v._type === 'UMLMessageView').map((v) => v.y));
  // A note keeps its text.
  const note = (p) => M.allDiagrams(p).find((d) => d.name === 'Domain Classes').ownedViews.find((v) => v._type === 'UMLNoteView');
  assert.equal(note(project).text, note(original).text);
});

test('the Korean sample and a second export give the same file shape (stable ids)', () => {
  const sample = buildSample('ko');
  const once = exportXmi(sample);
  assert.equal(exportXmi(sample), once, 'the same project gives the same text');
  const again = importXmi(once);
  normalizeProject(again);
  assert.equal(again.name, sample.name);
  assert.equal(umlDiagrams(again).length, umlDiagrams(sample).length);
  // Exporting what was read keeps the elements' EA ids.
  const second = exportXmi(again);
  const ids = (text) => new Map([...text.matchAll(/<packagedElement xmi:type="uml:(?:Class|Interface|Package|Model)" xmi:id="(EA(?:ID|PK)_[^"]+)" name="([^"]+)"/g)].map((m) => [m[2], m[1]]));
  const first = ids(once);
  const next = ids(second);
  assert.ok(first.size > 10);
  for (const [name, value] of first) assert.equal(next.get(name), value, name);
});

test('model-only XMI has no diagrams; reading it lays out a class diagram per package', () => {
  const original = buildSample('en');
  const xmi = exportXmi(original, { flavor: 'plain' });
  assert.ok(!xmi.includes('Enterprise Architect') && !xmi.includes('EAnone_'));
  assert.match(xmi, /xmi:id="MUMLTYPES" name="Types"/);
  const { project, warnings } = readXmi(xmi);
  normalizeProject(project);
  assert.ok(warnings.some((w) => /no diagrams/.test(w)));
  const before = countByType(umlPart(original));
  const after = countByType(umlPart(project));
  for (const type of ['UMLClass', 'UMLInterface', 'UMLAttribute', 'UMLOperation', 'UMLAssociation', 'UMLGeneralization']) assert.equal(after[type], before[type], type);
  assert.ok(!named(project, 'UMLPackage', 'Types') && !named(project, 'UMLModel', 'Types'), 'the helper type package is not a package');
  assert.equal(named(project, 'UMLClass', 'Customer').attributes.find((a) => a.name === 'id').type, 'long');
  const diagrams = M.allDiagrams(project);
  assert.ok(diagrams.length >= 3);
  assert.ok(diagrams.every((d) => d._type === 'UMLClassDiagram'));
  const domain = diagrams.find((d) => d.name === 'domain');
  const nodes = domain.ownedViews.filter((v) => !M.isEdgeView(v));
  assert.ok(nodes.length >= 8);
  assert.equal(new Set(nodes.map((v) => `${v.left},${v.top}`)).size, nodes.length, 'laid out: no two views in one place');
  assert.ok(domain.ownedViews.some((v) => v._type === 'UMLGeneralizationView'), 'relationships are drawn');
});

// ───────────────────────── other tools' files

const EA_21 = `<?xml version="1.0" encoding="windows-1252"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:thecustomprofile="http://www.sparxsystems.com/profiles/thecustomprofile/1.0">
	<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>
	<uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">
		<packagedElement xmi:type="uml:Package" xmi:id="EAPK_11111111_1111_1111_1111_111111111111" name="Bank" visibility="public">
			<packagedElement xmi:type="uml:Class" xmi:id="EAID_A0000000_0000_0000_0000_000000000001" name="Account" visibility="public" isAbstract="true">
				<ownedComment xmi:type="uml:Comment" xmi:id="EAID_C0000000_0000_0000_0000_000000000001" body="An account of a customer.">
					<annotatedElement xmi:idref="EAID_A0000000_0000_0000_0000_000000000001"/>
				</ownedComment>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_P0000000_0000_0000_0000_000000000001" name="balance" visibility="private" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false">
					<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI000001" value="1"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_LI000002" value="1"/>
					<type xmi:idref="EAJava_double"/>
				</ownedAttribute>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_dst000000_0000_0000_0000_000000000001" name="owner" visibility="public" association="EAID_S0000000_0000_0000_0000_000000000001" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false" aggregation="none">
					<type xmi:idref="EAID_A0000000_0000_0000_0000_000000000003"/>
					<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI000003" value="1"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_LI000004" value="1"/>
				</ownedAttribute>
				<ownedOperation xmi:id="EAID_O0000000_0000_0000_0000_000000000001" name="deposit" visibility="public" concurrency="sequential">
					<ownedParameter xmi:id="EAID_R0000000_0000_0000_0000_000000000001" name="amount" direction="in" isStream="false" isException="false" isOrdered="false" isUnique="true">
						<type xmi:idref="EAJava_double"/>
					</ownedParameter>
					<ownedParameter xmi:id="EAID_R0000000_0000_0000_0000_000000000002" name="return" direction="return">
						<type xmi:idref="EAJava_boolean"/>
					</ownedParameter>
				</ownedOperation>
				<interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="EAID_IR000000_0000_0000_0000_000000000001" supplier="EAID_A0000000_0000_0000_0000_000000000004" implementingClassifier="EAID_A0000000_0000_0000_0000_000000000001" contract="EAID_A0000000_0000_0000_0000_000000000004"/>
			</packagedElement>
			<packagedElement xmi:type="uml:Class" xmi:id="EAID_A0000000_0000_0000_0000_000000000002" name="Savings" visibility="public">
				<generalization xmi:type="uml:Generalization" xmi:id="EAID_G0000000_0000_0000_0000_000000000001" general="EAID_A0000000_0000_0000_0000_000000000001"/>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_P0000000_0000_0000_0000_000000000002" name="rate" visibility="private">
					<type xmi:idref="EAnone_Percent"/>
				</ownedAttribute>
			</packagedElement>
			<packagedElement xmi:type="uml:Class" xmi:id="EAID_A0000000_0000_0000_0000_000000000003" name="Customer" visibility="public">
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_P0000000_0000_0000_0000_000000000003" name="bank" visibility="private">
					<type xmi:idref="EAID_STUB0000_0000_0000_0000_000000000001"/>
				</ownedAttribute>
			</packagedElement>
			<packagedElement xmi:type="uml:Interface" xmi:id="EAID_A0000000_0000_0000_0000_000000000004" name="Auditable" visibility="public" isAbstract="true"/>
			<packagedElement xmi:type="uml:Enumeration" xmi:id="EAID_A0000000_0000_0000_0000_000000000005" name="Currency" visibility="public">
				<ownedLiteral xmi:type="uml:EnumerationLiteral" xmi:id="EAID_L0000001" name="EUR"/>
				<ownedLiteral xmi:type="uml:EnumerationLiteral" xmi:id="EAID_L0000002" name="KRW"/>
			</packagedElement>
			<packagedElement xmi:type="uml:Association" xmi:id="EAID_S0000000_0000_0000_0000_000000000001" visibility="public">
				<memberEnd xmi:idref="EAID_dst000000_0000_0000_0000_000000000001"/>
				<memberEnd xmi:idref="EAID_src000000_0000_0000_0000_000000000001"/>
				<ownedEnd xmi:type="uml:Property" xmi:id="EAID_src000000_0000_0000_0000_000000000001" visibility="public" association="EAID_S0000000_0000_0000_0000_000000000001" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false" aggregation="none">
					<type xmi:idref="EAID_A0000000_0000_0000_0000_000000000001"/>
					<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI000005" value="0"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_LI000006" value="-1"/>
				</ownedEnd>
			</packagedElement>
			<packagedElement xmi:type="uml:Dependency" xmi:id="EAID_D0000000_0000_0000_0000_000000000001" visibility="public" supplier="EAID_STUB0000_0000_0000_0000_000000000001" client="EAID_A0000000_0000_0000_0000_000000000003"/>
			<packagedElement xmi:type="uml:Usage" xmi:id="EAID_U0000000_0000_0000_0000_000000000001" visibility="public" supplier="EAID_A0000000_0000_0000_0000_000000000005" client="EAID_A0000000_0000_0000_0000_000000000001"/>
			<packagedElement xmi:type="uml:Requirement" xmi:id="EAID_X0000000_0000_0000_0000_000000000001" name="Mystery"/>
			<ownedComment xmi:type="uml:Comment" xmi:id="EAID_N0000000_0000_0000_0000_000000000001" body="Accounts are audited yearly.">
				<annotatedElement xmi:idref="EAID_A0000000_0000_0000_0000_000000000001"/>
			</ownedComment>
		</packagedElement>
	</uml:Model>
	<thecustomprofile:entity base_Class="EAID_A0000000_0000_0000_0000_000000000003"/>
	<xmi:Extension extender="Enterprise Architect" extenderID="6.5">
		<elements>
			<element xmi:idref="EAID_A0000000_0000_0000_0000_000000000001" xmi:type="uml:Class" name="Account" scope="public">
				<model package="EAPK_11111111_1111_1111_1111_111111111111" tpos="0" ea_localid="1" ea_eleType="element"/>
				<properties documentation="An account of a customer." isSpecification="false" sType="Class" nType="0" scope="public" isRoot="false" isLeaf="false" isAbstract="true" isActive="false"/>
				<tags>
					<tag xmi:id="EAID_T0000001" name="author" value="Kim" modelElement="EAID_A0000000_0000_0000_0000_000000000001"/>
				</tags>
			</element>
			<element xmi:idref="EAID_A0000000_0000_0000_0000_000000000002" xmi:type="uml:Class" name="Savings" scope="public">
				<properties documentation="Earns interest." sType="Class" stereotype="product"/>
			</element>
			<element xmi:idref="EAID_N0000000_0000_0000_0000_000000000001" xmi:type="uml:Note" scope="public">
				<properties documentation="Accounts are audited yearly." sType="Note"/>
			</element>
		</elements>
		<connectors>
			<connector xmi:idref="EAID_S0000000_0000_0000_0000_000000000001">
				<source xmi:idref="EAID_A0000000_0000_0000_0000_000000000001"><model ea_localid="1" type="Class" name="Account"/></source>
				<target xmi:idref="EAID_A0000000_0000_0000_0000_000000000003"><model ea_localid="3" type="Class" name="Customer"/></target>
				<properties ea_type="Association" direction="Source -&gt; Destination"/>
			</connector>
			<connector xmi:idref="EAID_NL000000_0000_0000_0000_000000000001">
				<source xmi:idref="EAID_N0000000_0000_0000_0000_000000000001"/>
				<target xmi:idref="EAID_A0000000_0000_0000_0000_000000000001"/>
				<properties ea_type="NoteLink" direction="Source -&gt; Destination"/>
			</connector>
		</connectors>
		<diagrams>
			<diagram xmi:id="EAID_DG000000_0000_0000_0000_000000000001">
				<model package="EAPK_11111111_1111_1111_1111_111111111111" localID="3" owner="EAPK_11111111_1111_1111_1111_111111111111"/>
				<properties name="Bank Classes" type="Logical" documentation="The accounts."/>
				<project author="kim" version="1.0" created="2024-01-01 10:00:00" modified="2024-01-01 10:00:00"/>
				<style1 value="ShowPrivate=1;ShowProtected=1;ShowPublic=1;"/>
				<swimlanes value="locked=false;orientation=0;width=0;inbar=false;names=false;color=-1;bold=false;fcol=0;tcol=-1;ofCol=-1;ufCol=-1;hl=1;ufh=0;hh=0;cls=0;bw=0;hli=0;"/>
				<matrixitems value="locked=false;matrixactive=false;swimlanesactive=true;width=1;"/>
				<extendedProperties/>
				<elements>
					<element geometry="Left=100;Top=50;Right=210;Bottom=150;" subject="EAID_A0000000_0000_0000_0000_000000000001" seqno="1" style="DUID=AAAA0001;"/>
					<element geometry="Left=400;Top=50;Right=510;Bottom=130;" subject="EAID_A0000000_0000_0000_0000_000000000003" seqno="2" style="DUID=AAAA0002;"/>
					<element geometry="Left=100;Top=250;Right=210;Bottom=330;" subject="EAID_A0000000_0000_0000_0000_000000000002" seqno="3" style="DUID=AAAA0003;"/>
					<element geometry="Left=300;Top=-300;Right=450;Bottom=-360;" subject="EAID_N0000000_0000_0000_0000_000000000001" seqno="4" style="DUID=AAAA0004;"/>
					<element geometry="Left=600;Top=50;Right=700;Bottom=100;" subject="EAID_GONE0000_0000_0000_0000_000000000001" seqno="5" style="DUID=AAAA0005;"/>
					<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="EAID_S0000000_0000_0000_0000_000000000001" style="Mode=3;EOID=AAAA0002;SOID=AAAA0001;Color=-1;LWidth=0;"/>
					<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=1;Path=155:200$155:180$;" subject="EAID_G0000000_0000_0000_0000_000000000001" style="Mode=3;EOID=AAAA0001;SOID=AAAA0003;Color=-1;LWidth=0;"/>
					<element geometry="SX=0;SY=0;EX=0;EY=0;" subject="EAID_NL000000_0000_0000_0000_000000000001" style="Mode=3;EOID=AAAA0001;SOID=AAAA0004;"/>
				</elements>
			</diagram>
		</diagrams>
	</xmi:Extension>
	<EAStub xmi:id="EAID_STUB0000_0000_0000_0000_000000000001" name="BankCore" UMLType="Class"/>
</xmi:XMI>
`;

test('an Enterprise Architect 2.1 export is read with its diagram, stubs, tags and notes', () => {
  const { project, warnings } = readXmi(EA_21);
  normalizeProject(project);
  assert.equal(project.name, 'EA_Model');
  const bank = project.ownedElements.find((e) => e.name === 'Bank');
  assert.equal(bank?._type, 'UMLModel', 'a top-level package becomes a model');
  const account = named(project, 'UMLClass', 'Account');
  assert.ok(account.isAbstract);
  assert.equal(account.documentation, 'An account of a customer.', 'EA documentation is not doubled');
  assert.equal(account.tags.find((t) => t.name === 'author')?.value, 'Kim');
  const balance = account.attributes.find((a) => a.name === 'balance');
  assert.equal(balance.type, 'double', 'EAJava_double → double');
  assert.equal(balance.multiplicity, '', 'EA\'s default 1..1 is no multiplicity');
  assert.equal(balance.visibility, 'private');
  assert.equal(account.attributes.length, 1, 'a navigable association end is not an attribute');
  const deposit = account.operations[0];
  assert.deepEqual(deposit.parameters.map((p) => [p.name, p.direction, p.type]), [['amount', 'in', 'double'], ['return', 'return', 'boolean']]);
  assert.equal(named(project, 'UMLClass', 'Savings').attributes[0].type, 'Percent', 'EAnone_ prefix dropped');
  assert.equal(named(project, 'UMLClass', 'Savings').stereotype, 'product', 'stereotype from the EA extension');
  assert.equal(named(project, 'UMLClass', 'Savings').documentation, 'Earns interest.');
  const customer = named(project, 'UMLClass', 'Customer');
  assert.equal(customer.attributes[0].type, 'BankCore', 'EAStub name');
  assert.equal(customer.stereotype, 'entity', 'thecustomprofile stereotype');
  assert.deepEqual(named(project, 'UMLEnumeration', 'Currency').literals.map((l) => l.name), ['EUR', 'KRW']);
  const gen = find(project, (e) => e._type === 'UMLGeneralization');
  assert.equal(typeName(project, gen.source), 'Savings');
  assert.equal(typeName(project, gen.target), 'Account');
  const ir = find(project, (e) => e._type === 'UMLInterfaceRealization');
  assert.equal(typeName(project, ir.source), 'Account');
  assert.equal(typeName(project, ir.target), 'Auditable');
  assert.ok(find(project, (e) => e._type === 'UMLUsage'));
  const assoc = find(project, (e) => e._type === 'UMLAssociation');
  const ends = [assoc.end1, assoc.end2];
  const toCustomer = ends.find((e) => typeName(project, e.reference) === 'Customer');
  const toAccount = ends.find((e) => typeName(project, e.reference) === 'Account');
  assert.equal(toCustomer.name, 'owner');
  assert.equal(toCustomer.navigable, 'navigable');
  assert.equal(toCustomer.multiplicity, '1');
  assert.equal(toAccount.multiplicity, '0..*', 'value -1 is *');
  assert.equal(toAccount.navigable, 'unspecified');
  // The dependency on a stub and the unknown element are reported, not fatal.
  assert.ok(!find(project, (e) => e._type === 'UMLDependency'));
  assert.ok(warnings.some((w) => /Dependency/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some((w) => /Requirement/.test(w)));
  // The diagram.
  const diagrams = M.allDiagrams(project);
  assert.equal(diagrams.length, 1);
  const d = diagrams[0];
  assert.equal(d._type, 'UMLClassDiagram');
  assert.equal(d.name, 'Bank Classes');
  assert.equal(d.documentation, 'The accounts.');
  assert.equal(M.ownerOf(project, d._id), bank);
  const view = (name) => d.ownedViews.find((v) => !M.isEdgeView(v) && M.findById(project, v.model)?.name === name);
  assert.deepEqual([view('Account').left, view('Account').top, view('Account').width, view('Account').height], [100, 50, 110, 100]);
  assert.deepEqual([view('Customer').left, view('Customer').top], [400, 50]);
  assert.deepEqual([view('Savings').left, view('Savings').top], [100, 250]);
  const note = d.ownedViews.find((v) => v._type === 'UMLNoteView');
  assert.equal(note.text, 'Accounts are audited yearly.');
  assert.deepEqual([note.left, note.top, note.width, note.height], [300, 300, 150, 60], 'negative EA coordinates are read too');
  assert.ok(warnings.some((w) => /without a model element/.test(w)));
  const edge = (type) => d.ownedViews.find((v) => v._type === type);
  assert.equal(M.refId(edge('UMLAssociationView').tail), view('Account')._id);
  assert.equal(M.refId(edge('UMLAssociationView').head), view('Customer')._id);
  assert.equal(M.refId(edge('UMLGeneralizationView').tail), view('Savings')._id);
  assert.deepEqual(edge('UMLGeneralizationView').points, [{ x: 155, y: 200 }, { x: 155, y: 180 }]);
  assert.equal(M.refId(edge('UMLNoteLinkView').tail), note._id);
  assert.equal(M.refId(edge('UMLNoteLinkView').head), view('Account')._id);
  assert.equal(d.ownedViews.filter(M.isEdgeView).length, 3);
});

const MAGICDRAW = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001" xmlns:umldi="http://www.omg.org/spec/UML/20131001/UMLDI" xmlns:dc="http://www.omg.org/spec/UML/20131001/UMLDC" xmlns:StandardProfile="http://www.omg.org/spec/UML/20131001/StandardProfile">
	<xmi:Documentation><xmi:exporter>MagicDraw Clean XMI Exporter</xmi:exporter><xmi:exporterVersion>19.0</xmi:exporterVersion></xmi:Documentation>
	<uml:Model xmi:type="uml:Model" xmi:id="eee_1045467100313_135436_1" name="Data">
		<packagedElement xmi:type="uml:Package" xmi:id="_19_0_pkg" name="Shop">
			<packagedElement xmi:type="uml:Class" xmi:id="_19_0_cart" name="Cart">
				<ownedAttribute xmi:type="uml:Property" xmi:id="_19_0_items" name="items" visibility="private" aggregation="composite" association="_19_0_a1">
					<type xmi:idref="_19_0_item"/>
					<lowerValue xmi:type="uml:LiteralInteger" xmi:id="_19_0_l1"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="_19_0_u1" value="*"/>
				</ownedAttribute>
				<ownedAttribute xmi:type="uml:Property" xmi:id="_19_0_total" name="total">
					<type href="http://www.omg.org/spec/UML/20131001/PrimitiveTypes.xmi#Real"/>
					<defaultValue xmi:type="uml:LiteralReal" xmi:id="_19_0_dv" value="0.0"/>
				</ownedAttribute>
				<ownedOperation xmi:type="uml:Operation" xmi:id="_19_0_add" name="add">
					<ownedParameter xmi:type="uml:Parameter" xmi:id="_19_0_p" name="item" type="_19_0_item"/>
				</ownedOperation>
			</packagedElement>
			<packagedElement xmi:type="uml:Class" xmi:id="_19_0_item" name="Item"/>
			<packagedElement xmi:type="uml:Association" xmi:id="_19_0_a1" memberEnd="_19_0_items _19_0_cartEnd">
				<ownedEnd xmi:type="uml:Property" xmi:id="_19_0_cartEnd" type="_19_0_cart" association="_19_0_a1"/>
			</packagedElement>
			<packagedElement xmi:type="uml:Usage" xmi:id="_19_0_use" client="_19_0_cart" supplier="_19_0_item"/>
		</packagedElement>
	</uml:Model>
	<StandardProfile:Entity xmi:id="_19_0_st1" base_Class="_19_0_item"/>
	<umldi:UMLClassDiagram xmi:id="_19_0_d1" name="Shop Overview" isFrame="false">
		<modelElement xmi:idref="_19_0_pkg"/>
		<ownedElement xmi:type="umldi:UMLShape" xmi:id="_19_0_s1">
			<modelElement xmi:idref="_19_0_cart"/>
			<bounds x="20" y="30" width="150" height="80"/>
			<ownedElement xmi:type="umldi:UMLCompartment" xmi:id="_19_0_s1c">
				<ownedElement xmi:type="umldi:UMLShape" xmi:id="_19_0_s1a"><modelElement xmi:idref="_19_0_total"/><bounds x="25" y="60" width="100" height="16"/></ownedElement>
			</ownedElement>
		</ownedElement>
		<ownedElement xmi:type="umldi:UMLShape" xmi:id="_19_0_s2">
			<modelElement xmi:idref="_19_0_item"/>
			<bounds x="300" y="30" width="120" height="60"/>
		</ownedElement>
		<ownedElement xmi:type="umldi:UMLEdge" xmi:id="_19_0_e1" source="_19_0_s1" target="_19_0_s2">
			<modelElement xmi:idref="_19_0_a1"/>
			<waypoint x="170" y="70"/><waypoint x="235" y="70"/><waypoint x="235" y="60"/><waypoint x="300" y="60"/>
		</ownedElement>
		<ownedElement xmi:type="umldi:UMLEdge" xmi:id="_19_0_e2" source="_19_0_s1" target="_19_0_s2">
			<modelElement xmi:idref="_19_0_use"/>
			<waypoint x="100" y="110"/><waypoint x="360" y="90"/>
		</ownedElement>
	</umldi:UMLClassDiagram>
</xmi:XMI>
`;

test('a MagicDraw file with UML DI shapes is read with its diagram', () => {
  const { project, warnings } = readXmi(MAGICDRAW);
  normalizeProject(project);
  assert.equal(project.name, 'Data');
  const cart = named(project, 'UMLClass', 'Cart');
  const item = named(project, 'UMLClass', 'Item');
  assert.equal(item.stereotype, 'Entity');
  assert.equal(cart.attributes.length, 1);
  assert.equal(cart.attributes[0].type, 'Real', 'primitive type by href');
  assert.equal(cart.attributes[0].defaultValue, '0.0');
  assert.equal(typeName(project, cart.operations[0].parameters[0].type), 'Item', 'type given as an attribute');
  const assoc = find(project, (e) => e._type === 'UMLAssociation');
  assert.equal(typeName(project, assoc.end2.reference), 'Item', 'the navigable end goes last');
  assert.equal(assoc.end2.name, 'items');
  assert.equal(assoc.end2.multiplicity, '0..*');
  assert.equal(assoc.end2.navigable, 'navigable');
  assert.equal(typeName(project, assoc.end1.reference), 'Cart');
  assert.equal(assoc.end1.aggregation, 'composite', 'the diamond at the cart (the whole)');
  assert.equal(assoc.end1.navigable, 'unspecified');
  const d = M.allDiagrams(project)[0];
  assert.ok(d, warnings.join('\n'));
  assert.equal(d.name, 'Shop Overview');
  assert.equal(d._type, 'UMLClassDiagram');
  assert.equal(M.ownerOf(project, d._id).name, 'Shop');
  const nodes = d.ownedViews.filter((v) => !M.isEdgeView(v));
  assert.deepEqual(nodes.map((v) => [M.findById(project, v.model).name, v.left, v.top, v.width, v.height]), [['Cart', 20, 30, 150, 80], ['Item', 300, 30, 120, 60]], 'compartment shapes are not views');
  const line = d.ownedViews.find((v) => v._type === 'UMLAssociationView');
  assert.deepEqual(line.points, [{ x: 235, y: 70 }, { x: 235, y: 60 }]);
  assert.ok(d.ownedViews.some((v) => v._type === 'UMLUsageView'));
});

const PAPYRUS = `<?xml version="1.0" encoding="UTF-8"?>
<uml:Model xmi:version="20131001" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.eclipse.org/uml2/5.0.0/UML" xmi:id="_root" name="PapyrusModel">
  <packageImport xmi:type="uml:PackageImport" xmi:id="_pi">
    <importedPackage xmi:type="uml:Model" href="pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#_0"/>
  </packageImport>
  <packagedElement xmi:type="uml:Class" xmi:id="_animal" name="Animal" isAbstract="true">
    <ownedComment xmi:type="uml:Comment" xmi:id="_c1" annotatedElement="_animal">
      <body>Any animal of the zoo.</body>
    </ownedComment>
    <ownedAttribute xmi:id="_name" name="name" visibility="private">
      <type xmi:type="uml:PrimitiveType" href="pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#String"/>
    </ownedAttribute>
    <ownedAttribute xmi:id="_legs" name="legs">
      <type xmi:type="uml:PrimitiveType" href="pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#Integer"/>
      <lowerValue xmi:type="uml:LiteralInteger" xmi:id="_lv" value="2"/>
      <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="_uv" value="4"/>
    </ownedAttribute>
    <ownedOperation xmi:id="_speak" name="speak">
      <ownedParameter xmi:id="_ret" direction="return" type="_sound"/>
    </ownedOperation>
  </packagedElement>
  <packagedElement xmi:type="uml:Class" xmi:id="_dog" name="Dog">
    <generalization xmi:id="_g" general="_animal"/>
    <interfaceRealization xmi:id="_ir" client="_dog" supplier="_pet" contract="_pet"/>
  </packagedElement>
  <packagedElement xmi:type="uml:DataType" xmi:id="_sound" name="Sound"/>
  <packagedElement xmi:type="uml:Interface" xmi:id="_pet" name="Pet"/>
  <packagedElement xmi:type="uml:Package" xmi:id="_zoo" name="zoo">
    <packagedElement xmi:type="uml:Class" xmi:id="_keeper" name="Keeper"/>
  </packagedElement>
  <packagedElement xmi:type="uml:Usage" xmi:id="_use" client="_keeper" supplier="_animal"/>
  <packagedElement xmi:type="uml:StateMachine" xmi:id="_sm" name="Life">
    <region xmi:id="_r1" name="main">
      <subvertex xmi:type="uml:Pseudostate" xmi:id="_init"/>
      <subvertex xmi:type="uml:State" xmi:id="_alive" name="Alive">
        <entry xmi:type="uml:OpaqueBehavior" xmi:id="_eb" name="wake"><body>wakeUp()</body></entry>
      </subvertex>
      <subvertex xmi:type="uml:FinalState" xmi:id="_end"/>
      <transition xmi:id="_t1" source="_init" target="_alive"/>
      <transition xmi:id="_t2" source="_alive" target="_end" guard="_gr">
        <ownedRule xmi:type="uml:Constraint" xmi:id="_gr"><specification xmi:type="uml:OpaqueExpression" xmi:id="_gs"><body>age &gt; 20</body></specification></ownedRule>
        <trigger xmi:id="_tr" name="die"/>
      </transition>
    </region>
  </packagedElement>
</uml:Model>
`;

test('a Papyrus model without diagrams is read and gets laid-out class diagrams', () => {
  const { project, warnings } = readXmi(PAPYRUS);
  normalizeProject(project);
  assert.equal(project.name, 'PapyrusModel');
  const model = project.ownedElements[0];
  assert.equal(model._type, 'UMLModel');
  assert.equal(model.name, 'PapyrusModel');
  const animal = named(project, 'UMLClass', 'Animal');
  assert.ok(animal.isAbstract);
  assert.equal(animal.documentation, 'Any animal of the zoo.');
  assert.deepEqual(animal.attributes.map((a) => [a.name, a.type, a.multiplicity]), [['name', 'String', ''], ['legs', 'Integer', '2..4']]);
  assert.equal(typeName(project, animal.operations[0].parameters[0].type), 'Sound');
  const dog = named(project, 'UMLClass', 'Dog');
  assert.deepEqual(dog.ownedElements.map((e) => [e._type, typeName(project, e.target)]), [['UMLGeneralization', 'Animal'], ['UMLInterfaceRealization', 'Pet']]);
  assert.equal(M.ownerOf(project, named(project, 'UMLPackage', 'zoo')._id), model, 'packages stay inside the model');
  assert.ok(find(project, (e) => e._type === 'UMLUsage'));
  const alive = named(project, 'UMLState', 'Alive');
  assert.equal(alive.entryActivity, 'wakeUp()');
  const die = find(project, (e) => e._type === 'UMLTransition' && e.triggers === 'die');
  assert.equal(die.guard, 'age > 20');
  assert.equal(find(project, (e) => e._type === 'UMLPseudostate').kind, 'initial');
  // Laid-out class diagrams for the model and the zoo package.
  assert.ok(warnings.some((w) => /no diagrams/.test(w)));
  const diagrams = M.allDiagrams(project);
  assert.deepEqual(diagrams.map((d) => [d._type, d.name]).sort(), [['UMLClassDiagram', 'PapyrusModel'], ['UMLClassDiagram', 'zoo']]);
  const main = diagrams.find((d) => d.name === 'PapyrusModel');
  const nodes = main.ownedViews.filter((v) => !M.isEdgeView(v));
  assert.deepEqual(nodes.map((v) => M.findById(project, v.model).name).sort(), ['Animal', 'Dog', 'Pet', 'Sound']);
  const animalView = nodes.find((v) => M.findById(project, v.model).name === 'Animal');
  const dogView = nodes.find((v) => M.findById(project, v.model).name === 'Dog');
  assert.ok(animalView.top < dogView.top, 'the general class sits above');
  assert.ok(main.ownedViews.some((v) => v._type === 'UMLGeneralizationView'));
  assert.ok(main.ownedViews.some((v) => v._type === 'UMLInterfaceRealizationView'));
  assert.ok(main.defaultDiagram);
});

test('a Papyrus GMF notation diagram in the same file gives shapes', () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="20131001" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.eclipse.org/uml2/5.0.0/UML" xmlns:notation="http://www.eclipse.org/gmf/runtime/1.0.2/notation">
  <uml:Model xmi:id="_m" name="M"><packagedElement xmi:type="uml:Class" xmi:id="_a" name="A"/><packagedElement xmi:type="uml:Class" xmi:id="_b" name="B"><generalization xmi:id="_g" general="_a"/></packagedElement></uml:Model>
  <notation:Diagram xmi:id="_d" type="PapyrusUMLClassDiagram" name="Main" measurementUnit="Pixel">
    <children xmi:type="notation:Shape" xmi:id="_va" type="Class_Shape"><element xmi:type="uml:Class" href="m.uml#_a"/><layoutConstraint xmi:type="notation:Bounds" xmi:id="_ba" x="40" y="20" width="120" height="60"/></children>
    <children xmi:type="notation:Shape" xmi:id="_vb" type="Class_Shape" element="_b"><layoutConstraint xmi:type="notation:Bounds" xmi:id="_bb" x="40" y="200"/></children>
    <element xmi:type="uml:Model" href="m.uml#_m"/>
    <edges xmi:type="notation:Connector" xmi:id="_eg" type="Generalization_Edge" source="_vb" target="_va"><element xmi:type="uml:Generalization" href="m.uml#_g"/></edges>
  </notation:Diagram>
</xmi:XMI>`;
  const { project } = readXmi(text);
  normalizeProject(project);
  const d = M.allDiagrams(project)[0];
  assert.equal(d.name, 'Main');
  assert.deepEqual(d.ownedViews.filter((v) => !M.isEdgeView(v)).map((v) => [v.left, v.top, v.width]), [[40, 20, 120], [40, 200, 0]]);
  assert.equal(d.ownedViews.filter((v) => v._type === 'UMLGeneralizationView').length, 1);
});

// ───────────────────────── broken input

test('broken or odd input gives warnings, never an exception', () => {
  const cases = [
    '',
    'not xml at all',
    '<<<>>>&&&',
    '\u0000\u0001binary�',
    '<a><b></a></c>',
    '<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001"><uml:Model name="Cut"><packagedElement xmi:type="uml:Class" xmi:id="A" name="A"><ownedAttribute name="x" type="nowhere"',
    '<XMI xmi.version="1.2"><XMI.content><UML:Model name="old"/></XMI.content></XMI>',
    '<xmi:XMI xmlns:uml="http://www.omg.org/spec/UML/20131001"><uml:Model><packagedElement xmi:type="uml:Class" xmi:id="X"><generalization general="missing"/></packagedElement><packagedElement xmi:type="uml:Class" xmi:id="X"/><packagedElement xmi:type="uml:Association" memberEnd="p q"/><packagedElement xmi:type="uml:Interaction"><message sendEvent="s" receiveEvent="r"/></packagedElement></uml:Model><xmi:Extension extender="Enterprise Architect"><diagrams><diagram><elements><element geometry="garbage" subject="X"/><element/></elements></diagram></diagrams></xmi:Extension></xmi:XMI>',
    `${'<packagedElement xmi:type="uml:Package">'.repeat(300)}`,
  ];
  for (const text of cases) {
    let result;
    assert.doesNotThrow(() => { result = readXmi(text); }, text.slice(0, 40));
    assert.equal(result.project._type, 'Project');
    assert.ok(result.project.ownedElements.length >= 1, 'there is always a model');
    assert.doesNotThrow(() => normalizeProject(result.project));
    assert.ok(result.warnings.length > 0, `warned: ${text.slice(0, 40)}`);
  }
  const cut = readXmi(cases[5]);
  assert.ok(named(cut.project, 'UMLClass', 'A'), 'what was read before the cut is kept');
  assert.ok(cut.warnings.some((w) => /not closed|unfinished/.test(w)));
  assert.ok(readXmi(cases[6]).warnings.some((w) => /XMI 1/.test(w)));
  const odd = readXmi(cases[7]);
  assert.ok(odd.warnings.some((w) => /Duplicate id/.test(w)));
  assert.ok(odd.warnings.some((w) => /target is not in the file/.test(w)));
  assert.ok(odd.warnings.some((w) => /message/.test(w)));
  // importXmi keeps the warnings off the saved data.
  const project = importXmi('nonsense');
  assert.ok(project.warnings.length > 0);
  assert.ok(!Object.keys(project).includes('warnings'));
  assert.throws(() => exportXmi({ _type: 'Nope' }), /notProject/);
});
