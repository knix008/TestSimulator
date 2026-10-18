// Reverse engineering (reverse/*.js): Java, C#, C++, Python, TypeScript, Kotlin,
// PHP and SQL sources → model elements (packages, classifiers, attributes, operations,
// literals, generalizations, interface realizations, associations, ER
// entities / columns / relationships), tolerance of comments, strings,
// annotations, generics and unknown code, and round trips through the code
// generators (generate → reverse → same classes, attributes and operations).
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCode } from '../../src/domain/codegen/index.js';
import { addElement, buildIndex, createProject, insertElement, ref, walk } from '../../src/domain/model.js';
import { isSourceFileName } from '../../src/domain/format.js';
import { analyzeType, DEFAULT_REVERSE_OPTIONS, REVERSE_LANGUAGES, reverseEngineer } from '../../src/domain/reverse/index.js';

/** Puts the reverse result into a fresh project and gives lookup helpers. */
function load(result) {
  const project = createProject({ diagram: null });
  const model = project.ownedElements[0];
  for (const element of result.elements) insertElement(model, element);
  const index = buildIndex(project);
  const all = [];
  walk(model, (e) => { if (e !== model) all.push(e); });
  const named = (type, name) => all.find((e) => e._type === type && e.name === name) ?? null;
  const cls = (name) => all.find((e) => ['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(e._type) && e.name === name) ?? null;
  const typeName = (t) => (t && typeof t === 'object' ? index.get(t)?.name : t);
  const attr = (c, name) => (cls(c)?.attributes ?? []).find((a) => a.name === name) ?? null;
  const op = (c, name) => (cls(c)?.operations ?? []).find((o) => o.name === name) ?? null;
  const ret = (o) => (o?.parameters ?? []).find((p) => p.direction === 'return') ?? null;
  const inputs = (o) => (o?.parameters ?? []).filter((p) => p.direction !== 'return');
  const rels = (type) => all.filter((e) => e._type === type);
  const ends = (r) => (r.end1 ? [index.get(r.end1.reference)?.name, index.get(r.end2.reference)?.name] : [index.get(r.source)?.name, index.get(r.target)?.name]);
  const ownerName = (e) => index.parent(e._id)?.name;
  return { project, model, index, all, named, cls, typeName, attr, op, ret, inputs, rels, ends, ownerName, warnings: result.warnings };
}

test('languages, options and errors', () => {
  assert.deepEqual(REVERSE_LANGUAGES.map((l) => l.id), ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php', 'sql']);
  assert.deepEqual(REVERSE_LANGUAGES.find((l) => l.id === 'kotlin').exts, ['kt', 'kts']);
  assert.deepEqual(REVERSE_LANGUAGES.find((l) => l.id === 'php').exts, ['php']);
  assert.ok(['A.kt', 'build.gradle.kts', 'a.php'].every(isSourceFileName));
  assert.equal(DEFAULT_REVERSE_OPTIONS.associations, true);
  assert.throws(() => reverseEngineer([], 'cobol'), (e) => e.message === 'reverse.unknownLanguage' && e.detail === 'cobol');
  assert.deepEqual(reverseEngineer([], 'java'), { elements: [], warnings: [] });
});

test('type text analysis: collections, optionals, arrays', () => {
  assert.deepEqual(analyzeType('List<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('java.util.Set<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('Item[]'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('String...'), { name: 'String', multiplicity: '*' });
  assert.deepEqual(analyzeType('Optional<Item>'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('int?'), { name: 'int', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('Item | null'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('Optional[Item]'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('list[str]'), { name: 'str', multiplicity: '*' });
  assert.deepEqual(analyzeType('IEnumerable<Order>'), { name: 'Order', multiplicity: '*' });
  assert.deepEqual(analyzeType('Map<String, Integer>'), { name: 'Map<String, Integer>', multiplicity: '' });
  assert.deepEqual(analyzeType("'Order'"), { name: 'Order', multiplicity: '' });
});

// ───────────────────────── Java

const JAVA_ORDER = `/*
 * License header { with braces } and "quotes"
 */
package com.shop.model;

import java.util.*;
import com.shop.Priced;

/**
 * A customer order.
 * @author someone
 */
@Entity
@Table(name = "orders", indexes = { @Index(columnList = "id") })
public class Order extends BaseEntity implements Priced, java.io.Serializable {
    private static final long serialVersionUID = 1L;
    /** Lines of the order. */
    @OneToMany(mappedBy = "order")
    private List<OrderLine> lines = new ArrayList<>();
    private Map<String, List<Integer>> index = new HashMap<String, List<Integer>>();
    protected int count = 0, limit;
    String note = "a ; tricky { string }"; // comment with ; and {
    private Customer customer;
    private final char sep = ';';

    static { System.out.println("init"); }

    public Order() { this(0); }
    public Order(int count) throws IllegalArgumentException { this.count = count; }

    /** Total with a discount. */
    @Override
    public double total(final double discount, @Deprecated String... codes) {
        if (discount > 0) { return count * (1 - discount); }
        return count;
    }

    public static <T extends Comparable<T>> List<T> sorted(Collection<? extends T> items) { return null; }

    protected abstract void validate();

    public int getCount() { return count; }
    public void setCount(int count) { this.count = count; }

    public static class Builder {
        private Order order;
        public Order build() { return order; }
    }

    enum Kind { SMALL, LARGE }
}
`;
const JAVA_OTHERS = [
  { name: 'com/shop/model/BaseEntity.java', content: 'package com.shop.model;\npublic abstract class BaseEntity { protected Long id; public abstract String describe(); }' },
  { name: 'com/shop/model/OrderLine.java', content: 'package com.shop.model;\npublic final class OrderLine { private Order order; private int qty; }' },
  { name: 'com/shop/model/Customer.java', content: 'package com.shop.model;\npublic class Customer { String name; }' },
  { name: 'com/shop/Priced.java', content: 'package com.shop;\n/** Has a price. */\npublic interface Priced extends Comparable<Priced> { double TAX = 0.1; double price(); default boolean free() { return price() == 0; } }' },
  { name: 'com/shop/model/Status.java', content: 'package com.shop.model;\npublic enum Status implements Priced {\n  /** New one. */ NEW("n") { @Override public double price() { return 0; } },\n  @Deprecated DONE("d");\n  private final String code;\n  Status(String code) { this.code = code; }\n  public double price() { return 1; }\n}' },
];

test('Java: packages, classes, members, relationships and associations', () => {
  const m = load(reverseEngineer([{ name: 'com/shop/model/Order.java', content: JAVA_ORDER }, ...JAVA_OTHERS], 'java'));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  // Packages: com › shop › model.
  const com = m.named('UMLPackage', 'com');
  const shop = m.named('UMLPackage', 'shop');
  const pkg = m.named('UMLPackage', 'model');
  assert.ok(com && shop && pkg);
  assert.equal(m.ownerName(shop), 'com');
  assert.equal(m.ownerName(pkg), 'shop');
  assert.equal(m.ownerName(m.cls('Order')), 'model');
  assert.equal(m.ownerName(m.cls('Priced')), 'shop');
  const order = m.cls('Order');
  assert.equal(order._type, 'UMLClass');
  assert.equal(order.documentation, 'A customer order.');
  assert.equal(order.visibility, 'public');
  // Fields.
  const uid = m.attr('Order', 'serialVersionUID');
  assert.deepEqual([uid.type, uid.isStatic, uid.isReadOnly, uid.visibility, uid.defaultValue], ['long', true, true, 'private', '1L']);
  assert.equal(m.attr('Order', 'index').type, 'Map<String, List<Integer>>');
  assert.equal(m.attr('Order', 'index').defaultValue, 'new HashMap<String, List<Integer>>()');
  assert.deepEqual([m.attr('Order', 'count').defaultValue, m.attr('Order', 'count').visibility], ['0', 'protected']);
  assert.ok(m.attr('Order', 'limit'), 'second declarator');
  assert.deepEqual([m.attr('Order', 'note').visibility, m.attr('Order', 'note').defaultValue], ['package', '"a ; tricky { string }"']);
  assert.equal(m.attr('Order', 'sep').defaultValue, "';'");
  assert.equal(m.attr('Order', 'lines'), null, 'a field of a parsed class type is an association');
  // Associations.
  const assocs = m.rels('UMLAssociation');
  const lines = assocs.find((a) => a.end2.name === 'lines');
  assert.deepEqual(m.ends(lines), ['Order', 'OrderLine']);
  assert.deepEqual([lines.end2.navigable, lines.end2.multiplicity, lines.end2.visibility, lines.end2.documentation], ['navigable', '*', 'private', 'Lines of the order.']);
  assert.ok(assocs.find((a) => a.end2.name === 'customer'));
  assert.ok(assocs.find((a) => a.end2.name === 'order' && m.ends(a)[0] === 'OrderLine'));
  assert.equal(m.ownerName(lines), 'model', 'relationships in the package of their source');
  // Operations.
  const ctors = order.operations.filter((o) => o.name === 'Order');
  assert.equal(ctors.length, 2);
  assert.equal(ctors[1].raisedExceptions, 'IllegalArgumentException');
  const total = m.op('Order', 'total');
  assert.equal(total.documentation, 'Total with a discount.');
  assert.deepEqual(m.inputs(total).map((p) => [p.name, p.type, p.multiplicity]), [['discount', 'double', ''], ['codes', 'String', '*']]);
  assert.equal(m.ret(total).type, 'double');
  const sorted = m.op('Order', 'sorted');
  assert.equal(sorted.isStatic, true);
  assert.deepEqual(sorted.templateParameters.map((t) => [t.name, t.parameterType]), [['T', 'Comparable<T>']]);
  assert.deepEqual([m.ret(sorted).type, m.ret(sorted).multiplicity], ['T', '*']);
  assert.equal(m.op('Order', 'validate').isAbstract, true);
  assert.equal(m.ret(m.op('Order', 'validate')), null, 'void → no return parameter');
  // Nested classes live inside their owner.
  assert.equal(m.ownerName(m.cls('Builder')), 'Order');
  assert.equal(m.cls('Kind')._type, 'UMLEnumeration');
  // Generalization / realization; java.io.Serializable is unresolved (warning, no element).
  const gens = m.rels('UMLGeneralization').map(m.ends);
  assert.ok(gens.some(([a, b]) => a === 'Order' && b === 'BaseEntity'));
  const reals = m.rels('UMLInterfaceRealization').map(m.ends);
  assert.ok(reals.some(([a, b]) => a === 'Order' && b === 'Priced'));
  assert.ok(reals.some(([a, b]) => a === 'Status' && b === 'Priced'));
  assert.ok(m.warnings.some((w) => w.code === 'reverse.unresolvedType' && /Serializable/.test(w.detail)));
  // Interfaces, enums, abstract / final.
  const priced = m.cls('Priced');
  assert.equal(priced._type, 'UMLInterface');
  assert.equal(priced.documentation, 'Has a price.');
  assert.equal(m.op('Priced', 'price').isAbstract, true);
  assert.equal(m.op('Priced', 'free').isAbstract, false, 'default method has a body');
  assert.deepEqual([m.attr('Priced', 'TAX').isStatic, m.attr('Priced', 'TAX').isReadOnly], [true, true]);
  assert.equal(m.cls('BaseEntity').isAbstract, true);
  assert.equal(m.cls('OrderLine').isFinalSpecialization, true);
  const status = m.cls('Status');
  assert.deepEqual(status.literals.map((l) => l.name), ['NEW', 'DONE']);
  assert.equal(status.literals[0].documentation, 'New one.');
  assert.ok(m.attr('Status', 'code'));
  assert.ok(m.op('Status', 'price'));
});

test('Java options: associations off, accessors skipped, constructors dropped', () => {
  const m = load(reverseEngineer([{ name: 'Order.java', content: JAVA_ORDER }, ...JAVA_OTHERS], 'java', { associations: false, skipAccessors: true, constructors: false }));
  assert.equal(m.rels('UMLAssociation').length, 0);
  const lines = m.attr('Order', 'lines');
  assert.deepEqual([m.typeName(lines.type), lines.multiplicity], ['OrderLine', '*']);
  assert.equal(typeof lines.type, 'object', 'a known class type is a reference');
  assert.equal(m.op('Order', 'getCount'), null);
  assert.equal(m.op('Order', 'setCount'), null);
  assert.equal(m.op('Order', 'Order'), null);
});

test('Java: broken input does not throw and keeps what was understood', () => {
  const result = reverseEngineer([{ name: 'Broken.java', content: 'package x; public class A { int a = ; void f( { } } class B extends { int b; @@@ ' }], 'java');
  const m = load(result);
  assert.ok(m.cls('A'));
  assert.ok(m.cls('B'));
});

// ───────────────────────── C#

const CSHARP = `using System;
using System.Collections.Generic;
using Alias = System.Text;

namespace Shop.Model
{
    /// <summary>
    /// A customer order.
    /// </summary>
    [Serializable]
    public partial class Order : EntityBase, IPriced, IDisposable
    {
        private readonly List<OrderLine> _lines = new List<OrderLine>();
        public const int Max = 10;
        private static int counter;
        internal string Note = @"verbatim ""quoted"" ; {";
        public int Count { get; private set; } = 0;
        public string Code => $"O-{Count}";
        public Customer? Buyer { get; set; }
        public event EventHandler Changed;

        public Order(int count) : base() { Count = count; }
        ~Order() { }

        /// <summary>Total with a discount.</summary>
        public virtual double Total(double discount = 0.1, params string[] codes) { return 0; }
        public bool TryGet(int id, out OrderLine line, ref int tries) { line = null; return false; }
        public T Find<T>(Func<T, bool> test) where T : class, IPriced, new() => default;
        public static Order operator +(Order a, Order b) => a;
        public int this[int i] => i;
        void IDisposable.Dispose() { }
        public double Price() => 1;
    }

    public partial class Order { public DateTime Created { get; init; } }

    public abstract class EntityBase { protected Guid Id; public abstract string Describe(); }
    public interface IPriced { double Price(); string Currency { get; } }
    public sealed class OrderLine { public Order Owner { get; set; } public int Qty; }
    public struct Point { public int X, Y; }
    public record Customer(string Name, int Age);
    public enum Status : byte { New = 1, [Obsolete] Done, Cancelled }
    public delegate void Handler(object sender);
}

namespace Shop.Other
{
    class Helper<T> where T : struct { }
}
`;

test('C#: namespaces, partial classes, properties, members and relationships', () => {
  const m = load(reverseEngineer([{ name: 'Order.cs', content: CSHARP }], 'csharp'));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  assert.equal(m.ownerName(m.cls('Order')), 'Model');
  assert.equal(m.ownerName(m.named('UMLPackage', 'Model')), 'Shop');
  assert.equal(m.ownerName(m.cls('Helper')), 'Other', 'second namespace of the file');
  const order = m.cls('Order');
  assert.equal(order.documentation, 'A customer order.');
  assert.equal(m.all.filter((e) => e.name === 'Order' && e._type === 'UMLClass').length, 1, 'partial classes are merged');
  assert.ok(m.attr('Order', 'Created'), 'member of the second partial part');
  assert.deepEqual([m.attr('Order', 'Max').isStatic, m.attr('Order', 'Max').isReadOnly, m.attr('Order', 'Max').defaultValue], [true, true, '10']);
  assert.equal(m.attr('Order', 'counter').visibility, 'private', 'C# default member visibility');
  assert.equal(m.attr('Order', 'Note').visibility, 'package');
  assert.equal(m.attr('Order', 'Note').defaultValue, '@"verbatim ""quoted"" ; {"');
  assert.deepEqual([m.attr('Order', 'Count').type, m.attr('Order', 'Count').isReadOnly, m.attr('Order', 'Count').defaultValue], ['int', false, '0']);
  assert.equal(m.attr('Order', 'Code').isReadOnly, true, 'expression-bodied property is read-only');
  assert.ok(m.attr('Order', 'Changed'), 'events are attributes');
  // Associations: List<OrderLine> → *, Customer? → 0..1 (record), OrderLine.Owner → Order.
  const lines = m.rels('UMLAssociation').find((a) => a.end2.name === '_lines');
  assert.deepEqual([...m.ends(lines), lines.end2.multiplicity, lines.end2.isReadOnly], ['Order', 'OrderLine', '*', true]);
  const buyer = m.rels('UMLAssociation').find((a) => a.end2.name === 'Buyer');
  assert.deepEqual([...m.ends(buyer), buyer.end2.multiplicity], ['Order', 'Customer', '0..1']);
  assert.ok(m.rels('UMLAssociation').find((a) => a.end2.name === 'Owner'));
  // Operations.
  assert.ok(m.op('Order', 'Order'), 'constructor');
  assert.equal(order.operations.filter((o) => o.name === '~Order' || o.name === 'operator').length, 0);
  const total = m.op('Order', 'Total');
  assert.equal(total.documentation, 'Total with a discount.');
  assert.deepEqual(m.inputs(total).map((p) => [p.name, p.type, p.multiplicity, p.defaultValue]), [['discount', 'double', '', '0.1'], ['codes', 'string', '*', '']]);
  assert.deepEqual(m.inputs(m.op('Order', 'TryGet')).map((p) => p.direction), ['in', 'out', 'inout']);
  const find = m.op('Order', 'Find');
  assert.deepEqual(find.templateParameters.map((t) => [t.name, t.parameterType]), [['T', 'IPriced']]);
  assert.ok(m.op('Order', 'Dispose'), 'explicit interface implementation');
  assert.ok(m.op('Order', 'Price'));
  // Base list: class → generalization, interfaces → realization.
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'EntityBase'));
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'IPriced'));
  assert.equal(m.cls('EntityBase').isAbstract, true);
  assert.equal(m.op('EntityBase', 'Describe').isAbstract, true);
  assert.equal(m.cls('IPriced')._type, 'UMLInterface');
  assert.equal(m.op('IPriced', 'Price').isAbstract, true);
  assert.equal(m.attr('IPriced', 'Currency').isReadOnly, true);
  assert.equal(m.cls('OrderLine').isFinalSpecialization, true);
  assert.deepEqual(m.cls('Point').attributes.map((a) => a.name), ['X', 'Y']);
  assert.deepEqual(m.cls('Customer').attributes.map((a) => a.name), ['Name', 'Age']);
  assert.deepEqual(m.cls('Status').literals.map((l) => l.name), ['New', 'Done', 'Cancelled']);
  assert.equal(m.cls('Handler'), null, 'delegates are skipped');
  assert.deepEqual(m.cls('Helper').templateParameters.map((t) => t.name), ['T']);
});

test('C#: file-scoped namespace and accessor properties skipped', () => {
  const src = 'namespace App.Core;\npublic class Account { private int balance; public int Balance { get => balance; set => balance = value; } public string Owner { get; set; } }';
  const m = load(reverseEngineer([{ name: 'Account.cs', content: src }], 'csharp', { skipAccessors: true }));
  assert.equal(m.ownerName(m.cls('Account')), 'Core');
  assert.deepEqual(m.cls('Account').attributes.map((a) => a.name), ['balance', 'Owner']);
});

// ───────────────────────── Python

const PYTHON_ORDER = `"""Module docstring."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import ClassVar, Generic, List, Optional, TypeVar

T = TypeVar('T')


class Entity(ABC):
    """Base of all entities."""

    def __init__(self, id: int = 0):
        self._id = id   # protected

    @abstractmethod
    def describe(self) -> str:
        ...


class Order(Entity, Generic[T]):
    """A customer order.

    With a second paragraph.
    """
    MAX = 10
    registry: ClassVar[dict] = {}

    def __init__(self, customer: 'Customer', lines: List[OrderLine] = None, *args, **kwargs):
        super().__init__()
        self.customer = customer
        self.lines: list[OrderLine] = lines or []
        self.__secret = "s#not a comment"
        self.count = 0
        self.ratio = 0.5
        self.note: Optional[str] = None
        if True:
            self.flag = True
        text = """multi
        line # not a comment
        """

    def total(self, discount: float = 0.1,
              *, rounding: bool = False) -> float:
        """Total with a discount."""
        return 0.0

    @staticmethod
    def create(data: dict) -> "Order":
        return Order(None)

    @classmethod
    def empty(cls) -> Order:
        return cls(None)

    @property
    def size(self) -> int:
        return len(self.lines)

    def _helper(self): pass

    def __private(self): pass

    def __str__(self) -> str:
        return ''

    def describe(self) -> str:
        return 'order'

    class Meta:
        ordering = ['id']


class Status(Enum):
    NEW = 1
    DONE = 'done'

    def label(self):
        return self.name


class Priced(ABC):
    @abstractmethod
    def price(self) -> float: ...


@dataclass
class OrderLine:
    order: Order
    qty: int = 1
    tags: list[str] = field(default_factory=list)


def helper():
    class Local:
        pass
    return Local
`;

test('Python: classes, docstrings, fields from __init__ and dataclasses, methods, enums, interfaces', () => {
  const m = load(reverseEngineer([
    { name: 'shop/model/order.py', content: PYTHON_ORDER },
    { name: 'shop/customer.py', content: 'class Customer:\n    name: str\n    orders: "list[Order]"\n' },
  ], 'python'));
  assert.equal(m.ownerName(m.cls('Order')), 'model', 'folders become packages');
  assert.equal(m.ownerName(m.cls('Customer')), 'shop');
  const entity = m.cls('Entity');
  assert.deepEqual([entity.isAbstract, entity._type, entity.documentation], [true, 'UMLClass', 'Base of all entities.']);
  assert.deepEqual([m.attr('Entity', 'id').visibility, m.attr('Entity', 'id').type], ['protected', 'int']);
  const order = m.cls('Order');
  assert.equal(order.documentation, 'A customer order.\n\nWith a second paragraph.');
  assert.deepEqual(order.templateParameters.map((t) => t.name), ['T']);
  assert.deepEqual([m.attr('Order', 'MAX').isStatic, m.attr('Order', 'MAX').type, m.attr('Order', 'MAX').defaultValue], [true, 'int', '10']);
  assert.deepEqual([m.attr('Order', 'registry').isStatic, m.attr('Order', 'registry').type], [true, 'dict']);
  assert.deepEqual([m.attr('Order', 'secret').visibility, m.attr('Order', 'secret').type, m.attr('Order', 'secret').defaultValue], ['private', 'str', '"s#not a comment"']);
  assert.deepEqual([m.attr('Order', 'count').type, m.attr('Order', 'ratio').type, m.attr('Order', 'flag').type], ['int', 'float', 'bool']);
  assert.deepEqual([m.attr('Order', 'note').type, m.attr('Order', 'note').multiplicity], ['str', '0..1']);
  assert.equal(m.attr('Order', 'text'), null, 'locals are not fields');
  assert.deepEqual([m.attr('Order', 'size').isReadOnly, m.attr('Order', 'size').type], [true, 'int'], '@property → attribute');
  // Associations: customer (type from the parameter annotation), lines (list of OrderLine), OrderLine.order.
  const assoc = (name) => m.rels('UMLAssociation').find((a) => a.end2.name === name);
  assert.deepEqual(m.ends(assoc('customer')), ['Order', 'Customer']);
  assert.deepEqual([...m.ends(assoc('lines')), assoc('lines').end2.multiplicity], ['Order', 'OrderLine', '*']);
  assert.deepEqual(m.ends(assoc('order')), ['OrderLine', 'Order']);
  assert.deepEqual([...m.ends(assoc('orders')), assoc('orders').end2.multiplicity], ['Customer', 'Order', '*']);
  // Operations.
  const ctor = m.op('Order', 'Order');
  assert.deepEqual(m.inputs(ctor).map((p) => [p.name, p.multiplicity]), [['customer', ''], ['lines', '*'], ['args', '*'], ['kwargs', '']]);
  const total = m.op('Order', 'total');
  assert.equal(total.documentation, 'Total with a discount.');
  assert.deepEqual(m.inputs(total).map((p) => [p.name, p.type, p.defaultValue]), [['discount', 'float', '0.1'], ['rounding', 'bool', 'False']]);
  assert.equal(m.ret(total).type, 'float');
  assert.equal(m.op('Order', 'create').isStatic, true);
  assert.equal(m.typeName(m.ret(m.op('Order', 'create')).type), 'Order');
  assert.equal(m.op('Order', 'empty').isStatic, true);
  assert.equal(m.inputs(m.op('Order', 'empty')).length, 0, 'cls is dropped');
  assert.equal(m.op('Order', 'helper').visibility, 'protected');
  assert.equal(m.op('Order', 'private').visibility, 'private');
  assert.equal(m.op('Order', '__str__').visibility, 'public');
  assert.equal(m.ownerName(m.cls('Meta')), 'Order', 'nested class');
  assert.equal(m.cls('Local'), null, 'classes inside functions are skipped');
  // Bases, enum, interface, dataclass.
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'Entity'));
  const status = m.cls('Status');
  assert.equal(status._type, 'UMLEnumeration');
  assert.deepEqual(status.literals.map((l) => l.name), ['NEW', 'DONE']);
  assert.equal(m.cls('Priced')._type, 'UMLInterface', 'ABC with abstract methods only');
  assert.deepEqual(m.cls('OrderLine').attributes.map((a) => [a.name, a.isStatic, a.defaultValue]), [['qty', false, '1'], ['tags', false, '']]);
  assert.equal(m.attr('OrderLine', 'tags').multiplicity, '*');
});

test('Python: root option strips a folder prefix; Protocol is an interface', () => {
  const m = load(reverseEngineer([{ name: 'src\\app\\api.py', content: 'from typing import Protocol\nclass Api(Protocol):\n    def call(self, x: int) -> str: ...\n' }], 'python', { root: 'src' }));
  assert.equal(m.ownerName(m.cls('Api')), 'app');
  assert.equal(m.cls('Api')._type, 'UMLInterface');
  assert.equal(m.op('Api', 'call').isAbstract, true);
});

// ───────────────────────── TypeScript

const TS_ORDER = `import { Customer } from './customer';
import * as util from "../util"
import type { Priced } from '../priced';

/** A customer order. */
@Component({ selector: 'app-order', template: \`<div>\${1 + 2}</div>\` })
export default abstract class Order<T extends object = {}> extends Base<T> implements Priced, Serializable {
  static readonly MAX = 10;
  private lines: OrderLine[] = [];
  protected customer?: Customer
  #secret = 'x;y'
  note: string | null = null;
  readonly tags: Array<string> = new Array<string>();
  handler = (e: Event): void => { console.log(e); };
  [key: string]: unknown;

  constructor(private readonly id: number, public owner: Customer, label = 'none') {
    super();
  }

  /** Total with a discount. */
  total(discount: number = 0.1, ...codes: string[]): number {
    return 0;
  }

  abstract validate(): boolean;

  get size(): number { return this.lines.length; }
  set size(v: number) { }

  static async load<K>(key: K): Promise<Order<K>> { return null as any; }
  private compute(fn: (a: number, b: number) => number, opts?: { deep: boolean }): Map<string, number> { return new Map(); }
}

export interface OrderLine extends Line, Priced {
  readonly order: Order<any>;
  qty?: number;
  price(currency: string): number;
  (x: number): string;
  [k: string]: any;
}

export enum Status { New = 'new', Done = 'done', }

export const enum Flags { A = 1 << 0, B = 1 << 1 }

namespace Legacy.Util {
  export class Helper {}
}

function notAClass() { const x = { class: 1 }; return x.class; }
`;

test('TypeScript: classes, interfaces, enums, constructor properties, folders and namespaces', () => {
  const m = load(reverseEngineer([
    { name: 'src/shop/order.ts', content: TS_ORDER },
    { name: 'src/shop/customer.ts', content: 'export class Customer { name = ""; orders: Order[] = [] }' },
    { name: 'src/priced.ts', content: 'export interface Priced { price(currency?: string): number }' },
  ], 'typescript', { root: 'src' }));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  assert.equal(m.ownerName(m.cls('Order')), 'shop');
  assert.equal(m.ownerName(m.cls('Priced')), 'Model', 'file at the root: no package');
  assert.equal(m.ownerName(m.cls('Helper')), 'Util');
  assert.equal(m.ownerName(m.named('UMLPackage', 'Legacy')), 'shop', 'namespace below the folder package');
  const order = m.cls('Order');
  assert.deepEqual([order.isAbstract, order.documentation], [true, 'A customer order.']);
  assert.deepEqual(order.templateParameters.map((t) => [t.name, t.parameterType]), [['T', 'object']]);
  assert.deepEqual([m.attr('Order', 'MAX').isStatic, m.attr('Order', 'MAX').isReadOnly, m.attr('Order', 'MAX').defaultValue], [true, true, '10']);
  assert.deepEqual([m.attr('Order', 'secret').visibility, m.attr('Order', 'secret').defaultValue], ['private', "'x;y'"]);
  assert.deepEqual([m.attr('Order', 'note').type, m.attr('Order', 'note').multiplicity], ['string', '0..1']);
  assert.deepEqual([m.attr('Order', 'tags').type, m.attr('Order', 'tags').multiplicity, m.attr('Order', 'tags').isReadOnly], ['string', '*', true]);
  assert.equal(m.attr('Order', 'handler').defaultValue, '(e: Event): void => { console.log(e); }');
  assert.deepEqual([m.attr('Order', 'id').visibility, m.attr('Order', 'id').isReadOnly, m.attr('Order', 'id').type], ['private', true, 'number'], 'constructor parameter property');
  const assoc = (name) => m.rels('UMLAssociation').find((a) => a.end2.name === name);
  assert.deepEqual([...m.ends(assoc('customer')), assoc('customer').end2.multiplicity, assoc('customer').end2.visibility], ['Order', 'Customer', '0..1', 'protected']);
  assert.deepEqual([...m.ends(assoc('lines')), assoc('lines').end2.multiplicity], ['Order', 'OrderLine', '*']);
  assert.ok(assoc('owner'));
  assert.deepEqual([...m.ends(assoc('orders')), assoc('orders').end2.multiplicity], ['Customer', 'Order', '*']);
  assert.ok(m.op('Order', 'Order'), 'constructor');
  assert.deepEqual(m.inputs(m.op('Order', 'Order')).map((p) => [p.name, p.defaultValue]), [['id', ''], ['owner', ''], ['label', "'none'"]]);
  const total = m.op('Order', 'total');
  assert.equal(total.documentation, 'Total with a discount.');
  assert.deepEqual(m.inputs(total).map((p) => [p.name, p.type, p.multiplicity, p.defaultValue]), [['discount', 'number', '', '0.1'], ['codes', 'string', '*', '']]);
  assert.equal(m.ret(total).type, 'number');
  assert.equal(m.op('Order', 'validate').isAbstract, true);
  const load_ = m.op('Order', 'load');
  assert.deepEqual([load_.isStatic, m.ret(load_).type, load_.templateParameters[0].name], [true, 'Promise<Order<K>>', 'K']);
  const compute = m.op('Order', 'compute');
  assert.deepEqual(m.inputs(compute).map((p) => [p.name, p.type, p.multiplicity]), [['fn', '(a: number, b: number) => number', ''], ['opts', '{ deep: boolean }', '0..1']]);
  assert.equal(m.ret(compute).type, 'Map<string, number>');
  assert.equal(order.operations.filter((o) => o.name === 'size').length, 2, 'accessors kept by default');
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'Priced'));
  const line = m.cls('OrderLine');
  assert.equal(line._type, 'UMLInterface');
  assert.deepEqual(line.attributes.map((a) => [a.name, a.isReadOnly, a.multiplicity]), [['qty', false, '0..1']]);
  assert.ok(m.rels('UMLAssociation').find((a) => a.end2.name === 'order' && m.ends(a)[0] === 'OrderLine'));
  assert.deepEqual(line.operations.map((o) => o.name), ['price']);
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'OrderLine' && b === 'Priced'), 'interface extends interface');
  assert.deepEqual(m.cls('Status').literals.map((l) => l.name), ['New', 'Done']);
  assert.deepEqual(m.cls('Flags').literals.map((l) => l.name), ['A', 'B']);
  const skip = load(reverseEngineer([{ name: 'order.ts', content: TS_ORDER }], 'typescript', { skipAccessors: true }));
  assert.equal(skip.op('Order', 'size'), null);
});

