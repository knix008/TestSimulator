// Code generation (codegen/*.js): one file per classifier with package →
// folder mapping, for every language — visibility, abstract/static/final,
// extends/implements, attributes with multiplicity → collections, default
// values, operations with parameters and return types, enumerations,
// navigable association ends as fields, documentation, generics — and DDL
// from ER data models in every dialect.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_LANGUAGES, DEFAULT_CODEGEN_OPTIONS, generateCode, isMany, isOptional, SQL_DIALECTS } from '../../src/domain/codegen/index.js';
import { addElement, createProject, ref } from '../../src/domain/model.js';

/** shop::model { Entity (abstract), Order : Entity, Priced; Item; Status }, shop { Priced, Box<T> }. */
function sampleProject() {
  const project = createProject({ diagram: null });
  const model = project.ownedElements[0];
  const shop = addElement(project, model._id, 'UMLPackage', { name: 'shop' });
  const pkg = addElement(project, shop._id, 'UMLPackage', { name: 'model' });
  const entity = addElement(project, pkg._id, 'UMLClass', { name: 'Entity', isAbstract: true, documentation: 'Base of all entities.' });
  addElement(project, entity._id, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'protected' });
  const describe = addElement(project, entity._id, 'UMLOperation', { name: 'describe', isAbstract: true });
  addElement(project, describe._id, 'UMLParameter', { name: '', type: 'String', direction: 'return' });
  const priced = addElement(project, shop._id, 'UMLInterface', { name: 'Priced' });
  const price = addElement(project, priced._id, 'UMLOperation', { name: 'price' });
  addElement(project, price._id, 'UMLParameter', { name: '', type: 'double', direction: 'return' });
  const item = addElement(project, pkg._id, 'UMLClass', { name: 'Item' });
  const order = addElement(project, pkg._id, 'UMLClass', { name: 'Order', documentation: 'A customer order.' });
  addElement(project, order._id, 'UMLAttribute', { name: 'count', type: 'int', defaultValue: '0', visibility: 'private' });
  addElement(project, order._id, 'UMLAttribute', { name: 'tags', type: 'String', multiplicity: '0..*', visibility: 'private' });
  addElement(project, order._id, 'UMLAttribute', { name: 'MAX', type: 'int', defaultValue: '10', isStatic: true, isReadOnly: true });
  addElement(project, order._id, 'UMLAttribute', { name: 'note', type: 'String', multiplicity: '0..1' });
  const status = addElement(project, pkg._id, 'UMLEnumeration', { name: 'Status' });
  addElement(project, status._id, 'UMLEnumerationLiteral', { name: 'NEW' });
  addElement(project, status._id, 'UMLEnumerationLiteral', { name: 'DONE' });
  addElement(project, order._id, 'UMLAttribute', { name: 'status', type: ref(status) });
  const total = addElement(project, order._id, 'UMLOperation', { name: 'total', documentation: 'Sum of the items.' });
  addElement(project, total._id, 'UMLParameter', { name: 'discount', type: 'double' });
  addElement(project, total._id, 'UMLParameter', { name: '', type: 'double', direction: 'return' });
  addElement(project, order._id, 'UMLOperation', { name: 'Order' }); // constructor
  const find = addElement(project, order._id, 'UMLOperation', { name: 'find', isStatic: true });
  addElement(project, find._id, 'UMLParameter', { name: 'id', type: 'long' });
  addElement(project, find._id, 'UMLParameter', { name: '', type: ref(order), direction: 'return' });
  addElement(project, pkg._id, 'UMLGeneralization', { source: ref(order), target: ref(entity) });
  addElement(project, pkg._id, 'UMLInterfaceRealization', { source: ref(order), target: ref(priced) });
  // Order → items (navigable, named) ; the Order end is unnamed and unspecified → no field in Item.
  addElement(project, pkg._id, 'UMLAssociation', { end1: { reference: ref(order) }, end2: { reference: ref(item), name: 'items', multiplicity: '*', navigable: 'navigable' } });
  // Item → owner: named but unspecified navigability → a field in Item.
  addElement(project, pkg._id, 'UMLAssociation', { end1: { reference: ref(item) }, end2: { reference: ref(order), name: 'owner', multiplicity: '1' } });
  // Not navigable → no field.
  addElement(project, pkg._id, 'UMLAssociation', { end1: { reference: ref(item) }, end2: { reference: ref(entity), name: 'hidden', navigable: 'notNavigable' } });
  const box = addElement(project, shop._id, 'UMLClass', { name: 'Box' });
  addElement(project, box._id, 'UMLTemplateParameter', { name: 'T', parameterType: 'Comparable' });
  addElement(project, box._id, 'UMLAttribute', { name: 'value', type: 'T', visibility: 'private' });
  return { project, model, shop, pkg, order, item, entity, priced, status, box };
}

