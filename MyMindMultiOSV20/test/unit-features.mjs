// npm test, part two: each function of the pure modules on its own, including what is unusual
// (nothing selected, a missing id, nonsense from a file), and at the end the check that keeps the
// tests complete: anything the code offers that no test uses fails here.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function unitFeatures({ category, test, load, read, root }) {
  const doc = await load('src/store/document.ts')
  const settings = await load('src/settings.ts')
  const themes = await load('src/themes.ts')
  const board = await load('src/start/layout.ts')
  const markdown = await load('src/markdown.ts')
  const lineThemes = await load('src/lineThemes.ts')
  const diagramThemes = await load('src/diagramThemes.ts')
  const memo = await load('src/memo.ts')
  const pageSetup = await load('src/pageSetup.ts')
  const nodeIcons = await load('src/nodeIcons.ts')
  const shapes = await load('src/utils/shapePath.ts')
  const colors = await load('src/constants/colors.ts')
  const exportImage = await load('src/utils/exportImage.ts')
  const connectors = await load('src/utils/connectors.ts')
  const polygons = await load('src/utils/shapePolygons.ts')
  const grid = await load('src/canvasGrid.ts')

  /** Root, then A and B under it, then A1 and A2 under A. */
  const tree = () => {
    let d = doc.createMindmapDoc('Root')
    const rootId = d.nodes[0].id
    d = doc.addChild(d, rootId, 'A')
    const a = d.selectedId
    d = doc.addChild(d, rootId, 'B')
    const b = d.selectedId
    d = doc.addChild(d, a, 'A1')
    const a1 = d.selectedId
    d = doc.addChild(d, a, 'A2')
    return { d, rootId, a, b, a1, a2: d.selectedId }
  }
  const named = (d, text) => d.nodes.find((node) => node.text === text)

  await category('Document: adding')
  await test('a child: under its parent, with a line, selected, the document changed', () => {
    const { d, a } = tree()
    const child = named(d, 'A2')
    assert.equal(child.parentId, a)
    assert.equal(d.selectedId, child.id)
    assert.deepEqual(d.selectedIds, [child.id])
    assert.ok(d.edges.some((edge) => edge.from === a && edge.to === child.id))
    assert.equal(d.dirty, true)
  })
  await test('a child takes the document\'s shape and line defaults', () => {
    const start = { ...doc.createMindmapDoc('R'), defaultShape: 'hexagon', defaultLine: 'elbow', defaultLinePattern: 'dotted' }
    const d = doc.addChild(start, start.nodes[0].id, 'x')
    assert.equal(named(d, 'x').shape, 'hexagon')
    assert.equal(d.edges[0].lineType, 'elbow')
    assert.equal(d.edges[0].linePattern, 'dotted')
  })
  await test('a colour by level: siblings alike, the next level different', () => {
    const { d } = tree()
    assert.equal(named(d, 'A').color, named(d, 'B').color)
    assert.notEqual(named(d, 'A').color, named(d, 'A1').color)
  })
  await test('a sibling: beside the shape; of the root, a child, as it has no parent', () => {
    const { d, rootId, a } = tree()
    const beside = doc.addSibling(d, named(d, 'A1').id, 'S')
    assert.equal(named(beside, 'S').parentId, a)
    const ofRoot = doc.addSibling(d, rootId, 'T')
    assert.equal(named(ofRoot, 'T').parentId, rootId)
  })
  await test('fishbone roles follow the place: a category under the head, a cause below that', () => {
    let d = doc.createFishboneDoc('Effect', 'Cat')
    assert.equal(d.nodes[0].role, 'effect')
    assert.deepEqual(d.nodes.slice(1).map((node) => node.role), ['category', 'category', 'category', 'category'])
    assert.equal(d.edges.length, 4)
    d = doc.addChild(d, d.nodes[0].id, 'New category')
    assert.equal(named(d, 'New category').role, 'category')
    d = doc.addChild(d, named(d, 'New category').id, 'A cause')
    assert.equal(named(d, 'A cause').role, 'cause')
    d = doc.addSibling(d, named(d, 'A cause').id, 'Next cause')
    assert.equal(named(d, 'Next cause').role, 'cause')
  })
  await test('free text: where it is asked for, with no parent and no line', () => {
    const { d } = tree()
    const before = d.edges.length
    const next = doc.addFreeNode(d, 'Free', 11, 22)
    const free = named(next, 'Free')
    assert.deepEqual([free.parentId, free.x, free.y], [null, 11, 22])
    assert.equal(next.edges.length, before)
    assert.equal(next.selectedId, free.id)
  })

  await category('Document: deleting and copying')
  await test('deleting takes the branch and its lines, and selects the root', () => {
    const { d, rootId, a } = tree()
    const next = doc.deleteNode(d, a)
    assert.deepEqual(next.nodes.map((node) => node.text).sort(), ['B', 'Root'])
    assert.equal(next.edges.length, 1)
    assert.equal(next.selectedId, rootId)
    assert.deepEqual(next.selectedIds, [rootId])
    assert.equal(next.dirty, true)
  })
  await test('the root stays, alone or among others', () => {
    const { d, rootId, b } = tree()
    assert.equal(doc.deleteNode(d, rootId), d, 'nothing happens')
    const next = doc.deleteNodes(d, [rootId, b])
    assert.ok(next.nodes.some((node) => node.id === rootId))
    assert.ok(!next.nodes.some((node) => node.id === b))
  })
  await test('a free shape can be deleted, and a parent and its child selected together cause no trouble', () => {
    const { d, a, a1 } = tree()
    const free = doc.addFreeNode(d, 'Free', 0, 0)
    assert.ok(!named(doc.deleteNode(free, free.selectedId), 'Free'))
    assert.equal(doc.deleteNodes(d, [a, a1]).nodes.length, 2)
  })
  await test('a branch is collected from its top, whole', () => {
    const { d, a } = tree()
    assert.deepEqual(doc.collectSubtree(d.nodes, a).map((node) => node.text), ['A', 'A1', 'A2'])
    assert.deepEqual(doc.collectSubtree(d.nodes, 'no such id'), [])
  })
  await test('inserting a branch: fresh ids, moved by the offset, joined up and selected', () => {
    const { d, a, b } = tree()
    const branch = doc.collectSubtree(d.nodes, a)
    const next = doc.insertSubtree(d, branch, b, 10, 20)
    assert.equal(next.nodes.length, d.nodes.length + 3)
    assert.equal(new Set(next.nodes.map((node) => node.id)).size, next.nodes.length)
    const top = next.nodes.find((node) => node.id === next.selectedId)
    assert.deepEqual([top.text, top.parentId, top.x, top.y], ['A', b, branch[0].x + 10, branch[0].y + 20])
    assert.ok(next.edges.some((edge) => edge.from === b && edge.to === top.id))
    assert.equal(next.nodes.filter((node) => node.parentId === top.id).length, 2)
  })
  await test('inserting nothing changes nothing; without a parent the branch stands free, with no line to it', () => {
    const { d, a } = tree()
    assert.equal(doc.insertSubtree(d, [], null, 0, 0), d)
    const next = doc.insertSubtree(d, doc.collectSubtree(d.nodes, a), null, 0, 0)
    assert.equal(next.nodes.find((node) => node.id === next.selectedId).parentId, null)
    assert.equal(next.edges.length, d.edges.length + 2)
  })
  await test('a copy keeps the look of its lines, and whatever else its shapes have', () => {
    const { d, a, a1 } = tree()
    const styled = {
      ...doc.setNodeIcon(doc.updateMemo(d, { kind: 'node', id: a1 }, { note: 'hello' }), [a], 'star'),
    }
    const look = { color: '#ff0000', width: 6, lineType: 'elbow', linePattern: 'dashed', startCap: 'dot', endCap: 'arrow', fromSide: 'top', toSide: 'left' }
    const dressed = { ...styled, edges: styled.edges.map((edge) => ({ ...edge, ...look })) }
    const next = doc.duplicateNode(dressed, a)
    const top = next.nodes.find((node) => node.id === next.selectedId)
    assert.equal(top.icon, 'star')
    const child = next.nodes.find((node) => node.parentId === top.id && node.text === 'A1')
    assert.equal(child.note, 'hello')
    for (const edge of next.edges) for (const [key, value] of Object.entries(look)) assert.equal(edge[key], value, key)
  })
  await test('a copy under a line theme has the theme\'s colours, also when pasted elsewhere', () => {
    const { d, a, b } = tree()
    const themed = doc.applyLineTheme(d, lineThemes.lineThemeById('rainbow'))
    const next = doc.insertSubtree(themed, doc.collectSubtree(themed.nodes, a), b, 0, 0)
    const palette = lineThemes.lineThemeById('rainbow').palette
    for (const edge of next.edges) assert.ok(palette.includes(edge.color), edge.color)
  })
  await test('a duplicate is a sibling, moved aside; of a missing id, nothing; of the root, a free copy', () => {
    const { d, rootId, a } = tree()
    const next = doc.duplicateNode(d, a)
    const top = next.nodes.find((node) => node.id === next.selectedId)
    assert.equal(top.parentId, rootId)
    assert.equal(top.x, named(d, 'A').x + 40)
    assert.equal(doc.duplicateNode(d, 'missing'), d)
    const ofRoot = doc.duplicateNode(d, rootId)
    assert.equal(ofRoot.nodes.find((node) => node.id === ofRoot.selectedId).parentId, null)
  })
  await test('pasted into a fishbone, a branch takes the roles of its new place', () => {
    let d = doc.createFishboneDoc('Effect', 'Cat')
    const [, first, second] = d.nodes
    d = doc.addChild(d, first.id, 'cause')
    const branch = doc.collectSubtree(d.nodes, first.id)
    const next = doc.insertSubtree(d, branch, second.id, 0, 0)
    const top = next.nodes.find((node) => node.id === next.selectedId)
    assert.equal(top.role, 'cause', 'was a category')
  })

  await category('Document: editing')
  await test('moving one shape, and several by the same distance', () => {
    const { d, a, b, a1 } = tree()
    const one = doc.moveNode(d, a, 5, 6)
    assert.deepEqual([named(one, 'A').x, named(one, 'A').y], [5, 6])
    assert.equal(named(one, 'B').x, named(d, 'B').x)
    const many = doc.moveNodesBy(d, [a, b], 10, -10)
    assert.equal(named(many, 'A').x, named(d, 'A').x + 10)
    assert.equal(named(many, 'B').y, named(d, 'B').y - 10)
    assert.equal(doc.moveNodesBy(d, [a1], 1, 1).nodes.find((node) => node.id === a).x, named(d, 'A').x)
    assert.equal(many.dirty, true)
  })
  await test('text, shape, colour and text style go to the one asked for', () => {
    const { d, a } = tree()
    let next = doc.updateNodeText(d, a, 'Changed')
    assert.ok(named(next, 'Changed'))
    assert.ok(named(next, 'B'))
    next = doc.setNodeShape(d, a, 'diamond')
    assert.equal(named(next, 'A').shape, 'diamond')
    assert.equal(named(next, 'B').shape, 'rounded')
    assert.equal(next.defaultShape, 'diamond', 'the next shape takes it')
    next = doc.setNodeColor(d, a, '#123456')
    assert.equal(named(next, 'A').color, '#123456')
    assert.notEqual(named(next, 'B').color, '#123456')
    next = doc.setNodeTextStyle(d, a, { italic: true })
    assert.equal(named(next, 'A').textStyle.italic, true)
    assert.equal(named(next, 'A').textStyle.fontSize, 13, 'the rest stays')
    assert.equal(named(next, 'B').textStyle.italic, false)
  })
  await test('a text style on a shape from an old file, without one, is completed', () => {
    const { d, a } = tree()
    const old = { ...d, nodes: d.nodes.map((node) => (node.id === a ? { ...node, textStyle: undefined } : node)) }
    const style = named(doc.setNodeTextStyle(old, a, { bold: false }), 'A').textStyle
    assert.equal(style.bold, false)
    assert.equal(style.fontFamily, 'notoSansKr')
  })
  await test('a memo\'s look merges; removing it takes both the text and the look', () => {
    const { d, a } = tree()
    const target = { kind: 'node', id: a }
    let next = doc.updateMemo(d, target, { note: 'x', style: { width: 200 } })
    next = doc.updateMemo(next, target, { style: { height: 99 } })
    assert.deepEqual([named(next, 'A').note, named(next, 'A').noteStyle.width, named(next, 'A').noteStyle.height], ['x', 200, 99])
    next = doc.updateMemo(next, target, { remove: true })
    assert.equal('note' in named(next, 'A'), false)
    assert.equal('noteStyle' in named(next, 'A'), false)
    const line = { kind: 'edge', id: d.edges[0].id }
    assert.equal(doc.updateMemo(d, line, { note: 'y' }).edges[0].note, 'y')
  })
  await test('an empty memo is still a memo: only Remove takes it away', () => {
    const { d, a } = tree()
    const next = doc.updateMemo(doc.updateMemo(d, { kind: 'node', id: a }, { note: 'x' }), { kind: 'node', id: a }, { note: '' })
    assert.equal(named(next, 'A').note, '')
  })
  await test('a picture: small ones stay their size, large ones are fitted, and one with no size gets some', () => {
    const start = doc.createMindmapDoc('R')
    const small = doc.addImageNode(start, 'small', 'data:', 100, 50)
    assert.deepEqual([named(small, 'small').width, named(small, 'small').height], [100, 50])
    const large = doc.addImageNode(start, 'large', 'data:', 3200, 1000)
    assert.deepEqual([named(large, 'large').width, named(large, 'large').height], [320, 100])
    const tall = doc.addImageNode(start, 'tall', 'data:', 100, 2400)
    assert.equal(named(tall, 'tall').height, 240)
    const empty = doc.addImageNode(start, 'none', 'data:', 0, 0)
    assert.ok(named(empty, 'none').width >= 1 && named(empty, 'none').height >= 1)
    assert.ok(named(small, 'small').x > start.nodes[0].x + start.nodes[0].width, 'right of what is there')
  })
  await test('a picture\'s width keeps its proportions; a shape that is no picture ignores it', () => {
    const start = doc.addImageNode(doc.createMindmapDoc('R'), 'pic', 'data:', 200, 100)
    const id = named(start, 'pic').id
    const next = doc.setImageWidth(start, id, 400)
    assert.deepEqual([named(next, 'pic').width, named(next, 'pic').height], [400, 200])
    assert.equal(named(doc.setImageWidth(start, start.nodes[0].id, 999), 'R').width, start.nodes[0].width)
  })
  await test('an icon on several shapes, and off again', () => {
    const { d, a, b } = tree()
    const next = doc.setNodeIcon(d, [a, b], 'star')
    assert.deepEqual([named(next, 'A').icon, named(next, 'B').icon, named(next, 'A1').icon], ['star', 'star', undefined])
    assert.equal(named(doc.setNodeIcon(next, [a], undefined), 'A').icon, undefined)
  })
  await test('a line by id: the one line, and the defaults when its kind or pattern change', () => {
    const { d } = tree()
    const id = d.edges[0].id
    const next = doc.updateEdgeById(d, id, { lineType: 'elbow', linePattern: 'dotted', color: '#111111' })
    assert.equal(next.edges[0].color, '#111111')
    assert.notEqual(next.edges[1].color, '#111111')
    assert.deepEqual([next.defaultLine, next.defaultLinePattern], ['elbow', 'dotted'])
  })
  await test('setLayout changes the layout and places the shapes anew', () => {
    const { d } = tree()
    const next = doc.setLayout(d, 'ttb')
    assert.equal(next.layout, 'ttb')
    assert.ok(named(next, 'A').y > named(next, 'Root').y)
    assert.equal(next.dirty, true)
  })

  await category('Document: selecting')
  await test('selecting a line clears shapes; none clears everything', () => {
    const { d } = tree()
    const next = doc.selectEdge(d, d.edges[0].id)
    assert.deepEqual([next.selectedId, next.selectedIds, next.selectedEdgeId], [null, [], d.edges[0].id])
    const none = doc.selectEdge(next, null)
    assert.deepEqual([none.selectedEdgeId, none.selectedEdgeIds, none.selectedId, none.selectedIds], [null, [], null, []])
  })
  await test('toggling a shape: on, off, the last on is the current one, lines stay', () => {
    const { d, a, b } = tree()
    let next = doc.selectEdge({ ...d, selectedId: a, selectedIds: [a] }, d.edges[0].id, true)
    next = doc.toggleNodeSelection(next, b)
    assert.deepEqual(next.selectedIds, [a, b])
    assert.equal(next.selectedId, b)
    assert.equal(next.selectedEdgeId, d.edges[0].id)
    next = doc.toggleNodeSelection(next, b)
    assert.deepEqual(next.selectedIds, [a])
    assert.equal(next.selectedId, a)
    next = doc.toggleNodeSelection(next, a)
    assert.deepEqual([next.selectedId, next.selectedIds], [null, []])
  })
  await test('a marquee\'s shapes join without doubles, and with none selected the first becomes current', () => {
    const { d, a, b } = tree()
    const next = doc.addNodesToSelection({ ...d, selectedId: a, selectedIds: [a] }, [a, b])
    assert.deepEqual(next.selectedIds, [a, b])
    assert.equal(next.selectedId, a)
    const fresh = doc.addNodesToSelection({ ...d, selectedId: null, selectedIds: [] }, [b])
    assert.equal(fresh.selectedId, b)
    assert.equal(doc.addNodesToSelection({ ...d, selectedId: null, selectedIds: [] }, []).selectedId, null)
  })
  await test('what edits reach: nodes from the selection or the current one; lines from the selection or the shapes', () => {
    const { d, a, b } = tree()
    assert.deepEqual(doc.targetNodeIds({ ...d, selectedId: a, selectedIds: [] }), [a])
    assert.deepEqual(doc.targetNodeIds({ ...d, selectedId: null, selectedIds: [] }), [])
    assert.deepEqual(doc.targetNodeIds({ ...d, selectedIds: [a, b] }), [a, b])
    assert.equal(doc.targetEdgeIds({ ...d, selectedId: a, selectedIds: [a], selectedEdgeId: null }).length, 3)
    assert.deepEqual(doc.targetEdgeIds({ ...d, selectedEdgeId: 'x', selectedEdgeIds: undefined }), ['x'])
    assert.deepEqual(doc.targetEdgeIds({ ...d, selectedId: null, selectedIds: [], selectedEdgeId: null }), [])
  })
  await test('a line edit with no line to reach changes nothing', () => {
    const { d } = tree()
    const none = { ...d, selectedId: null, selectedIds: [], selectedEdgeId: null }
    assert.equal(doc.editLines(none, { color: '#000000' }), none)
  })

  await category('Document: modes, files and old files')
  await test('a mode change keeps content; a fishbone takes only left or right', () => {
    const { d } = tree()
    const labels = { central: 'c', effect: 'e', category: 'k' }
    assert.equal(doc.setMode(d, 'mindmap', labels), d, 'the same mode changes nothing')
    const fish = doc.setMode({ ...d, layout: 'ttb' }, 'fishbone', labels)
    assert.equal(fish.layout, 'ltr')
    assert.equal(doc.setMode({ ...d, layout: 'rtl' }, 'fishbone', labels).layout, 'rtl')
    assert.deepEqual(fish.nodes.map((node) => node.role).slice(0, 2), ['effect', 'category'])
    const back = doc.setMode(fish, 'mindmap', labels)
    assert.equal(back.nodes.some((node) => 'role' in node), false)
    assert.equal(back.nodes.length, d.nodes.length)
    assert.equal(doc.setMode({ ...fish, layout: 'radial' }, 'mindmap', labels).layout, 'radial')
  })
  await test('a saved file has no selection, no path and no unsaved mark, and all lines are complete', () => {
    const { d } = tree()
    const data = JSON.parse(doc.serialize({ ...d, filePath: 'x', dirty: true }))
    for (const key of ['selectedId', 'selectedIds', 'selectedEdgeId', 'filePath', 'dirty']) assert.equal(key in data, false, key)
    for (const edge of data.edges) {
      assert.deepEqual([edge.startCap, edge.endCap, edge.fromSide, edge.toSide], ['none', 'none', 'auto', 'auto'])
    }
  })
  await test('no theme in the file when none was chosen', () => {
    const data = JSON.parse(doc.serialize(doc.createMindmapDoc('R')))
    assert.equal('lineTheme' in data, false)
    assert.equal('diagramTheme' in data, false)
  })
  await test('an opened file is clean, knows its path, and has its first shape selected', () => {
    const { d } = tree()
    const opened = doc.deserialize(doc.serialize(d), 'C:/a.mmap')
    assert.equal(opened.dirty, false)
    assert.equal(opened.filePath, 'C:/a.mmap')
    assert.equal(opened.selectedId, d.nodes[0].id)
    assert.deepEqual(opened.selectedIds, [d.nodes[0].id])
  })
  await test('an empty diagram opens, with nothing selected', () => {
    const opened = doc.deserialize('{"nodes":[],"edges":[]}', null)
    assert.deepEqual([opened.selectedId, opened.selectedIds], [null, []])
  })
  await test('what a file gets wrong becomes valid: line kinds, patterns, caps, sides, text styles', () => {
    const opened = doc.deserialize(JSON.stringify({
      defaultLine: 'dashed',
      nodes: [{ id: 'a', parentId: null, text: 'a', x: 0, y: 0, width: 10, height: 10, shape: 'rect', color: '#000000' }],
      edges: [{ id: 'e', from: 'a', to: 'a', lineType: 'wobbly', linePattern: 'wavy', startCap: 'horn', endCap: 7, fromSide: 'inside', toSide: null, color: '#000000' }],
    }), null)
    assert.equal(opened.defaultLine, 'straight')
    assert.equal(opened.defaultLinePattern, 'dashed', 'an old file kept its pattern in the line kind')
    const [edge] = opened.edges
    assert.deepEqual([edge.lineType, edge.linePattern, edge.startCap, edge.endCap, edge.fromSide, edge.toSide], ['straight', 'solid', 'none', 'none', 'auto', 'auto'])
    assert.equal(opened.nodes[0].textStyle.fontFamily, 'notoSansKr')
  })
  await test('an old edge with its pattern in the line kind keeps it', () => {
    const opened = doc.deserialize(JSON.stringify({ nodes: [], edges: [{ id: 'e', from: 'a', to: 'b', lineType: 'dotted', color: '#000' }] }), null)
    assert.equal(opened.edges[0].linePattern, 'dotted')
  })
  await test('JSON without a diagram in it is refused', () => {
    assert.throws(() => doc.deserialize('{"hello":"world"}', null))
    assert.throws(() => doc.deserialize('[]', null))
    assert.throws(() => doc.deserialize('nonsense', null))
  })

  await category('Layouts')
  const bigTree = () => {
    let d = doc.createMindmapDoc('Root')
    const rootId = d.nodes[0].id
    const branches = []
    for (let i = 0; i < 6; i++) {
      d = doc.addChild(d, rootId, `b${i}`)
      branches.push(d.selectedId)
    }
    for (const [i, branch] of branches.entries()) {
      for (let j = 0; j < 3; j++) {
        d = doc.addChild(d, branch, `b${i}-${j}`)
        if (j === 0) {
          const leafParent = d.selectedId
          d = doc.addChild(d, leafParent, `b${i}-${j}-x`)
        }
      }
    }
    return d
  }
  const overlaps = (nodes) => {
    const hits = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const [a, b] = [nodes[i], nodes[j]]
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) hits.push(`${a.text}/${b.text}`)
      }
    }
    return hits
  }
  for (const layout of ['radial', 'ttb', 'btt', 'ltr', 'rtl']) {
    await test(`mind map ${layout}: no two shapes of a large diagram overlap`, () => {
      const laid = doc.relayout({ ...bigTree(), layout }, 1400, 800)
      assert.deepEqual(overlaps(laid.nodes), [])
    })
  }
  for (const [layout, side] of [['ltr', 1], ['rtl', -1], ['ttb', 1], ['btt', -1]]) {
    await test(`mind map ${layout}: each child is further out than its parent`, () => {
      const laid = doc.relayout({ ...bigTree(), layout }, 1400, 800)
      const axis = layout === 'ttb' || layout === 'btt' ? 'y' : 'x'
      for (const node of laid.nodes.filter((item) => item.parentId)) {
        const parent = laid.nodes.find((item) => item.id === node.parentId)
        assert.ok((node[axis] - parent[axis]) * side > 0, `${node.text} is not beyond ${parent.text}`)
      }
    })
  }
  await test('radial: every branch keeps away from the centre, all around it', () => {
    const laid = doc.relayout({ ...bigTree(), layout: 'radial' }, 1400, 800)
    const centre = laid.nodes[0]
    const directions = new Set(laid.nodes.filter((node) => node.parentId === centre.id).map((node) => `${Math.sign(node.x - centre.x)},${Math.sign(node.y - centre.y)}`))
    assert.ok(directions.size >= 3, [...directions].join(' '))
  })
  for (const layout of ['ltr', 'rtl']) {
    await test(`fishbone ${layout}: no two shapes of a large diagram overlap`, () => {
      const labels = { central: 'c', effect: 'e', category: 'k' }
      const laid = doc.relayout({ ...doc.setMode(bigTree(), 'fishbone', labels), layout }, 1400, 800)
      assert.deepEqual(overlaps(laid.nodes), [])
    })
  }
  await test('a shape on its own (free text, a picture) stays where it was through a layout', () => {
    const start = doc.addFreeNode(doc.addImageNode(bigTree(), 'pic', 'data:', 50, 50), 'Free', 3333, 4444)
    const laid = doc.relayout({ ...start, layout: 'ttb' }, 1400, 800)
    assert.deepEqual([named(laid, 'Free').x, named(laid, 'Free').y], [3333, 4444])
    assert.equal(named(laid, 'pic').x, named(start, 'pic').x)
  })
  await test('a layout of one shape, and of none, works', () => {
    for (const layout of ['radial', 'ttb', 'btt', 'ltr', 'rtl']) {
      const one = doc.relayout({ ...doc.createMindmapDoc('R'), layout }, 800, 500)
      assert.ok(Number.isFinite(one.nodes[0].x) && Number.isFinite(one.nodes[0].y), layout)
      assert.deepEqual(doc.relayout({ ...one, nodes: [] }, 800, 500).nodes, [])
    }
  })
  await test('a chain a hundred shapes deep has finite places', () => {
    let d = doc.createMindmapDoc('R')
    for (let i = 0; i < 100; i++) d = doc.addChild(d, d.selectedId, `n${i}`)
    for (const layout of ['radial', 'ttb', 'btt', 'ltr', 'rtl']) {
      for (const node of doc.relayout({ ...d, layout }, 800, 500).nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${layout} ${node.text}`)
    }
  })

  await category('Shapes')
  const KINDS = settings.SHAPES
  await test('thirty kinds, each a different path, each with its name in both languages', () => {
    assert.equal(KINDS.length, 30)
    assert.equal(new Set(KINDS.map((kind) => shapes.shapePath(kind, 0, 0, 140, 44))).size, 30)
    const ko = JSON.parse(read('src/i18n/locales/ko.json')).shape
    const en = JSON.parse(read('src/i18n/locales/en.json')).shape
    for (const kind of KINDS) assert.ok(ko[kind] && en[kind], kind)
    assert.deepEqual(Object.keys(ko).sort(), [...KINDS].sort())
  })
  await test('a shape drawn from an outline fills exactly its box', () => {
    for (const kind of KINDS) {
      const outline = polygons.polygonOutline(kind, 10, 20, 140, 44)
      if (!outline) continue
      assert.ok(Math.abs(Math.min(...outline.map((p) => p.x)) - 10) < 0.5, kind)
      assert.ok(Math.abs(Math.max(...outline.map((p) => p.x)) - 150) < 0.5, kind)
      assert.ok(Math.abs(Math.min(...outline.map((p) => p.y)) - 20) < 0.5, kind)
      assert.ok(Math.abs(Math.max(...outline.map((p) => p.y)) - 64) < 0.5, kind)
    }
    assert.equal(polygons.polygonOutline('rounded', 0, 0, 1, 1), null)
  })
  await test('a line ends where the outline is, on all four faces of every kind', () => {
    for (const kind of KINDS) {
      for (const [side, towards] of Object.entries({ top: { x: 70, y: -200 }, bottom: { x: 70, y: 300 }, left: { x: -300, y: 22 }, right: { x: 500, y: 22 } })) {
        const point = connectors.outlinePoint({ x: 0, y: 0, width: 140, height: 44, shape: kind }, towards)
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${kind} ${side}`)
        assert.ok(point.x >= -0.5 && point.x <= 140.5 && point.y >= -0.5 && point.y <= 44.5, `${kind} ${side}: ${JSON.stringify(point)}`)
        assert.ok(Math.hypot(point.x - 70, point.y - 22) > 1, `${kind} ${side}: it stops at the centre`)
      }
    }
  })
  await test('every shape can have lines of every kind without a number going wrong', () => {
    const others = { x: 300, y: 100, width: 140, height: 44, shape: 'rect' }
    for (const kind of KINDS) {
      const box = { x: 0, y: 0, width: 140, height: 44, shape: kind }
      for (const line of ['curve', 'straight', 'elbow']) assert.ok(!/NaN|undefined/.test(connectors.connectorPath(box, others, line, 'auto')), `${kind} ${line}`)
      assert.ok(!/NaN|undefined/.test(connectors.ribbonPath(box, others, 10, 4, 'auto')), kind)
    }
  })
  for (const [w, h] of [[140, 44], [8, 8], [800, 20], [20, 400]]) {
    await test(`at ${w}×${h} every path has only real numbers`, () => {
      for (const kind of KINDS) {
        const path_ = shapes.shapePath(kind, 10, 20, w, h)
        assert.ok(!/NaN|undefined|Infinity/.test(path_), `${kind}: ${path_}`)
        assert.match(path_, /^M /)
      }
    })
  }
  await test('a path moves with its box', () => {
    for (const kind of KINDS) assert.notEqual(shapes.shapePath(kind, 0, 0, 100, 50), shapes.shapePath(kind, 5, 0, 100, 50), kind)
  })
  await test('an unknown shape falls back to a drawing, not to nothing', () => {
    assert.match(shapes.shapePath('no-such-shape', 0, 0, 100, 50), /^M /)
  })

  await test('each outline stays in its box and goes round the whole of it', () => {
    for (const kind of KINDS) {
      const outline = connectors.shapeOutline(kind, 10, 20, 140, 44)
      assert.ok(outline.length >= 3, kind)
      for (const point of outline) assert.ok(point.x >= 9.5 && point.x <= 150.5 && point.y >= 19.5 && point.y <= 64.5, `${kind}: ${JSON.stringify(point)}`)
      assert.ok(Math.max(...outline.map((point) => point.x)) > 140 && Math.min(...outline.map((point) => point.x)) < 20, `${kind} is narrower than its box`)
    }
  })

  await category('The grid\'s drawing')
  await test('the path holds the lines picked, across the whole canvas, and nothing else', () => {
    const lines = (...at) => at.map((value, index) => ({ px: value, major: index === 0, value }))
    const path_ = grid.gridPath(lines(10, 20), lines(5), 300, 200, () => true)
    assert.ok(path_.includes('M10 0V200') && path_.includes('M20 0V200'), path_)
    assert.ok(path_.includes('M0 5H300'), path_)
    assert.equal(grid.gridPath(lines(10), lines(5), 300, 200, () => false), '')
  })

  await category('Themes of diagrams and of lines')
  await test('a line theme sets every line and the defaults, a colour per branch', () => {
    const { d, a, b } = tree()
    const theme = lineThemes.lineThemeById('rainbow')
    const next = doc.applyLineTheme(d, theme)
    assert.deepEqual([next.lineTheme, next.defaultLine, next.defaultLinePattern, next.dirty], ['rainbow', theme.lineType, theme.linePattern, true])
    const colour = (id) => next.edges.find((edge) => edge.to === id).color
    assert.notEqual(colour(a), colour(b))
    assert.equal(colour(named(next, 'A1').id), colour(a), 'a branch keeps its colour outward')
  })
  await test('every line theme is complete, with a known kind, pattern and caps, and names in both languages', () => {
    assert.equal(lineThemes.LINE_THEMES.length, 15)
    assert.equal(lineThemes.LINE_THEMES.length % 5, 0, 'the panel shows five in a row, with no hole')
    assert.equal(new Set(lineThemes.LINE_THEMES.map((theme) => theme.id)).size, lineThemes.LINE_THEMES.length)
    for (const theme of lineThemes.LINE_THEMES) {
      assert.ok(theme.ko && theme.en, theme.id)
      assert.ok(['curve', 'straight', 'elbow', 'root'].includes(theme.lineType), theme.id)
      assert.ok(['solid', 'dashed', 'dotted', 'dashdot'].includes(theme.linePattern), theme.id)
      assert.ok(['none', 'arrow', 'dot', 'diamond'].includes(theme.startCap), theme.id)
      assert.ok(['none', 'arrow', 'dot', 'diamond'].includes(theme.endCap), theme.id)
      assert.ok(theme.palette.length >= 1 && theme.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color)), theme.id)
    }
  })
  await test('an unknown theme id gives the default, and is known not to exist', () => {
    assert.equal(lineThemes.lineThemeById('nope').id, lineThemes.DEFAULT_LINE_THEME)
    assert.equal(lineThemes.lineThemeById(undefined).id, lineThemes.DEFAULT_LINE_THEME)
    assert.equal(lineThemes.isLineThemeId('nope'), false)
    assert.equal(lineThemes.isLineThemeId('rainbow'), true)
    assert.equal(diagramThemes.diagramThemeById('nope').id, diagramThemes.DEFAULT_DIAGRAM_THEME)
    assert.equal(diagramThemes.isDiagramThemeId('nope'), false)
    assert.equal(diagramThemes.isDiagramThemeId('forest'), true)
  })
  await test('each diagram theme reaches each level of a real tree, and pictures are left alone', () => {
    const { d } = tree()
    const start = doc.addImageNode(d, 'pic', 'data:', 10, 10)
    for (const theme of diagramThemes.DIAGRAM_THEMES) {
      const next = doc.applyDiagramTheme(start, theme)
      assert.equal(named(next, 'Root').shape, theme.rootShape, theme.id)
      assert.equal(named(next, 'A').shape, theme.shape, theme.id)
      assert.equal(named(next, 'A1').shape, theme.outer ?? theme.shape, theme.id)
      assert.equal(named(next, 'Root').color, theme.root, theme.id)
      assert.equal(named(next, 'pic').color, '#ffffff', theme.id)
      assert.equal(next.defaultShape, theme.shape, theme.id)
      assert.equal(next.lineTheme, theme.line, theme.id)
    }
  })
  await test('the icons: one found by id, an unknown one not', () => {
    assert.equal(nodeIcons.nodeIconById('star').id, 'star')
    assert.equal(nodeIcons.nodeIconById('nope'), undefined)
    assert.equal(nodeIcons.nodeIconById(undefined), undefined)
    assert.equal(new Set(nodeIcons.NODE_ICONS.map((icon) => icon.body)).size, nodeIcons.NODE_ICONS.length, 'no two icons are the same drawing')
  })
  await test('automatic text is dark on the light fills; a chosen colour is kept', () => {
    assert.equal(colors.resolveTextColor('auto', 'any'), '#111827')
    assert.equal(colors.resolveTextColor(undefined, 'any'), '#111827')
    assert.equal(colors.resolveTextColor('#123456', 'any'), '#123456')
  })
  await test('the chips of the colour picker are twenty different colours', () => {
    assert.equal(colors.NODE_COLORS.length, 20)
    assert.equal(new Set(colors.NODE_COLORS).size, 20)
  })

  await category('Program themes and settings')
  await test('contrast: black on white is 21, a colour on itself 1', () => {
    assert.ok(Math.abs(themes.contrast('#000000', '#ffffff') - 21) < 0.01)
    assert.ok(Math.abs(themes.contrast('#123456', '#123456') - 1) < 0.01)
    assert.equal(themes.contrast('#000000', '#ffffff'), themes.contrast('#ffffff', '#000000'))
  })
  await test('readable: a colour that reads stays; one that does not moves until it does', () => {
    assert.equal(themes.readable('#000000', ['#ffffff'], 3), '#000000')
    const moved = themes.readable('#fefefe', ['#ffffff'], 3)
    assert.ok(themes.contrast(moved, '#ffffff') >= 3)
    const both = themes.readable('#777777', ['#ffffff', '#fafafa'], 4.5)
    assert.ok(themes.contrast(both, '#ffffff') >= 4.4 && themes.contrast(both, '#fafafa') >= 4.4)
  })
  await test('theme lookups: unknown ids give the default; ids are told apart; the next one wraps round', () => {
    assert.equal(themes.themeById('nope').id, themes.DEFAULT_THEME_ID)
    assert.equal(themes.themeById(null).id, themes.DEFAULT_THEME_ID)
    assert.equal(themes.isThemeId('dark-midnight'), true)
    assert.equal(themes.isThemeId('nope'), false)
    assert.equal(themes.isThemeId('custom-a', [{ id: 'custom-a' }]), true)
    const seen = new Set()
    let id = themes.DEFAULT_THEME_ID
    for (let i = 0; i < 40; i++) {
      seen.add(id)
      id = themes.nextThemeId(id)
    }
    assert.equal(seen.size, 40)
    assert.equal(id, themes.DEFAULT_THEME_ID)
  })
  await test('a theme of my own: a copy of the base, under a name, with an id of its own', () => {
    const item = settings.customThemeFrom('dark-midnight', '  Mine  ', [])
    assert.equal(item.name, 'Mine')
    assert.equal(item.mode, 'dark')
    assert.match(item.id, /^custom-/)
    assert.deepEqual(item.colors, themes.themeColors(themes.themeById('dark-midnight')))
    assert.notEqual(settings.newCustomThemeId([item]), item.id)
    assert.equal(settings.customThemeFrom('dark-midnight', '   ', []).name, themes.themeById('dark-midnight').nameEn)
    assert.equal(settings.customThemeFrom('dark-midnight', 'x'.repeat(100), []).name.length, 40)
  })
  await test('a theme is built from its colours: its id, kind and swatches, and the tokens the program reads', () => {
    const base = themes.themeColors(themes.themeById('dark-midnight'))
    const built = themes.buildTheme('dark', 'test', '시험', 'Test', base)
    assert.deepEqual([built.id, built.mode, built.nameKo, built.nameEn], ['dark-test', 'dark', '시험', 'Test'])
    assert.equal(built.vars['--panel'], base.panel)
    assert.equal(built.swatch.length, 3)
    const mine = themes.customTheme({ id: 'custom-a', name: 'Mine', mode: 'light', colors: base })
    assert.deepEqual([mine.id, mine.mode, mine.nameKo, mine.nameEn], ['custom-a', 'light', 'Mine', 'Mine'])
  })
  await test('a registered theme of my own is found by id, and leaves when the list changes', () => {
    const item = settings.customThemeFrom('light-classic', 'Mine', [])
    themes.setCustomThemes([item])
    assert.equal(themes.themeById(item.id).id, item.id)
    assert.equal(themes.registeredCustomThemes().length, 1)
    assert.equal(themes.allThemes().length, 41)
    themes.setCustomThemes(null)
    assert.equal(themes.themeById(item.id).id, themes.DEFAULT_THEME_ID)
  })
  await test('recent files: the same file in another case counts once; it can be taken off; the list has an end', () => {
    assert.deepEqual(settings.addRecent(['C:/A.mmap'], 'c:/a.MMAP'), ['c:/a.MMAP'])
    assert.deepEqual(settings.removeRecent(['C:/A.mmap', 'b'], 'c:/a.mmap'), ['b'])
    const many = Array.from({ length: 50 }, (_, i) => `f${i}`)
    assert.equal(settings.sanitizeRecent(many).length, settings.MAX_RECENT)
    assert.deepEqual(settings.sanitizeRecent(['a', 3, null, '', 'b']), ['a', 'b'])
    assert.deepEqual(settings.sanitizeRecent('no'), [])
  })
  await test('the whole settings file: nonsense everywhere still gives a usable program', () => {
    for (const nonsense of [null, 3, 'x', [], { theme: 7, language: 'xx', showGrid: 'yes', general: 1, startScreen: 2, pageSetup: 3, recent: 4, customThemes: 5, leftPanel: {}, showMemos: [] }]) {
      const value = settings.sanitizeSettings(nonsense)
      assert.ok(themes.isThemeId(value.theme), 'theme')
      assert.ok(['ko', 'en'].includes(value.language), 'language')
      for (const key of ['showGrid', 'showRulers', 'leftPanel', 'rightPanel', 'showMemos']) assert.equal(typeof value[key], 'boolean', key)
      assert.ok(settings.MODES.includes(value.general.newMode))
      assert.ok(Array.isArray(value.recent) && Array.isArray(value.customThemes))
      assert.ok(pageSetup.PAPERS[value.pageSetup.paper])
    }
  })
  await test('new-diagram options: an unknown choice is replaced, a known one kept', () => {
    const value = settings.sanitizeGeneral({ newMode: 'fishbone', mindmapLayout: 'sideways', fishboneLayout: 'ttb', newShape: 'blob', newLineTheme: 'nope', newDiagramTheme: 'forest', reopenLast: 'yes' })
    assert.equal(value.newMode, 'fishbone')
    assert.ok(settings.MINDMAP_LAYOUTS.includes(value.mindmapLayout))
    assert.ok(settings.FISHBONE_LAYOUTS.includes(value.fishboneLayout))
    assert.ok(settings.SHAPES.includes(value.newShape))
    assert.equal(value.newLineTheme, 'default')
    assert.equal(value.newDiagramTheme, 'forest')
  })
  await test('the speed of the start screen: unset follows the system, set stays', () => {
    assert.equal(settings.effectiveSpeed(null, true), settings.REDUCED_MOTION_SPEED)
    assert.equal(settings.effectiveSpeed(null, false), settings.DEFAULT_SPEED)
    assert.equal(settings.effectiveSpeed(120, true), 120)
    assert.equal(settings.effectiveSpeed(0, false), 0)
  })

  await category('Page setup')
  await test('each paper, both ways round', () => {
    for (const [paper, [short, long]] of Object.entries(pageSetup.PAPERS)) {
      const base = { ...pageSetup.DEFAULT_PAGE_SETUP, paper }
      assert.deepEqual(pageSetup.sheetSize({ ...base, orientation: 'portrait' }, 10, 10), { width: short, height: long }, paper)
      assert.deepEqual(pageSetup.sheetSize({ ...base, orientation: 'landscape' }, 10, 10), { width: long, height: short }, paper)
    }
    assert.deepEqual(pageSetup.sheetSize({ ...pageSetup.DEFAULT_PAGE_SETUP, paper: 'Papyrus', orientation: 'portrait' }, 1, 1), { width: 210, height: 297 })
  })
  await test('automatic turning looks at the shape of each sheet\'s part', () => {
    const base = { ...pageSetup.DEFAULT_PAGE_SETUP, orientation: 'auto' }
    assert.equal(pageSetup.sheetSize(base, 200, 100).width, 297)
    assert.equal(pageSetup.sheetSize(base, 100, 200).width, 210)
    assert.equal(pageSetup.sheetSize({ ...base, pagesWide: 4 }, 200, 100).width, 210, 'four across makes each part tall')
  })
  await test('nonsense in a page setup is replaced, limits hold', () => {
    const value = pageSetup.sanitizePageSetup({ paper: 'Papyrus', orientation: 'sideways', margins: { top: 999, left: -5, right: 'x' }, header: 3, footer: { left: 5 }, headingSize: 1000, pagesWide: 99, pagesTall: 0, centerH: false })
    assert.equal(value.paper, 'A4')
    assert.equal(value.orientation, 'auto')
    assert.equal(value.margins.top, pageSetup.MARGIN_MAX)
    assert.equal(value.margins.left, 0)
    assert.equal(value.margins.right, pageSetup.DEFAULT_PAGE_SETUP.margins.right)
    assert.equal(value.pagesWide, pageSetup.PAGES_MAX)
    assert.equal(value.pagesTall, 1)
    assert.equal(value.headingSize, 24)
    assert.equal(value.centerH, false)
    assert.equal(value.centerV, true)
    assert.deepEqual(pageSetup.sanitizePageSetup(null), pageSetup.DEFAULT_PAGE_SETUP)
  })
  await test('sheets run left to right, then down', () => {
    const slices = pageSetup.pageSlices({ ...pageSetup.DEFAULT_PAGE_SETUP, pagesWide: 2, pagesTall: 2 }, { x: 10, y: 20, width: 100, height: 60 })
    assert.deepEqual(slices.map((slice) => [slice.x, slice.y]), [[10, 20], [60, 20], [10, 50], [60, 50]])
    assert.ok(slices.every((slice) => slice.width === 50 && slice.height === 30))
  })

  await category('Memos')
  await test('a memo\'s values are held to their limits, a bad pattern and bad colours replaced', () => {
    const value = memo.sanitizeMemo({ width: 9, height: 99999, fontSize: 1000, lineWidth: 0, linePattern: 'wavy', color: 'red', bold: 'yes', dx: 'x', dy: 7 })
    assert.equal(value.width, memo.MEMO_MIN_SIZE)
    assert.equal(value.height, memo.MEMO_MAX_SIZE)
    assert.equal(value.fontSize, memo.MEMO_FONT_MAX)
    assert.equal(value.lineWidth, memo.MEMO_LINE_MIN)
    assert.equal(value.linePattern, memo.DEFAULT_MEMO.linePattern)
    assert.equal(value.color, memo.DEFAULT_MEMO.color)
    assert.equal(value.dx, 0)
    assert.equal(value.dy, 7)
  })
  await test('nothing given is the default', () => {
    assert.deepEqual(memo.sanitizeMemo(undefined), memo.DEFAULT_MEMO)
    assert.deepEqual(memo.sanitizeMemo('x'), memo.DEFAULT_MEMO)
  })
  await test('wrapping: an empty text, one word too long, Korean without spaces', () => {
    const measure = (text) => text.length * 10
    assert.deepEqual(memo.wrapMemo('', 100, measure), [''])
    for (const line of memo.wrapMemo('x'.repeat(95), 100, measure)) assert.ok(line.length <= 10, line)
    for (const line of memo.wrapMemo('가나다라마바사아자차카타파하', 50, measure)) assert.ok(line.length <= 5, line)
    assert.equal(memo.wrapMemo('a\n\nb', 100, measure).length, 3, 'an empty line stays')
  })

  await category('The start screen\'s board')
  const cell = (col, row, w, h, fit = false) => ({ col, row, w, h, fit })
  await test('overlap: touching is none', () => {
    assert.equal(board.overlaps(cell(0, 0, 1, 2), cell(1, 0, 1, 2)), false)
    assert.equal(board.overlaps(cell(0, 0, 1, 2), cell(0, 2, 1, 2)), false)
    assert.equal(board.overlaps(cell(0, 0, 2, 2), cell(1, 1, 1, 1)), true)
  })
  await test('a saved cell that is out of range is brought in', () => {
    const value = board.clampCell({ col: 99, row: -5, w: 99, h: 0 })
    assert.ok(value.col >= 0 && value.col + value.w <= board.COLS)
    assert.ok(value.row >= 0 && value.h >= 1)
    assert.equal(board.clampCell(null).w >= 1, true)
  })
  await test('packing puts each card on the lowest place, and the cards never overlap', () => {
    const cards = board.pack(['a', 'b', 'c', 'd'], (id) => (id === 'a' ? 3 : 1), () => ({ h: 5, fit: true }))
    assert.deepEqual([cards.a.col, cards.a.row, cards.a.w], [0, 0, 3])
    assert.equal(cards.b.row, 5)
    const list = Object.values(cards)
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.equal(board.overlaps(list[i], list[j]), false)
  })
  await test('resolving pushes the others away from the pinned card; compacting closes the gaps', () => {
    const resolved = board.resolve({ a: cell(0, 0, 3, 4), b: cell(0, 2, 3, 4) }, 'b')
    assert.equal(resolved.b.row, 2, 'the pinned one stays')
    assert.equal(board.overlaps(resolved.a, resolved.b), false)
    const compacted = board.compact({ a: cell(0, 10, 1, 2) })
    assert.equal(compacted.a.row, 0)
  })
  await test('a height in rows covers the pixels, and has a least', () => {
    assert.equal(board.rowsFor(0), 2)
    assert.ok(board.rowsFor(1000) * board.ROW >= 1000)
  })
  await test('a layout key changes with the layout, and a saved layout has this version', () => {
    assert.notEqual(board.layoutKey({ a: cell(0, 0, 1, 1) }), board.layoutKey({ a: cell(1, 0, 1, 1) }))
    assert.equal(board.layoutValue({ a: cell(0, 0, 1, 1) }).version, board.LAYOUT_VERSION)
  })

  await category('Markdown of the guide')
  await test('headings of each level, code, lists of both kinds, a table and paragraphs', () => {
    const blocks = markdown.parseMarkdown('# One\r\n\r\n### Three\n\ntext\nmore text\n\n- a\n- b\n\n1. x\n2. y\n\n```\ncode **not bold**\n```\n\n| H1 | H2 |\n|---|---|\n| a | b |\n| c | d |\n')
    assert.deepEqual(blocks.map((block) => block.type), ['heading', 'heading', 'paragraph', 'list', 'list', 'code', 'table'])
    assert.equal(blocks[1].level, 3)
    assert.equal(blocks[2].text, 'text more text')
    assert.deepEqual([blocks[3].ordered, blocks[4].ordered], [false, true])
    assert.equal(blocks[5].text, 'code **not bold**')
    assert.deepEqual(blocks[6].head, ['H1', 'H2'])
    assert.deepEqual(blocks[6].rows, [['a', 'b'], ['c', 'd']])
  })
  await test('inline: bold, code, a picture and a link, between words', () => {
    assert.deepEqual(markdown.inlinePieces('a **b** `c` ![d](e.png) [f](g) h'), [{ text: 'a ' }, { bold: 'b' }, { text: ' ' }, { code: 'c' }, { text: ' ' }, { image: 'd', src: 'e.png' }, { text: ' ' }, { link: 'f', href: 'g' }, { text: ' h' }])
    assert.deepEqual(markdown.inlinePieces(''), [])
  })
  await test('an unfinished code block ends with the text, and nothing is lost', () => {
    const blocks = markdown.parseMarkdown('```\nopen code')
    assert.equal(blocks[0].text, 'open code')
    assert.deepEqual(markdown.parseMarkdown(''), [])
  })

  await category('Export formats')
  await test('each format the desktop offers; the web\'s are among them; those without transparency too', () => {
    assert.equal(exportImage.EXPORT_FORMATS.length, 15)
    assert.equal(new Set(exportImage.EXPORT_FORMATS).size, 15)
    for (const format of [...exportImage.WEB_EXPORT_FORMATS, ...exportImage.OPAQUE_FORMATS]) assert.ok(exportImage.EXPORT_FORMATS.includes(format), format)
  })

  await category('Nothing goes untested')
  const guiTests = read('test/gui.mjs') + read('test/gui-features.mjs') + read('test/gui-lib.mjs')
  const unitTests = read('test/run.mjs') + read('test/unit-features.mjs')
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))
  const sources = walk('src').filter((file) => /\.tsx?$/.test(file)).map((file) => read(file)).join('\n')
  const named_ = (pattern) => [...new Set([...sources.matchAll(pattern)].map((match) => match[1]))]
  const unused = (names, tests) => names.filter((name) => !tests.includes(name))
  await test('every button with a command name is pressed by a GUI test', () => {
    const commands = [...named_(/data-command="([\w-]+)"/g), ...named_(/\bcommand="([\w-]+)"/g)]
    assert.ok(commands.length > 50, `found only ${commands.length}`)
    assert.deepEqual(unused(commands, guiTests), [])
  })
  await test('every switch, stepper and list with a name is used by a GUI test', () => {
    const fields = [...named_(/<(?:Toggle|Stepper|IconSelect(?:<\w+>)?|ColorField|IconPalette|ColorPalette) id="(\w+)"/g), ...named_(/data-field="([\w-]+)"/g)]
    assert.ok(fields.length > 20, `found only ${fields.length}`)
    assert.deepEqual(unused(fields, guiTests), [])
  })
  await test('every tile and button of the start screen is pressed by a GUI test', () => {
    const buttons = [...named_(/data-start="([\w-]+)"/g), ...named_(/\{ id: '([\w-]+)', icon: '\w+',(?: flag:[^,]+,)? label:/g)]
    assert.ok(buttons.length > 12)
    assert.deepEqual(unused(buttons, guiTests), [])
  })
  await test('every tab of the settings window is visited by a GUI test', () => {
    assert.deepEqual(unused(named_(/\{ id: '(\w+)', icon: '\w+', label: t\('[\w.]+'\) \}/g), guiTests), [])
  })
  await test('every item of the title row\'s menus and of the right-click menu is pressed by a GUI test', () => {
    const toolbar = read('src/components/Toolbar.tsx')
    const menus = toolbar.slice(toolbar.indexOf('<ToolbarMenu'), toolbar.indexOf('className="title-file"'))
    const context = read('src/components/ContextMenu.tsx')
    const keys = new Set([...`${menus}\n${context}`.matchAll(/\bt\('([\w.]+)'/g)].map((match) => match[1]))
    keys.delete('toolbar.file')
    keys.delete('toolbar.edit')
    keys.delete('toolbar.view')
    keys.delete('toolbar.help')
    keys.delete('context.selectedCount')
    assert.ok(keys.size > 25, `found only ${keys.size}`)
    assert.deepEqual([...keys].filter((key) => !guiTests.includes(`ko.${key}`) && !guiTests.includes(`en.${key}`)), [])
  })
  await test('every function of the document model has a unit test', () => {
    const exported = [...read('src/store/document.ts').matchAll(/^export function (\w+)/gm)].map((match) => match[1])
    assert.ok(exported.length > 25)
    assert.deepEqual(exported.filter((name) => !unitTests.includes(`doc.${name}(`)), [])
  })
  await test('every function of the pure modules is named by a test', () => {
    const missing = []
    // Needs a document to change: the GUI tests watch it work ("every theme reaches the app's own tokens").
    const inTheWindow = ['themes.applyTheme']
    const modules = { 'src/settings.ts': 'settings', 'src/pageSetup.ts': 'pageSetup', 'src/memo.ts': 'memo', 'src/markdown.ts': 'markdown', 'src/start/layout.ts': 'board', 'src/lineThemes.ts': 'lineThemes', 'src/diagramThemes.ts': 'diagramThemes', 'src/nodeIcons.ts': 'nodeIcons', 'src/utils/connectors.ts': 'connectors', 'src/utils/shapePolygons.ts': 'polygons', 'src/canvasGrid.ts': 'grid', 'src/tutorials.ts': 'tutorials', 'src/themes.ts': 'themes' }
    for (const [file, name] of Object.entries(modules)) {
      for (const match of read(file).matchAll(/^export (?:function|const) (\w+)(?:\(|\s*=\s*\(|:\s*\S+\s*=\s*\()/gm)) {
        if (!unitTests.includes(`${name}.${match[1]}`) && !inTheWindow.includes(`${name}.${match[1]}`)) missing.push(`${file}: ${match[1]}`)
      }
    }
    assert.deepEqual(missing, [])
  })
  await test('every command of the Rust side is called from the page, and every call has a command', () => {
    const rust = read('src-tauri/src/main.rs') + read('src-tauri/src/popout.rs')
    const commands = [...rust.matchAll(/#\[tauri::command(?:\([^)]*\))?\]\s*(?:pub\s+)?(?:async\s+)?fn (\w+)/g)].map((match) => match[1])
    const called = [...read('src/host.ts').matchAll(/invoke\('([\w]+)'/g)].map((match) => match[1])
    assert.ok(commands.length > 15)
    assert.deepEqual(commands.filter((name) => !called.includes(name)), [], 'never called')
    assert.deepEqual(called.filter((name) => !commands.includes(name)), [], 'no such command')
    const handler = rust.slice(rust.indexOf('generate_handler!'))
    assert.deepEqual(commands.filter((name) => !handler.includes(name)), [], 'not registered')
  })
  await test('every function of host.ts is used by the program', () => {
    const others = walk('src').filter((file) => /\.tsx?$/.test(file) && !file.endsWith('host.ts')).map((file) => read(file)).join('\n')
    const hostFile = read('src/host.ts')
    const functions = [...hostFile.slice(hostFile.indexOf('export const host')).matchAll(/^ {2}(\w+):/gm)].map((match) => match[1])
    assert.ok(functions.length > 20)
    assert.deepEqual(functions.filter((name) => !others.includes(`host.${name}`)), [])
  })
  await test('the test files exist where the scripts say', () => {
    for (const file of ['test/gui.mjs', 'test/gui-features.mjs', 'test/gui-lib.mjs', 'test/run.mjs', 'test/unit-features.mjs']) assert.ok(fs.existsSync(path.join(root, file)), file)
  })
}