// ───────────────────────── SQL

const DDL = `-- Shop schema
CREATE TABLE IF NOT EXISTS \`customer\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`email\` VARCHAR(120) NOT NULL UNIQUE COMMENT 'login, unique',
  \`key\` VARCHAR(10),
  active TINYINT(1) DEFAULT 1,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY idx_email (email)
) ENGINE=InnoDB COMMENT='People who buy';

CREATE TABLE "order" (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customer(id) ON DELETE CASCADE,
  total NUMERIC(10, 2) DEFAULT 0.00 CHECK (total >= 0),
  note TEXT DEFAULT 'n/a; really',
  status VARCHAR(10) NOT NULL DEFAULT 'new'::character varying
);

CREATE TABLE dbo.[order_line] (
  [order_id] INT NOT NULL,
  [no] INT NOT NULL,
  qty INT NOT NULL DEFAULT (1),
  CONSTRAINT pk_line PRIMARY KEY ([order_id], [no]),
  CONSTRAINT fk_line_order FOREIGN KEY ([order_id]) REFERENCES [order] ([id])
)
GO

CREATE TABLE invoice (id INT PRIMARY KEY, order_id INT UNIQUE NOT NULL, ghost_id INT);
ALTER TABLE invoice ADD CONSTRAINT fk_invoice_order FOREIGN KEY (order_id) REFERENCES "order" (id);
ALTER TABLE invoice ADD FOREIGN KEY (ghost_id) REFERENCES ghost (id);
COMMENT ON COLUMN invoice.id IS 'Invoice number';
CREATE INDEX idx_x ON invoice (order_id);
INSERT INTO invoice VALUES (1, 1, NULL);
`;