const fileOf = (files, path) => {
  const file = files.find((f) => f.path === path);
  assert.ok(file, `${path} in ${files.map((f) => f.path).join(', ')}`);
  return file.content;
};

test('languages and default options are listed', () => {
  assert.deepEqual(CODE_LANGUAGES.map((l) => l.id), ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php', 'sql']);
  for (const { id } of CODE_LANGUAGES) assert.equal(typeof DEFAULT_CODEGEN_OPTIONS[id].indentSpaces, 'number', id);
  assert.equal(DEFAULT_CODEGEN_OPTIONS.java.getterSetter, false);
  assert.deepEqual(SQL_DIALECTS.map((d) => d.id), ['mysql', 'postgres', 'sqlite', 'sqlserver', 'oracle']);
  assert.equal(isMany('0..*'), true);
  assert.equal(isMany('*'), true);
  assert.equal(isMany('1..5'), true);
  assert.equal(isMany('1'), false);
  assert.equal(isMany(''), false);
  assert.equal(isOptional('0..1'), true);
});

test('errors are short codes with a detail', () => {
  const { project } = sampleProject();
  assert.throws(() => generateCode(project, null, 'cobol'), (e) => e.message === 'codegen.unknownLanguage' && e.detail === 'cobol');
  assert.throws(() => generateCode(project, 'nope', 'java'), (e) => e.message === 'codegen.noElement');
});

test('a package generates its whole subtree, one file per classifier in package folders', () => {
  const { project, model, pkg, order } = sampleProject();
  const all = generateCode(project, model._id, 'java');
  assert.deepEqual(all.map((f) => f.path).sort(), ['shop/Box.java', 'shop/Priced.java', 'shop/model/Entity.java', 'shop/model/Item.java', 'shop/model/Order.java', 'shop/model/Status.java']);
  assert.equal(generateCode(project, pkg._id, 'java').length, 4);
  assert.deepEqual(generateCode(project, order._id, 'java').map((f) => f.path), ['shop/model/Order.java']);
  assert.equal(generateCode(project, null, 'java').length, 6, 'empty root = whole project');
});

test('Java: package, imports, extends/implements, fields, collections, methods, enum, generics', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'java', { getterSetter: true });
  const order = fileOf(files, 'shop/model/Order.java');
  assert.match(order, /^\/\/ Generated by MyUMLMaker/);
  assert.match(order, /^package shop\.model;$/m);
  assert.match(order, /^import java\.util\.List;$/m);
  assert.match(order, /^import shop\.Priced;$/m);
  assert.doesNotMatch(order, /import shop\.model\./, 'same package is not imported');
  assert.match(order, /\/\*\*\n \* A customer order\.\n \*\/\npublic class Order extends Entity implements Priced \{/);
  assert.match(order, /^ {4}private int count = 0;$/m);
  assert.match(order, /^ {4}private List<String> tags;$/m);
  assert.match(order, /^ {4}public static final int MAX = 10;$/m);
  assert.match(order, /^ {4}public Status status;$/m);
  assert.match(order, /^ {4}public List<Item> items;$/m, 'navigable association end as a field');
  assert.doesNotMatch(order, /owner/, 'the far end of Item.owner does not show in Order');
  assert.match(order, /^ {4}public Order\(\) \{$/m, 'constructor');
  assert.match(order, /\/\*\*\n {5}\* Sum of the items\.\n {5}\*\/\n {4}public double total\(double discount\) \{\n {8}\/\/ TODO implement\n {8}return 0\.0;\n {4}\}/);
  assert.match(order, /public static Order find\(long id\) \{/);
  assert.match(order, /public int getCount\(\) \{\n {8}return count;/);
  assert.match(order, /public void setTags\(List<String> tags\)/);
  assert.doesNotMatch(order, /setMAX|getMAX/, 'no accessors for public / static fields');
  const item = fileOf(files, 'shop/model/Item.java');
  assert.match(item, /public Order owner;/, 'unspecified-but-named end is a field');
  assert.doesNotMatch(item, /hidden/, 'not navigable end is not a field');
  const entity = fileOf(files, 'shop/model/Entity.java');
  assert.match(entity, /public abstract class Entity \{/);
  assert.match(entity, /public abstract String describe\(\);/);
  assert.match(fileOf(files, 'shop/Priced.java'), /public interface Priced \{\n {4}double price\(\);\n\}/);
  assert.match(fileOf(files, 'shop/model/Status.java'), /public enum Status \{\n {4}NEW,\n {4}DONE;\n\}/);
  assert.match(fileOf(files, 'shop/Box.java'), /public class Box<T extends Comparable> \{\n {4}private T value;/);
});

test('Java options: tabs, indent, no header, no documentation, arrays', () => {
  const { project, order } = sampleProject();
  const [file] = generateCode(project, order._id, 'java', { useTabs: true, headerComment: false, documentation: false, collection: 'array' });
  assert.match(file.content, /^package/);
  assert.match(file.content, /^\tprivate String\[\] tags;$/m);
  assert.doesNotMatch(file.content, /customer order/);
  const [two] = generateCode(project, order._id, 'java', { indentSpaces: 2 });
  assert.match(two.content, /^ {2}private int count = 0;$/m);
});

test('C#: namespace block, usings, base list, properties, XML doc', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'csharp', { getterSetter: true });
  const order = fileOf(files, 'shop/model/Order.cs');
  assert.match(order, /^using System\.Collections\.Generic;$/m);
  assert.match(order, /^namespace shop\.model\n\{$/m);
  assert.match(order, /^ {4}\/\/\/ <summary>\n {4}\/\/\/ A customer order\.\n {4}\/\/\/ <\/summary>\n {4}public class Order : Entity, Priced$/m);
  assert.match(order, /^ {8}private List<string> tags;$/m, 'String → string');
  assert.match(order, /^ {8}public static readonly int MAX = 10;$/m);
  assert.match(order, /^ {8}public List<Item> items;$/m);
  assert.match(order, /public double total\(double discount\)\n {8}\{/);
  assert.match(order, /public int Count\n {8}\{\n {12}get => count;\n {12}set => count = value;/);
  assert.match(fileOf(files, 'shop/model/Entity.cs'), /public abstract string describe\(\);/);
  assert.match(fileOf(files, 'shop/Priced.cs'), /public interface Priced\n {4}\{\n {8}double price\(\);/);
  assert.match(fileOf(files, 'shop/model/Status.cs'), /public enum Status\n {4}\{\n {8}NEW,\n {8}DONE\n {4}\}/);
  assert.match(fileOf(files, 'shop/Box.cs'), /public class Box<T> where T : Comparable/);
});

test('C++: header + source pair, guards, includes, namespaces, pure virtual, vectors', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'cpp');
  const h = fileOf(files, 'shop/model/Order.h');
  const cpp = fileOf(files, 'shop/model/Order.cpp');
  assert.match(h, /#ifndef SHOP_MODEL_ORDER_H\n#define SHOP_MODEL_ORDER_H/);
  assert.match(h, /#include <vector>/);
  assert.match(h, /#include <string>/);
  assert.match(h, /#include "Entity\.h"/);
  assert.match(h, /#include "\.\.\/Priced\.h"/);
  assert.match(h, /namespace shop \{\nnamespace model \{/);
  assert.match(h, /class Order : public Entity, public shop::Priced \{/);
  assert.match(h, /std::vector<std::string> tags;/);
  assert.match(h, /std::vector<Item\*> items;/, 'association ends are pointers');
  assert.match(h, /static const int MAX;/);
  assert.match(h, /private:\n {4}int count = 0;/);
  assert.match(cpp, /#include "Order\.h"/);
  assert.match(cpp, /const int Order::MAX = 10;/);
  assert.match(cpp, /double Order::total\(double discount\) \{/);
  assert.match(cpp, /Order::Order\(\) \{/);
  assert.match(fileOf(files, 'shop/model/Entity.h'), /virtual std::string describe\(\) = 0;/);
  assert.match(fileOf(files, 'shop/Priced.h'), /virtual ~Priced\(\) = default;\n {4}virtual double price\(\) = 0;/);
  assert.ok(!files.some((f) => f.path === 'shop/Priced.cpp'), 'interfaces are header-only');
  assert.match(fileOf(files, 'shop/model/Status.h'), /enum class Status \{\n {4}NEW,\n {4}DONE\n\};/);
  assert.match(fileOf(files, 'shop/Box.h'), /template <typename T>\nclass Box \{/);
  const [pragma] = generateCode(project, model._id, 'cpp', { pragmaOnce: true });
  assert.match(pragma.content, /#pragma once/);
});

test('Python: modules, imports, ABC, ClassVar, __init__ fields, Enum, Generic', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'python');
  const order = fileOf(files, 'shop/model/Order.py');
  assert.match(order, /^# Generated by MyUMLMaker/);
  assert.match(order, /^from shop\.model\.Entity import Entity$/m);
  assert.match(order, /^from shop\.Priced import Priced$/m);
  assert.match(order, /^class Order\(Entity, Priced\):\n {4}"""A customer order\."""/m);
  assert.match(order, /^ {4}MAX: ClassVar\[int\] = 10$/m);
  assert.match(order, /def __init__\(self\):\n {8}super\(\)\.__init__\(\)/);
  assert.match(order, /^ {8}self\.__count: int = 0$/m, 'private → __name');
  assert.match(order, /^ {8}self\.__tags: list\[str\] = \[\]$/m);
  assert.match(order, /^ {8}self\.note: Optional\[str\] = None$/m);
  assert.match(order, /^ {8}self\.items: list\[Item\] = \[\]$/m);
  assert.match(order, /def total\(self, discount: float\) -> float:\n {8}"""Sum of the items\."""\n {8}return 0\.0/);
  assert.match(order, /@staticmethod\n {4}def find\(id: int\) -> 'Order':/);
  const entity = fileOf(files, 'shop/model/Entity.py');
  assert.match(entity, /class Entity\(ABC\):/);
  assert.match(entity, /@abstractmethod\n {4}def describe\(self\) -> str:/);
  assert.match(fileOf(files, 'shop/Priced.py'), /class Priced\(ABC\):\n {4}@abstractmethod\n {4}def price\(self\) -> float:/);
  assert.match(fileOf(files, 'shop/model/Status.py'), /from enum import Enum, auto\n\nclass Status\(Enum\):\n {4}NEW = auto\(\)\n {4}DONE = auto\(\)/);
  assert.match(fileOf(files, 'shop/Box.py'), /T = TypeVar\('T', bound='Comparable'\)\n\nclass Box\(Generic\[T\]\):/);
  const [plain] = generateCode(project, model._id, 'python', { typeHints: false }).filter((f) => f.path.endsWith('Order.py'));
  assert.match(plain.content, /def total\(self, discount\):/);
});

test('TypeScript: exports, relative imports, optional and array properties', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'typescript');
  const order = fileOf(files, 'shop/model/Order.ts');
  assert.match(order, /^import \{ Priced \} from '\.\.\/Priced';$/m);
  assert.match(order, /^import \{ Entity \} from '\.\/Entity';$/m);
  assert.match(order, /^export class Order extends Entity implements Priced \{$/m);
  assert.match(order, /^ {2}private count: number = 0;$/m);
  assert.match(order, /^ {2}private tags: string\[\];$/m);
  assert.match(order, /^ {2}public static readonly MAX: number = 10;$/m);
  assert.match(order, /^ {2}public note\?: string;$/m);
  assert.match(order, /^ {2}public constructor\(\) \{\n {4}super\(\);/m);
  assert.match(order, /public total\(discount: number\): number \{/);
  assert.match(fileOf(files, 'shop/model/Entity.ts'), /export abstract class Entity \{[\s\S]*public abstract describe\(\): string;/);
  assert.match(fileOf(files, 'shop/Priced.ts'), /export interface Priced \{\n {2}price\(\): number;\n\}/);
  assert.match(fileOf(files, 'shop/model/Status.ts'), /export enum Status \{\n {2}NEW,\n {2}DONE\n\}/);
  assert.match(fileOf(files, 'shop/Box.ts'), /export class Box<T extends Comparable> \{/);
});

test('Kotlin: package, open/abstract classes, nullable, companion object, enum class', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'kotlin');
  const order = fileOf(files, 'shop/model/Order.kt');
  assert.match(order, /^package shop\.model$/m);
  assert.match(order, /^import shop\.Priced$/m);
  assert.match(order, /^open class Order : Entity\(\), Priced \{$/m);
  assert.match(order, /private var count: Int = 0/);
  assert.match(order, /private var tags: List<String> = listOf\(\)/);
  assert.match(order, /var note: String\? = null/);
  assert.match(order, /companion object \{\n {8}val MAX: Int = 10/);
  assert.match(order, /fun total\(discount: Double\): Double \{/);
  assert.match(fileOf(files, 'shop/model/Entity.kt'), /abstract class Entity \{[\s\S]*abstract fun describe\(\): String/);
  assert.match(fileOf(files, 'shop/Priced.kt'), /interface Priced \{\n {4}fun price\(\): Double\n\}/);
  assert.match(fileOf(files, 'shop/model/Status.kt'), /enum class Status \{\n {4}NEW,\n {4}DONE\n\}/);
  assert.match(fileOf(files, 'shop/Box.kt'), /class Box<T : Comparable>/);
});

test('PHP: namespace, use, typed properties, enum, interface', () => {
  const { project, model } = sampleProject();
  const files = generateCode(project, model._id, 'php');
  const order = fileOf(files, 'shop/model/Order.php');
  assert.match(order, /^<\?php/);
  assert.match(order, /^namespace shop\\model;$/m);
  assert.match(order, /^use shop\\Priced;$/m);
  assert.match(order, /^class Order extends Entity implements Priced\n\{$/m);
  assert.match(order, /private int \$count = 0;/);
  assert.match(order, /\/\*\* @var string\[\] \*\/\n {4}private array \$tags = \[\];/);
  assert.match(order, /public static int \$MAX = 10;/);
  assert.match(order, /public \?string \$note;/);
  assert.match(order, /public function __construct\(\)\n {4}\{\n {8}parent::__construct\(\);/);
  assert.match(order, /public function total\(float \$discount\): float/);
  assert.match(order, /public static function find\(int \$id\): Order/);
  assert.match(fileOf(files, 'shop/model/Entity.php'), /abstract class Entity[\s\S]*abstract public function describe\(\): string;/);
  assert.match(fileOf(files, 'shop/Priced.php'), /interface Priced\n\{[\s\S]*public function price\(\): float;/);
  assert.match(fileOf(files, 'shop/model/Status.php'), /enum Status\n\{\n {4}case NEW;\n {4}case DONE;\n\}/);
});

test('signals and data types are generated, other elements are not', () => {
  const project = createProject({ diagram: null });
  const model = project.ownedElements[0];
  addElement(project, model._id, 'UMLSignal', { name: 'Ping' });
  addElement(project, model._id, 'UMLDataType', { name: 'Point' });
  addElement(project, model._id, 'UMLActor', { name: 'User' });
  addElement(project, model._id, 'UMLPrimitiveType', { name: 'Int' });
  const files = generateCode(project, model._id, 'csharp');
  assert.deepEqual(files.map((f) => f.path), ['Ping.cs', 'Point.cs']);
  assert.match(files[1].content, /public struct Point/);
  assert.doesNotMatch(files[0].content, /namespace/, 'no package → no namespace');
});

// ───────────────────────── SQL

function erdProject() {
  const project = createProject({ diagram: null });
  const dm = addElement(project, project._id, 'ERDDataModel', { name: 'Shop' });
  const customer = addElement(project, dm._id, 'ERDEntity', { name: 'customer', documentation: 'People who buy.' });
  const cid = addElement(project, customer._id, 'ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true });
  addElement(project, customer._id, 'ERDColumn', { name: 'email', type: 'VARCHAR', length: '120', unique: true });
  addElement(project, customer._id, 'ERDColumn', { name: 'active', type: 'BOOLEAN', defaultValue: 'TRUE', nullable: true });
  // "order" is a reserved word; defined first but references customer.
  const order = addElement(project, dm._id, 'ERDEntity', { name: 'order' });
  const oid = addElement(project, order._id, 'ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true });
  addElement(project, order._id, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: ref(cid) });
  addElement(project, order._id, 'ERDColumn', { name: 'total', type: 'DECIMAL', length: '10,2', nullable: true });
  addElement(project, order._id, 'ERDColumn', { name: 'note', type: 'TEXT', nullable: true });
  const line = addElement(project, dm._id, 'ERDEntity', { name: 'order_line' });
  addElement(project, line._id, 'ERDColumn', { name: 'order_id', type: 'INTEGER', primaryKey: true, foreignKey: true, referenceTo: ref(oid) });
  addElement(project, line._id, 'ERDColumn', { name: 'no', type: 'INTEGER', primaryKey: true });
  // Move order first so that the generator has to reorder.
  dm.ownedElements.reverse();
  return { project, dm, customer, order, line };
}

test('SQL: CREATE TABLE with keys, defaults, ordering by foreign keys (MySQL)', () => {
  const { project, dm } = erdProject();
  const files = generateCode(project, dm._id, 'sql');
  assert.deepEqual(files.map((f) => f.path), ['Shop.sql']);
  const sql = files[0].content;
  assert.match(sql, /^-- Generated by MyUMLMaker/);
  assert.match(sql, /-- People who buy\.\nCREATE TABLE customer \(\n {2}id INTEGER NOT NULL,\n {2}email VARCHAR\(120\) NOT NULL UNIQUE,\n {2}active BOOLEAN DEFAULT TRUE,\n {2}CONSTRAINT pk_customer PRIMARY KEY \(id\)\n\);/);
  assert.match(sql, /CREATE TABLE `order` \(/, 'reserved word quoted');
  assert.match(sql, /total DECIMAL\(10,2\),/);
  assert.match(sql, /CONSTRAINT fk_order_customer_id FOREIGN KEY \(customer_id\) REFERENCES customer \(id\)/);
  assert.match(sql, /CONSTRAINT pk_order_line PRIMARY KEY \(order_id, no\)/);
  assert.ok(sql.indexOf('CREATE TABLE customer') < sql.indexOf('CREATE TABLE `order`'), 'referenced table first');
  assert.ok(sql.indexOf('CREATE TABLE `order`') < sql.indexOf('CREATE TABLE order_line'));
});

test('SQL dialects: quoting and type names', () => {
  const { project, dm } = erdProject();
  const of = (dialect, extra = {}) => generateCode(project, dm._id, 'sql', { dialect, ...extra })[0].content;
  assert.match(of('postgres'), /CREATE TABLE "order"/);
  assert.match(of('postgres'), /note TEXT/);
  assert.match(of('sqlserver'), /CREATE TABLE \[order\]/);
  assert.match(of('sqlserver'), /active BIT DEFAULT TRUE/);
  assert.match(of('sqlserver'), /note NVARCHAR\(MAX\)/);
  assert.match(of('oracle'), /email VARCHAR2\(120\)/);
  assert.match(of('oracle'), /note CLOB/);
  assert.match(of('sqlite'), /CREATE TABLE "order"/);
  assert.match(of('mysql', { quoteIdentifiers: true }), /CREATE TABLE `customer` \(\n {2}`id` INTEGER/);
  assert.match(of('postgres', { dropTables: true }), /^DROP TABLE IF EXISTS order_line CASCADE;\nDROP TABLE IF EXISTS "order" CASCADE;\nDROP TABLE IF EXISTS customer CASCADE;/m);
  assert.doesNotMatch(of('mysql', { foreignKeys: false }), /FOREIGN KEY/);
});

test('SQL: a foreign key cycle is added with ALTER TABLE; an entity alone gives its own script', () => {
  const project = createProject({ diagram: null });
  const dm = addElement(project, project._id, 'ERDDataModel', { name: 'Cycle' });
  const a = addElement(project, dm._id, 'ERDEntity', { name: 'a' });
  const b = addElement(project, dm._id, 'ERDEntity', { name: 'b' });
  const aid = addElement(project, a._id, 'ERDColumn', { name: 'id', type: 'INT', primaryKey: true });
  const bid = addElement(project, b._id, 'ERDColumn', { name: 'id', type: 'INT', primaryKey: true });
  addElement(project, a._id, 'ERDColumn', { name: 'b_id', type: 'INT', nullable: true, referenceTo: ref(bid) });
  addElement(project, b._id, 'ERDColumn', { name: 'a_id', type: 'INT', nullable: true, referenceTo: ref(aid) });
  const sql = generateCode(project, dm._id, 'sql')[0].content;
  assert.match(sql, /ALTER TABLE \w+ ADD CONSTRAINT fk_\w+ FOREIGN KEY/);
  assert.equal((sql.match(/FOREIGN KEY/g) ?? []).length, 2);
  const one = generateCode(project, a._id, 'sql');
  assert.equal(one.length, 1);
  assert.match(one[0].content, /CREATE TABLE a /);
  assert.doesNotMatch(one[0].content, /CREATE TABLE b /);
});