test('SQL: tables, columns, keys, defaults and foreign key relationships', () => {
  const result = reverseEngineer([{ name: 'schema.sql', content: DDL }], 'sql', { modelName: 'Shop' });
  assert.equal(result.elements.length, 1);
  const dm = result.elements[0];
  assert.deepEqual([dm._type, dm.name], ['ERDDataModel', 'Shop']);
  const m = load(result);
  const entity = (name) => m.named('ERDEntity', name);
  const col = (table, name) => entity(table).columns.find((c) => c.name === name);
  assert.deepEqual(dm.ownedElements.filter((e) => e._type === 'ERDEntity').map((e) => e.name), ['customer', 'order', 'order_line', 'invoice']);
  assert.equal(entity('customer').documentation, 'People who buy');
  assert.deepEqual(entity('customer').columns.map((c) => c.name), ['id', 'email', 'key', 'active', 'created']);
  assert.deepEqual([col('customer', 'id').primaryKey, col('customer', 'id').nullable, col('customer', 'id').type], [true, false, 'INT']);
  assert.deepEqual([col('customer', 'email').type, col('customer', 'email').length, col('customer', 'email').unique, col('customer', 'email').nullable, col('customer', 'email').documentation], ['VARCHAR', '120', true, false, 'login, unique']);
  assert.deepEqual([col('customer', 'active').defaultValue, col('customer', 'active').nullable], ['1', true]);
  assert.equal(col('customer', 'created').defaultValue, 'CURRENT_TIMESTAMP');
  assert.deepEqual([col('order', 'id').type, col('order', 'id').primaryKey], ['SERIAL', true]);
  assert.deepEqual([col('order', 'total').length, col('order', 'total').defaultValue], ['10,2', '0.00']);
  assert.equal(col('order', 'note').defaultValue, "'n/a; really'");
  assert.equal(col('order_line', 'qty').defaultValue, '(1)');
  assert.deepEqual([col('order_line', 'order_id').primaryKey, col('order_line', 'no').primaryKey], [true, true]);
  assert.equal(col('invoice', 'id').documentation, 'Invoice number');
  // Foreign keys.
  const fk = col('order', 'customer_id');
  assert.equal(fk.foreignKey, true);
  assert.equal(m.index.get(fk.referenceTo), col('customer', 'id'));
  assert.equal(m.index.get(col('order_line', 'order_id').referenceTo), col('order', 'id'));
  assert.equal(m.index.get(col('invoice', 'order_id').referenceTo), col('order', 'id'));
  assert.equal(col('invoice', 'ghost_id').foreignKey, true);
  assert.equal(col('invoice', 'ghost_id').referenceTo, undefined);
  assert.ok(result.warnings.some((w) => w.code === 'reverse.unresolvedTable' && /ghost/.test(w.detail)));
  const rels = m.rels('ERDRelationship');
  assert.equal(rels.length, 3);
  const rel = (child) => rels.find((r) => m.ends(r)[1] === child);
  assert.deepEqual([...m.ends(rel('order')), rel('order').end1.cardinality, rel('order').end2.cardinality, rel('order').identifying], ['customer', 'order', '0..1', '0..*', false]);
  assert.deepEqual([rel('order_line').name, rel('order_line').end1.cardinality, rel('order_line').identifying], ['fk_line_order', '1', true]);
  assert.deepEqual([rel('invoice').end1.cardinality, rel('invoice').end2.cardinality], ['1', '0..1'], 'unique key → 0..1');
  assert.ok(rels.every((r) => m.ownerName(r) === 'Shop'));
});

// ───────────────────────── C++

const CPP_HEADER = `#pragma once
#include <string>
#include <vector>
#include <memory>
#include "customer.h"

namespace shop::model {

/** Something with a price. */
class IPriced {
public:
    virtual ~IPriced() = default;
    virtual double price(const std::string& currency) const = 0;
};

enum class Status : int { New = 1, Paid, Shipped };

template <typename T, int N = 4>
class Box {
public:
    T items[N];
};

/// A customer order.
class Order : public Entity, public IPriced {
public:
    static constexpr int MAX_LINES = 10;
    explicit Order(long id, Customer* buyer = nullptr);
    ~Order() override;
    double price(const std::string& currency) const override;
    virtual void cancel();
    void addLine(const OrderLine& line, int count = 1);
    bool operator==(const Order& other) const;
    friend class OrderPrinter;
    std::vector<OrderLine> lines;
protected:
    Customer* buyer;
    std::shared_ptr<Address> shipTo;
private:
    long id_ = 0;
    int flags : 3;
    Status status{Status::New};
    double total() const { return 0.0; }
};

struct OrderLine {
    int quantity = 1;
    double unitPrice;
};

class Entity {
public:
    virtual std::string describe() const = 0;
protected:
    long id;
};

} // namespace shop::model

class Forward;
void Order::cancel() { status = Status::New; }
`;

test('C++: namespaces, classes, structs, enums, access sections, members and relationships', () => {
  const m = load(reverseEngineer([{ name: 'include/order.h', content: CPP_HEADER }], 'cpp'));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  assert.equal(m.ownerName(m.cls('Order')), 'model');
  assert.equal(m.ownerName(m.named('UMLPackage', 'model')), 'shop', 'namespace shop::model → nested packages');
  const order = m.cls('Order');
  assert.equal(order.documentation, 'A customer order.');
  assert.equal(m.cls('Forward'), null, 'forward declarations are not classes');
  // Fields: static constexpr → static read-only; default values; access sections; a bit-field.
  assert.deepEqual([m.attr('Order', 'MAX_LINES').isStatic, m.attr('Order', 'MAX_LINES').isReadOnly, m.attr('Order', 'MAX_LINES').defaultValue], [true, true, '10']);
  assert.deepEqual([m.attr('Order', 'id_').visibility, m.attr('Order', 'id_').defaultValue], ['private', '0']);
  assert.ok(m.attr('Order', 'flags'), 'bit-field');
  assert.deepEqual([m.attr('Order', 'status').visibility, m.attr('Order', 'status').defaultValue], ['private', 'Status::New']);
  // Associations: vector<OrderLine> → *, Customer* → 0..1, shared_ptr<Address> stays a type (Address is not parsed).
  const lines = m.rels('UMLAssociation').find((a) => a.end2.name === 'lines');
  assert.deepEqual([...m.ends(lines), lines.end2.multiplicity, lines.end2.visibility ?? 'public'], ['Order', 'OrderLine', '*', 'public']);
  assert.equal(m.attr('Order', 'buyer')?.visibility ?? m.rels('UMLAssociation').find((a) => a.end2.name === 'buyer')?.end2.visibility, 'protected');
  assert.ok(m.attr('Order', 'shipTo'), 'a smart pointer to an unknown class stays an attribute');
  // Operations: constructor, const/virtual/override methods, defaults; destructor, operators, friends skipped; inline bodies kept.
  assert.ok(m.op('Order', 'Order'), 'constructor');
  assert.deepEqual(m.inputs(m.op('Order', 'Order')).map((p) => [p.name, p.defaultValue]), [['id', ''], ['buyer', 'nullptr']]);
  assert.deepEqual(m.inputs(m.op('Order', 'addLine')).map((p) => [p.name, p.defaultValue]), [['line', ''], ['count', '1']]);
  assert.equal(m.ret(m.op('Order', 'price'))?.type, 'double');
  assert.ok(m.op('Order', 'cancel') && m.op('Order', 'total'));
  assert.deepEqual(order.operations.filter((o) => /^~|operator/.test(o.name)).map((o) => o.name), []);
  assert.equal(m.op('Order', 'total').visibility, 'private');
  // Base list: class → generalization, interface (only pure virtual methods) → realization.
  assert.equal(m.cls('IPriced')._type, 'UMLInterface');
  assert.equal(m.op('IPriced', 'price').isAbstract, true);
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'Entity'));
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'IPriced'));
  assert.equal(m.cls('Entity').isAbstract, true, 'a pure virtual method makes the class abstract');
  // struct: public by default; enum class literals; template parameters.
  assert.deepEqual(m.cls('OrderLine').attributes.map((a) => [a.name, a.visibility]), [['quantity', 'public'], ['unitPrice', 'public']]);
  assert.deepEqual(m.cls('Status').literals.map((l) => l.name), ['New', 'Paid', 'Shipped']);
  assert.deepEqual(m.cls('Box').templateParameters.map((t) => t.name), ['T', 'N']);
  // Out-of-class definitions in a .cpp file add nothing.
  const source = load(reverseEngineer([{ name: 'order.cpp', content: '#include "order.h"\nnamespace shop { void Order::cancel() { } double Order::price(const std::string& c) const { return 1; } }\n' }], 'cpp'));
  assert.equal(source.cls('Order'), null);
});

test('type text analysis: C++ pointers, references, std containers and smart pointers', () => {
  assert.deepEqual(analyzeType('Item*'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('const Item&'), { name: 'Item', multiplicity: '' });
  assert.deepEqual(analyzeType('std::vector<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('std::vector<Item*>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('std::array<Item, 3>'), { name: 'Item', multiplicity: '3' });
  assert.deepEqual(analyzeType('std::unique_ptr<Item>'), { name: 'Item', multiplicity: '' });
  assert.deepEqual(analyzeType('std::optional<Item>'), { name: 'Item', multiplicity: '0..1' });
});

// ───────────────────────── Kotlin

const KOTLIN_ORDER = String.raw`@file:JvmName("Orders")
package com.shop.model

import java.time.Instant
import com.shop.Priced
import com.shop.util.Money as Cash

/**
 * A customer order.
 * @property id the key
 */
@Serializable
data class Order(
    val id: Long,
    private var note: String = "a, b; { c }",
    internal val customer: Customer? = null,
    count: Int = 0,
) : BaseEntity(id), Priced, Comparable<Order> {
    /** Lines of the order. */
    val lines: MutableList<OrderLine> = mutableListOf()
    var tags: Set<String> = emptySet()
        private set
    protected lateinit var createdAt: Instant
    var total: Double = 0.0
        get() = field * 2
        set(value) { field = value }
    val size: Int get() = lines.size
    val label by lazy { "Order $id" }
    var discount = 0.5
    private val codes = arrayOf<String>()
    val scores: IntArray = IntArray(3)

    init {
        require(id > 0) { "id" }
    }

    constructor(other: Order) : this(other.id)

    /** Total with a discount. */
    override fun price(currency: String): Double = total *
        (1 - discount)

    suspend fun load(vararg keys: String, force: Boolean = false): List<OrderLine>? {
        return null
    }

    fun <T : Comparable<T>> sorted(items: Collection<T>): List<T> where T : Any = items.sorted()

    private fun String.shout(): String = uppercase()

    override fun compareTo(other: Order): Int = id.compareTo(other.id)

    companion object Factory {
        const val MAX = 10
        @JvmStatic
        fun create(): Order = Order(1)
    }

    enum class Kind { SMALL, LARGE }

    inner class Cursor(val at: Int)
}
`;
const KOTLIN_OTHERS = [
  { name: 'com/shop/model/BaseEntity.kt', content: 'package com.shop.model\n\n/** Base of all entities. */\nabstract class BaseEntity(open val id: Long) {\n    abstract fun describe(): String\n    open fun touch() {}\n}\n' },
  { name: 'com/shop/Priced.kt', content: 'package com.shop\n\n/** Has a price. */\ninterface Priced {\n    val currency: String\n    fun price(currency: String): Double\n    fun free(): Boolean = price(currency) == 0.0\n}\n' },
  {
    name: 'com/shop/model/More.kt',
    content: String.raw`package com.shop.model

sealed class Shape
object Registry {
    val items = mutableListOf<OrderLine>()
    fun register(line: OrderLine) { items.add(line) }
}

enum class Status(val code: String) {
    /** New one. */
    NEW("n") { override fun label() = "new" },
    DONE("d");

    open fun label(): String = code
}

class OrderLine(val order: Order, var qty: Int = 1)

class Customer(val name: String) {
    val orders: List<Order> = listOf()
}

typealias Lines = List<OrderLine>

fun topLevel(): Int { class Local; return 1 }
`,
  },
];

test('Kotlin: packages, primary constructors, properties, functions, companion objects and relationships', () => {
  const m = load(reverseEngineer([{ name: 'com/shop/model/Order.kt', content: KOTLIN_ORDER }, ...KOTLIN_OTHERS], 'kotlin'));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  assert.equal(m.ownerName(m.cls('Order')), 'model');
  assert.equal(m.ownerName(m.named('UMLPackage', 'model')), 'shop');
  assert.equal(m.ownerName(m.cls('Priced')), 'shop');
  const order = m.cls('Order');
  assert.deepEqual([order._type, order.documentation, order.visibility, order.isFinalSpecialization], ['UMLClass', 'A customer order.', 'public', true]);
  // Primary constructor: val / var parameters are properties, a plain parameter is not.
  assert.deepEqual([m.attr('Order', 'id').type, m.attr('Order', 'id').isReadOnly, m.attr('Order', 'id').visibility], ['Long', true, 'public']);
  assert.deepEqual([m.attr('Order', 'note').visibility, m.attr('Order', 'note').isReadOnly, m.attr('Order', 'note').defaultValue], ['private', false, '"a, b; { c }"']);
  assert.equal(m.attr('Order', 'count'), null);
  const assoc = (name) => m.rels('UMLAssociation').find((a) => a.end2.name === name);
  assert.deepEqual([...m.ends(assoc('customer')), assoc('customer').end2.multiplicity, assoc('customer').end2.visibility], ['Order', 'Customer', '0..1', 'package'], 'internal → package');
  // Body properties.
  assert.deepEqual([...m.ends(assoc('lines')), assoc('lines').end2.multiplicity, assoc('lines').end2.isReadOnly, assoc('lines').end2.documentation], ['Order', 'OrderLine', '*', true, 'Lines of the order.']);
  assert.deepEqual([m.attr('Order', 'tags').type, m.attr('Order', 'tags').multiplicity, m.attr('Order', 'tags').isReadOnly], ['String', '*', false]);
  assert.deepEqual([m.attr('Order', 'createdAt').visibility, m.attr('Order', 'createdAt').type], ['protected', 'Instant']);
  assert.deepEqual([m.attr('Order', 'total').type, m.attr('Order', 'total').defaultValue], ['Double', '0.0'], 'getter and setter lines are skipped');
  assert.deepEqual([m.attr('Order', 'size').type, m.attr('Order', 'size').isReadOnly], ['Int', true]);
  assert.ok(m.attr('Order', 'label'), 'delegated property');
  assert.equal(m.attr('Order', 'discount').type, 'Double', 'type inferred from the initializer');
  assert.deepEqual([m.attr('Order', 'codes').type, m.attr('Order', 'codes').multiplicity, m.attr('Order', 'codes').visibility], ['String', '*', 'private']);
  assert.deepEqual([m.attr('Order', 'scores').type, m.attr('Order', 'scores').multiplicity], ['Int', '*'], 'IntArray');
  // Functions.
  assert.equal(order.operations.filter((o) => o.name === 'Order').length, 2, 'primary (with a plain parameter) and secondary constructor');
  const price = m.op('Order', 'price');
  assert.equal(price.documentation, 'Total with a discount.');
  assert.deepEqual([m.inputs(price).map((p) => [p.name, p.type]), m.ret(price).type], [[['currency', 'String']], 'Double']);
  const loadOp = m.op('Order', 'load');
  assert.deepEqual(m.inputs(loadOp).map((p) => [p.name, p.type, p.multiplicity, p.defaultValue]), [['keys', 'String', '*', ''], ['force', 'Boolean', '', 'false']]);
  assert.deepEqual([m.typeName(m.ret(loadOp).type), m.ret(loadOp).multiplicity], ['OrderLine', '*']);
  const sorted = m.op('Order', 'sorted');
  assert.deepEqual(sorted.templateParameters.map((t) => [t.name, t.parameterType]), [['T', 'Comparable<T>, Any']]);
  assert.deepEqual([m.ret(sorted).type, m.ret(sorted).multiplicity], ['T', '*']);
  assert.equal(m.op('Order', 'shout').visibility, 'private', 'extension function');
  assert.ok(m.op('Order', 'compareTo'));
  // Companion object members are static.
  const max = m.attr('Order', 'MAX');
  assert.deepEqual([max.isStatic, max.isReadOnly, max.defaultValue, max.type], [true, true, '10', 'Int']);
  assert.deepEqual([m.op('Order', 'create').isStatic, m.typeName(m.ret(m.op('Order', 'create')).type)], [true, 'Order']);
  assert.equal(m.cls('Factory'), null, 'the companion is not a class');
  // Nested declarations.
  assert.deepEqual([m.ownerName(m.cls('Kind')), m.cls('Kind')._type], ['Order', 'UMLEnumeration']);
  assert.deepEqual(m.cls('Kind').literals.map((l) => l.name), ['SMALL', 'LARGE']);
  assert.deepEqual([m.ownerName(m.cls('Cursor')), m.cls('Cursor').attributes.map((a) => a.name)], ['Order', ['at']]);
  // Supertypes: Base(…) → generalization, interfaces → realization; Comparable is not parsed.
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'BaseEntity'));
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'Priced'));
  assert.ok(m.warnings.some((w) => w.code === 'reverse.unresolvedType' && /Comparable/.test(w.detail)));
  // Other files.
  const base = m.cls('BaseEntity');
  assert.deepEqual([base.isAbstract, base.documentation, m.op('BaseEntity', 'describe').isAbstract, m.op('BaseEntity', 'touch').isAbstract], [true, 'Base of all entities.', true, false]);
  assert.ok(m.attr('BaseEntity', 'id'));
  const priced = m.cls('Priced');
  assert.deepEqual([priced._type, priced.documentation], ['UMLInterface', 'Has a price.']);
  assert.deepEqual([m.op('Priced', 'price').isAbstract, m.op('Priced', 'free').isAbstract, m.attr('Priced', 'currency').isReadOnly], [true, false, true]);
  assert.equal(m.cls('Shape').isAbstract, true, 'sealed class');
  const registry = m.attr('Registry', 'items');
  assert.deepEqual([registry.isStatic, m.typeName(registry.type), registry.multiplicity, m.op('Registry', 'register').isStatic], [true, 'OrderLine', '*', true], 'object members are static');
  const status = m.cls('Status');
  assert.deepEqual([status._type, status.literals.map((l) => l.name), status.literals[0].documentation], ['UMLEnumeration', ['NEW', 'DONE'], 'New one.']);
  assert.ok(m.attr('Status', 'code') && m.op('Status', 'label'));
  assert.ok(m.rels('UMLAssociation').find((a) => a.end2.name === 'order' && m.ends(a)[0] === 'OrderLine'));
  assert.deepEqual([m.attr('OrderLine', 'qty').defaultValue, m.attr('OrderLine', 'qty').isReadOnly], ['1', false]);
  assert.equal(m.op('OrderLine', 'OrderLine'), null, 'a primary constructor of properties only is not an operation');
  assert.deepEqual([...m.ends(assoc('orders')), assoc('orders').end2.multiplicity], ['Customer', 'Order', '*']);
  assert.equal(m.cls('Local'), null, 'classes inside functions are skipped');
  assert.equal(m.cls('Lines'), null, 'type aliases are skipped');
});

test('Kotlin: scripts (.kts), interfaces extending interfaces, generic bounds and broken input', () => {
  const kts = 'plugins {\n    kotlin("jvm") version "2.0.0"\n}\n\nval greeting = "hi"\n\ninterface Repo<T : Any> : Iterable<T>, AutoCloseable {\n    fun find(id: Long): T?\n}\n\nfun interface Handler { fun handle(e: String) }\n\nclass Store<K, V : Comparable<V>> private constructor(val map: Map<K, V>) : Repo<V>\n';
  const m = load(reverseEngineer([{ name: 'build.gradle.kts', content: kts }, { name: 'Broken.kt', content: 'class A { val a = ; fun f( { } } class B : { val b: Int' }], 'kotlin'));
  assert.equal(m.cls('Repo')._type, 'UMLInterface');
  assert.deepEqual(m.cls('Repo').templateParameters.map((t) => [t.name, t.parameterType]), [['T', 'Any']]);
  assert.deepEqual([m.op('Repo', 'find').isAbstract, m.ret(m.op('Repo', 'find')).multiplicity], [true, '0..1']);
  assert.equal(m.cls('Handler')._type, 'UMLInterface', 'fun interface');
  const store = m.cls('Store');
  assert.deepEqual(store.templateParameters.map((t) => [t.name, t.parameterType]), [['K', ''], ['V', 'Comparable<V>']]);
  assert.deepEqual([m.op('Store', 'Store').visibility, m.attr('Store', 'map').type], ['private', 'Map<K, V>'], 'explicit private constructor');
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Store' && b === 'Repo'));
  assert.ok(m.cls('A') && m.cls('B'), 'broken input keeps what was understood');
});

// ───────────────────────── PHP

const PHP_ORDER = String.raw`<html><?php /* inline */ ?></html>
<?php
declare(strict_types=1);

namespace App\Model;

use App\Contracts\Priced;
use App\Support\{Money, Clock as Time};
use function App\helpers\format;
use DateTimeImmutable;

/**
 * A customer order.
 *
 * @author someone
 */
#[ORM\Entity(repositoryClass: OrderRepository::class)]
final class Order extends BaseEntity implements Priced, \JsonSerializable
{
    use HasTimestamps, SoftDeletes;

    public const MAX = 10;
    private const string PREFIX = 'O-', SUFFIX = '#';

    /** @var OrderLine[] */
    private array $lines = [];

    /**
     * The buyer.
     * @var Customer|null
     */
    protected ?Customer $customer = null;

    # a hash comment with 'quotes' and { braces
    public static int $count = 0;
    var $legacy;
    private string $note = "a ; tricky { string } ?> inside";
    public readonly string $code;
    /** @var array<string, Tag> */
    private $tags;
    private $ratio = 0.5, $flag = true;

    public function __construct(
        private readonly int $id,
        public Customer $owner,
        protected ?Status $status = null,
        string $label = 'none',
    ) {
        parent::__construct();
        $this->code = <<<EOT
            O-{$id} } ;
            EOT;
    }

    /**
     * Total with a discount.
     *
     * @param float $discount the rate
     * @param string ...$codes
     * @return float
     * @throws \InvalidArgumentException
     */
    public function total(float $discount = 0.1, string ...$codes): float
    {
        return 0.0;
    }

    /**
     * @param OrderLine[] $lines
     * @return static
     */
    public static function create(array $lines, &$errors = []): static
    {
        return new static();
    }

    public function price(string $currency): float { return 1.0; }

    final public function clear(): void {}

    public function jsonSerialize(): mixed { return []; }
}
`;
const PHP_OTHERS = [
  { name: 'src/Model/BaseEntity.php', content: '<?php\nnamespace App\\Model;\n\n/** Base of all entities. */\nabstract class BaseEntity\n{\n    protected int $id;\n    abstract public function describe(): string;\n    abstract protected function validate(): bool;\n}\n' },
  {
    name: 'src/more.php',
    content: String.raw`<?php
namespace App\Contracts {
    /** Has a price. */
    interface Priced extends \Countable
    {
        const TAX = 0.1;
        public function price(string $currency): float;
    }
}

namespace App\Model {
    enum Status: string implements \App\Contracts\Priced
    {
        /** New one. */
        case New = 'new';
        case Done = 'done';
        const DEFAULT = self::New;
        public function price(string $currency): float { return 0; }
        public static function fromLabel(string $label): self { return self::New; }
    }

    trait HasTimestamps { protected ?DateTimeImmutable $createdAt = null; }

    class Customer { /** @var Order[] */ public array $orders = []; public string $name = ''; }

    class OrderLine
    {
        public function __construct(public Order $order, public int $qty = 1) {}
    }

    function helper() { class Local {} }
}
`,
  },
];

test('PHP: namespaces, uses, classes, typed and PHPDoc properties, promotion, methods and relationships', () => {
  const m = load(reverseEngineer([{ name: 'src/Model/Order.php', content: PHP_ORDER }, ...PHP_OTHERS], 'php'));
  assert.deepEqual(m.warnings.filter((w) => w.code === 'reverse.parseError'), []);
  assert.equal(m.ownerName(m.cls('Order')), 'Model');
  assert.equal(m.ownerName(m.named('UMLPackage', 'Model')), 'App', 'App\\Model → nested packages');
  assert.equal(m.ownerName(m.cls('Priced')), 'Contracts', 'namespace block');
  assert.equal(m.ownerName(m.cls('Status')), 'Model', 'second namespace block of the file');
  const order = m.cls('Order');
  assert.deepEqual([order.documentation, order.isFinalSpecialization, order.isAbstract], ['A customer order.', true, false]);
  // Constants and properties.
  assert.deepEqual([m.attr('Order', 'MAX').isStatic, m.attr('Order', 'MAX').isReadOnly, m.attr('Order', 'MAX').defaultValue, m.attr('Order', 'MAX').type], [true, true, '10', 'int']);
  assert.deepEqual([m.attr('Order', 'PREFIX').type, m.attr('Order', 'PREFIX').visibility, m.attr('Order', 'SUFFIX').defaultValue], ['string', 'private', "'#'"]);
  const assoc = (name) => m.rels('UMLAssociation').find((a) => a.end2.name === name);
  assert.deepEqual([...m.ends(assoc('lines')), assoc('lines').end2.multiplicity, assoc('lines').end2.visibility], ['Order', 'OrderLine', '*', 'private'], '@var OrderLine[] on array');
  assert.deepEqual([...m.ends(assoc('customer')), assoc('customer').end2.multiplicity, assoc('customer').end2.visibility, assoc('customer').end2.documentation], ['Order', 'Customer', '0..1', 'protected', 'The buyer.']);
  assert.deepEqual([m.attr('Order', 'count').isStatic, m.attr('Order', 'count').type, m.attr('Order', 'count').defaultValue], [true, 'int', '0']);
  assert.equal(m.attr('Order', 'legacy').visibility, 'public', 'var → public');
  assert.equal(m.attr('Order', 'note').defaultValue, '"a ; tricky { string } ?> inside"');
  assert.equal(m.attr('Order', 'code').isReadOnly, true);
  assert.deepEqual([m.attr('Order', 'tags').type, m.attr('Order', 'tags').multiplicity], ['Tag', '*'], 'array<string, Tag>');
  assert.deepEqual([m.attr('Order', 'ratio').type, m.attr('Order', 'flag').type], ['float', 'bool'], 'second declarator, inferred types');
  // Constructor promotion.
  assert.deepEqual([m.attr('Order', 'id').visibility, m.attr('Order', 'id').isReadOnly, m.attr('Order', 'id').type], ['private', true, 'int']);
  assert.ok(assoc('owner'), 'promoted property of a parsed class type');
  assert.deepEqual([m.attr('Order', 'status').visibility, m.typeName(m.attr('Order', 'status').type), m.attr('Order', 'status').multiplicity], ['protected', 'Status', '0..1']);
  assert.equal(m.attr('Order', 'label'), null, 'a plain constructor parameter is not a property');
  const ctor = m.op('Order', 'Order');
  assert.deepEqual(m.inputs(ctor).map((p) => [p.name, p.defaultValue]), [['id', ''], ['owner', ''], ['status', 'null'], ['label', "'none'"]]);
  // Methods.
  const total = m.op('Order', 'total');
  assert.equal(total.documentation, 'Total with a discount.');
  assert.deepEqual(m.inputs(total).map((p) => [p.name, p.type, p.multiplicity, p.defaultValue]), [['discount', 'float', '', '0.1'], ['codes', 'string', '*', '']]);
  assert.deepEqual([m.ret(total).type, total.raisedExceptions], ['float', 'InvalidArgumentException']);
  const create = m.op('Order', 'create');
  assert.equal(create.isStatic, true);
  assert.deepEqual(m.inputs(create).map((p) => [p.name, m.typeName(p.type), p.multiplicity, p.direction, p.defaultValue]), [['lines', 'OrderLine', '*', 'in', ''], ['errors', '', '', 'inout', '[]']]);
  assert.equal(m.typeName(m.ret(create).type), 'Order', 'static → the class');
  assert.deepEqual([m.op('Order', 'clear').isLeaf, m.ret(m.op('Order', 'clear'))], [true, null]);
  assert.equal(m.ret(m.op('Order', 'jsonSerialize')).type, 'mixed');
  assert.equal(order.operations.some((o) => o.name === '__construct'), false);
  // Relationships.
  assert.ok(m.rels('UMLGeneralization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'BaseEntity'));
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Order' && b === 'Priced'));
  assert.ok(m.rels('UMLInterfaceRealization').map(m.ends).some(([a, b]) => a === 'Status' && b === 'Priced'), 'fully qualified \\App\\Contracts\\Priced');
  assert.ok(m.warnings.some((w) => w.code === 'reverse.unresolvedType' && /JsonSerializable/.test(w.detail)));
  assert.ok(m.warnings.some((w) => w.code === 'reverse.unresolvedType' && /Countable/.test(w.detail)));
  // Other types.
  const base = m.cls('BaseEntity');
  assert.deepEqual([base.isAbstract, base.documentation, m.op('BaseEntity', 'describe').isAbstract, m.op('BaseEntity', 'validate').visibility], [true, 'Base of all entities.', true, 'protected']);
  const priced = m.cls('Priced');
  assert.deepEqual([priced._type, priced.documentation, m.op('Priced', 'price').isAbstract], ['UMLInterface', 'Has a price.', true]);
  assert.deepEqual([m.attr('Priced', 'TAX').isStatic, m.attr('Priced', 'TAX').type], [true, 'float']);
  const status = m.cls('Status');
  assert.deepEqual([status._type, status.literals.map((l) => l.name), status.literals[0].documentation], ['UMLEnumeration', ['New', 'Done'], 'New one.']);
  assert.deepEqual([m.attr('Status', 'DEFAULT').isStatic, m.op('Status', 'fromLabel').isStatic, m.typeName(m.ret(m.op('Status', 'fromLabel')).type)], [true, true, 'Status']);
  assert.equal(m.cls('HasTimestamps')._type, 'UMLClass', 'trait');
  assert.deepEqual([m.attr('HasTimestamps', 'createdAt').type, m.attr('HasTimestamps', 'createdAt').multiplicity], ['DateTimeImmutable', '0..1']);
  assert.deepEqual([...m.ends(assoc('orders')), assoc('orders').end2.multiplicity], ['Customer', 'Order', '*']);
  assert.ok(m.rels('UMLAssociation').find((a) => a.end2.name === 'order' && m.ends(a)[0] === 'OrderLine'));
  assert.equal(m.attr('OrderLine', 'qty').defaultValue, '1');
  assert.equal(m.cls('Local'), null, 'classes inside functions are skipped');
});

test('PHP: a file without an opening tag, accessors skipped, broken input', () => {
  const src = 'class Account { private int $balance = 0; public function getBalance(): int { return $this->balance; } public function setBalance(int $balance): void {} }';
  const m = load(reverseEngineer([{ name: 'Account.php', content: src }, { name: 'Broken.php', content: '<?php class A { public $a = ; function f( { } } class B extends { public int $b;' }], 'php', { skipAccessors: true }));
  assert.deepEqual(m.cls('Account').attributes.map((a) => a.name), ['balance']);
  assert.deepEqual((m.cls('Account').operations ?? []).map((o) => o.name), [], 'getBalance / setBalance skipped');
  assert.ok(m.cls('A') && m.cls('B'));
});

test('type text analysis: Kotlin and PHP forms', () => {
  assert.deepEqual(analyzeType('MutableList<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('Array<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('List<Item>?'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('Item?'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('IntArray'), { name: 'Int', multiplicity: '*' });
  assert.deepEqual(analyzeType('?Item'), { name: 'Item', multiplicity: '0..1' });
  assert.deepEqual(analyzeType('Item[]|null'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('array<int, Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('array<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('list<Item>'), { name: 'Item', multiplicity: '*' });
  assert.deepEqual(analyzeType('array'), { name: 'array', multiplicity: '' });
  assert.deepEqual(analyzeType('Collection<? extends Item>'), { name: '? extends Item', multiplicity: '*' });
});

// ───────────────────────── round trips

/** A model with packages, inheritance, an interface, an enum, collections and an association. */
function roundTripProject() {
  const project = createProject({ diagram: null });
  const model = project.ownedElements[0];
  const pkg = addElement(project, model._id, 'UMLPackage', { name: 'shop' });
  const sub = addElement(project, pkg._id, 'UMLPackage', { name: 'model' });
  const base = addElement(project, sub._id, 'UMLClass', { name: 'Entity', isAbstract: true, documentation: 'Base class.' });
  addElement(project, base._id, 'UMLAttribute', { name: 'id', type: 'long', visibility: 'protected' });
  const describe = addElement(project, base._id, 'UMLOperation', { name: 'describe', isAbstract: true });
  addElement(project, describe._id, 'UMLParameter', { name: '', type: 'String', direction: 'return' });
  const priced = addElement(project, pkg._id, 'UMLInterface', { name: 'Priced' });
  const price = addElement(project, priced._id, 'UMLOperation', { name: 'price', isAbstract: true });
  addElement(project, price._id, 'UMLParameter', { name: 'currency', type: 'String' });
  addElement(project, price._id, 'UMLParameter', { name: '', type: 'double', direction: 'return' });
  const item = addElement(project, sub._id, 'UMLClass', { name: 'Item' });
  addElement(project, item._id, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'private' });
  const order = addElement(project, sub._id, 'UMLClass', { name: 'Order', documentation: 'An order.' });
  addElement(project, order._id, 'UMLAttribute', { name: 'count', type: 'int', defaultValue: '0', visibility: 'private' });
  addElement(project, order._id, 'UMLAttribute', { name: 'tags', type: 'String', multiplicity: '*', visibility: 'private' });
  addElement(project, order._id, 'UMLAttribute', { name: 'LIMIT', type: 'int', defaultValue: '10', isStatic: true, isReadOnly: true });
  const status = addElement(project, sub._id, 'UMLEnumeration', { name: 'Status' });
  addElement(project, status._id, 'UMLEnumerationLiteral', { name: 'NEW' });
  addElement(project, status._id, 'UMLEnumerationLiteral', { name: 'DONE' });
  addElement(project, order._id, 'UMLAttribute', { name: 'status', type: ref(status) });
  const total = addElement(project, order._id, 'UMLOperation', { name: 'total' });
  addElement(project, total._id, 'UMLParameter', { name: 'discount', type: 'double' });
  addElement(project, total._id, 'UMLParameter', { name: '', type: 'double', direction: 'return' });
  addElement(project, order._id, 'UMLOperation', { name: 'clear' });
  addElement(project, sub._id, 'UMLGeneralization', { source: ref(order), target: ref(base) });
  addElement(project, sub._id, 'UMLInterfaceRealization', { source: ref(order), target: ref(priced) });
  addElement(project, sub._id, 'UMLAssociation', { end1: { reference: ref(order) }, end2: { reference: ref(item), name: 'items', multiplicity: '*', navigable: 'navigable' } });
  return { project, model };
}

/** A comparable summary of a model: classes with their package, attributes, operations, relationships. */
function summary(rootElements, project) {
  const index = buildIndex(project);
  const out = { classes: {}, relationships: [] };
  const typeText = (t) => (t && typeof t === 'object' ? `@${index.get(t)?.name}` : String(t ?? ''));
  for (const root of rootElements) {
    walk(root, (e) => {
      if (['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(e._type)) {
        out.classes[e.name] = {
          type: e._type,
          package: index.parent(e._id)?.name,
          abstract: Boolean(e.isAbstract),
          attributes: (e.attributes ?? []).map((a) => `${a.visibility} ${a.isStatic ? 'static ' : ''}${a.name}`).sort(),
          operations: (e.operations ?? []).map((o) => `${o.name}(${(o.parameters ?? []).filter((p) => p.direction !== 'return').map((p) => p.name).join(',')})${(o.parameters ?? []).some((p) => p.direction === 'return') ? ':R' : ''}${o.isAbstract ? ' abstract' : ''}`).sort(),
          literals: (e.literals ?? []).map((l) => l.name),
          types: (e.attributes ?? []).filter((a) => typeof a.type === 'object').map((a) => `${a.name}:${typeText(a.type)}`),
        };
      }
      if (e._type === 'UMLGeneralization' || e._type === 'UMLInterfaceRealization') out.relationships.push(`${e._type} ${index.get(e.source)?.name}->${index.get(e.target)?.name}`);
      if (e._type === 'UMLAssociation') out.relationships.push(`UMLAssociation ${index.get(e.end1.reference)?.name}->${index.get(e.end2.reference)?.name} ${e.end2.name} [${e.end2.multiplicity}]`);
    });
  }
  out.relationships.sort();
  return out;
}

function roundTrip(language, codegenOptions = {}, reverseOptions = {}) {
  const { project, model } = roundTripProject();
  const files = generateCode(project, model._id, language, codegenOptions);
  const result = reverseEngineer(files.map((f) => ({ name: f.path, content: f.content })), language, reverseOptions);
  assert.deepEqual(result.warnings, [], `${language} warnings`);
  const target = createProject({ diagram: null });
  for (const element of result.elements) insertElement(target.ownedElements[0], element);
  return { before: summary(model.ownedElements, project), after: summary(target.ownedElements[0].ownedElements, target) };
}

for (const language of ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php']) {
  test(`round trip: ${language} generate → reverse gives the same model`, () => {
    const { before, after } = roundTrip(language);
    assert.deepEqual(after, before);
  });
}

test('round trip: Java with getters/setters and skipAccessors', () => {
  const { before, after } = roundTrip('java', { getterSetter: true }, { skipAccessors: true });
  assert.deepEqual(after, before);
});

test('round trip: SQL generate → reverse gives the same tables, columns and keys', () => {
  for (const dialect of ['mysql', 'postgres', 'sqlite', 'sqlserver', 'oracle']) {
    const project = createProject({ diagram: null });
    const dm = addElement(project, project._id, 'ERDDataModel', { name: 'Shop' });
    const customer = addElement(project, dm._id, 'ERDEntity', { name: 'customer' });
    const cid = addElement(project, customer._id, 'ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true });
    addElement(project, customer._id, 'ERDColumn', { name: 'email', type: 'VARCHAR', length: '120', unique: true });
    const order = addElement(project, dm._id, 'ERDEntity', { name: 'order' });
    addElement(project, order._id, 'ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true });
    addElement(project, order._id, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', nullable: true, foreignKey: true, referenceTo: ref(cid) });
    addElement(project, order._id, 'ERDColumn', { name: 'note', type: 'VARCHAR', length: '20', defaultValue: "'x'", nullable: true });
    const [file] = generateCode(project, dm._id, 'sql', { dialect });
    const m = load(reverseEngineer([{ name: file.path, content: file.content }], 'sql'));
    const tables = m.all.filter((e) => e._type === 'ERDEntity');
    assert.deepEqual(tables.map((t) => t.name), ['customer', 'order'], dialect);
    const cols = (t) => t.columns.map((c) => `${c.name}${c.primaryKey ? ' pk' : ''}${c.nullable ? ' null' : ''}${c.unique ? ' uq' : ''}${c.foreignKey ? ` fk→${m.index.get(c.referenceTo)?.name}` : ''}${c.defaultValue ? ` =${c.defaultValue}` : ''}`);
    assert.deepEqual(cols(tables[0]), ['id pk', 'email uq'], dialect);
    assert.deepEqual(cols(tables[1]), ['id pk', 'customer_id null fk→id', "note null ='x'"], dialect);
    assert.equal(m.rels('ERDRelationship').length, 1, dialect);
  }
});
