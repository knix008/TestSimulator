// Model documents from templates (Tools › Generate document…): the project or
// one package as a neutral list of blocks — cover, table of contents,
// headings, paragraphs, tables, diagram pictures, page breaks — that the
// Word (.docx), PDF and HTML writers turn into files. A template picks which
// elements and diagrams appear and which sections are on by default; the
// caller may switch sections on or off. Korean or English text. Pure (no DOM).
import { fieldsOf, typeDef, typeLabel } from './meta.js';
import { buildIndex, isDiagram, qualifiedName, relationshipEnds, walk } from './model.js';
import { TEXT, crossReferences, facts, fieldLabel } from './docs.js';

export const REPORT_FORMATS = ['docx', 'pdf', 'html'];
export const REPORT_SECTIONS = ['cover', 'toc', 'diagrams', 'documentation', 'properties', 'attributes', 'operations', 'relationships', 'tags', 'requirements'];

const DESIGN_TYPES = new Set(['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType', 'UMLEnumeration', 'UMLSignal', 'UMLComponent', 'UMLSubsystem', 'UMLArtifact', 'UMLNode', 'UMLDevice', 'UMLExecutionEnvironment', 'SysMLBlock', 'SysMLInterfaceBlock', 'SysMLValueType']);
const DESIGN_DIAGRAMS = new Set(['UMLClassDiagram', 'UMLPackageDiagram', 'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLSequenceDiagram', 'UMLCommunicationDiagram', 'UMLStatechartDiagram', 'UMLActivityDiagram', 'SysMLBlockDefinitionDiagram', 'SysMLInternalBlockDiagram']);
const isPackage = (element) => element?._type === 'Project' || typeDef(element?._type)?.group === 'package';
/** Elements a full report documents: everything but features, ends, tags, views, relationships and diagrams. */
const documentable = (e) => {
  const def = typeDef(e._type);
  return Boolean(def) && !def.feature && !def.edge && !isDiagram(e) && !/End$/.test(e._type) && !['UMLTag', 'UMLRegion', 'UMLInteractionOperand'].includes(e._type) && !isPackage(e);
};

/** Built-in templates: which elements and diagrams, and the sections that are on by default. */
export const REPORT_TEMPLATES = {
  full: { sections: REPORT_SECTIONS, element: documentable, diagram: () => true },
  requirements: { sections: ['cover', 'toc', 'diagrams', 'documentation', 'properties', 'relationships', 'tags', 'requirements'], element: (e) => e._type === 'SysMLRequirement', diagram: (d) => d._type === 'SysMLRequirementDiagram' },
  design: { sections: ['cover', 'toc', 'diagrams', 'documentation', 'attributes', 'operations', 'relationships', 'tags'], element: (e) => DESIGN_TYPES.has(e._type), diagram: (d) => DESIGN_DIAGRAMS.has(d._type) },
  usecase: { sections: ['cover', 'toc', 'diagrams', 'documentation', 'properties', 'relationships', 'tags'], element: (e) => e._type === 'UMLUseCase' || e._type === 'UMLActor', diagram: (d) => d._type === 'UMLUseCaseDiagram' },
  data: { sections: ['cover', 'toc', 'diagrams', 'documentation', 'attributes', 'relationships'], element: (e) => e._type === 'ERDEntity', diagram: (d) => d._type === 'ERDDiagram' },
};
export const REPORT_TEMPLATE_IDS = Object.keys(REPORT_TEMPLATES);

export const REPORT_TEXT = {
  ko: {
    templates: { full: '전체 모델 보고서', requirements: '요구사항 명세서', design: '설계 문서 (클래스 + 다이어그램)', usecase: '유스케이스 명세서', data: '데이터 사전 (ER)' },
    author: '작성자', version: '버전', date: '날짜', scope: '범위', contents: '목차', diagrams: '다이어그램', introduction: '개요', requirements: '요구사항',
    tags: '태그', constraints: '제약', tag: '태그', relationship: '관계', from: '출발', to: '대상', traceability: '추적', specification: '명세', figure: '그림',
    tocHint: '목차는 Word 에서 문서를 열 때 갱신됩니다 (마우스 오른쪽 › 필드 업데이트).', empty: '이 템플릿에 해당하는 요소가 없습니다.', page: '쪽',
  },
  en: {
    templates: { full: 'Full model report', requirements: 'Requirements specification', design: 'Design document (classes + diagrams)', usecase: 'Use case specification', data: 'Data dictionary (ER)' },
    author: 'Author', version: 'Version', date: 'Date', scope: 'Scope', contents: 'Contents', diagrams: 'Diagrams', introduction: 'Introduction', requirements: 'Requirements',
    tags: 'Tags', constraints: 'Constraints', tag: 'Tag', relationship: 'Relationship', from: 'From', to: 'To', traceability: 'Traceability', specification: 'Specification', figure: 'Figure',
    tocHint: 'The table of contents is updated when Word opens the document (right-click › Update Field).', empty: 'This template found no elements.', page: 'Page',
  },
};

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The default options of a template: { template, sections: { id: bool }, language, format }. */
export function defaultReportOptions(template = 'full', language = 'ko') {
  const def = REPORT_TEMPLATES[template] ?? REPORT_TEMPLATES.full;
  return { template: REPORT_TEMPLATES[template] ? template : 'full', sections: Object.fromEntries(REPORT_SECTIONS.map((s) => [s, def.sections.includes(s)])), language, format: 'docx', scopeId: '' };
}

/**
 * The document as blocks:
 *   { title, subtitle, language, meta: { author, version, date, scope }, blocks: [
 *     { kind: 'cover', title, subtitle, rows: [[label, value]] } | { kind: 'toc', title, hint } |
 *     { kind: 'heading', level, text, id } | { kind: 'paragraph', text, style? ('meta'|'doc') } |
 *     { kind: 'table', head: [], rows: [[]] } | { kind: 'image', diagram, caption } | { kind: 'list', items: [] } | { kind: 'pagebreak' } ] }
 * Options: template, sections ({ id: bool }, missing ids → the template's default), scopeId, language, title, author, version, date.
 */
export function buildReport(project, options = {}) {
  const language = options.language === 'en' ? 'en' : 'ko';
  const t = TEXT[language];
  const r = REPORT_TEXT[language];
  const templateId = REPORT_TEMPLATES[options.template] ? options.template : 'full';
  const template = REPORT_TEMPLATES[templateId];
  const on = (section) => (options.sections && section in options.sections ? Boolean(options.sections[section]) : template.sections.includes(section));
  const index = buildIndex(project);
  const scope = (options.scopeId && index.get(options.scopeId)) || project;
  const { diagramsOf, relationshipsOf } = crossReferences(project);
  const name = (e) => e?.name || `(${typeLabel(e?._type ?? '', language)})`;
  const qname = (e) => qualifiedName(project, e._id, index) || name(e);

  const elements = [];
  const diagrams = [];
  walk(scope, (e) => {
    if (e === project) return;
    if (isDiagram(e)) { if (template.diagram(e)) diagrams.push(e); return; }
    if (template.element(e) && documentable(e)) elements.push(e);
  });

  const title = options.title || (scope === project ? project.name : scope.name) || t.project;
  const subtitle = r.templates[templateId];
  const meta = { author: options.author ?? project.author ?? '', version: options.version ?? project.version ?? '', date: options.date || today(), scope: scope === project ? project.name : qname(scope) };
  const blocks = [];
  if (on('cover')) {
    blocks.push({ kind: 'cover', title, subtitle, rows: [[r.author, meta.author], [r.version, meta.version], [r.date, meta.date], [r.scope, meta.scope]].filter(([, v]) => v) });
  }
  if (on('toc')) blocks.push({ kind: 'toc', title: r.contents, hint: r.tocHint });
  if (scope.documentation && on('documentation')) blocks.push({ kind: 'heading', level: 1, text: r.introduction, id: 'intro' }, { kind: 'paragraph', text: scope.documentation, style: 'doc' });

  if (on('diagrams') && diagrams.length) {
    blocks.push({ kind: 'heading', level: 1, text: r.diagrams, id: 'diagrams' });
    diagrams.forEach((d, i) => {
      blocks.push({ kind: 'heading', level: 2, text: name(d), id: d._id });
      blocks.push({ kind: 'paragraph', text: `${t.type}: ${typeLabel(d._type, language)} · ${t.qualifiedName}: ${qname(d)}`, style: 'meta' });
      blocks.push({ kind: 'image', diagram: d, caption: `${r.figure} ${i + 1}. ${name(d)}` });
      if (d.documentation && on('documentation')) blocks.push({ kind: 'paragraph', text: d.documentation, style: 'doc' });
    });
  }

  // Elements, one chapter per package.
  let chapter = null;
  for (const e of elements) {
    let owner = index.parent(e._id);
    while (owner && !isPackage(owner)) owner = index.parent(owner._id);
    owner ??= project;
    if (owner !== chapter) {
      chapter = owner;
      blocks.push({ kind: 'heading', level: 1, text: owner === project ? (project.name || t.project) : qname(owner), id: owner._id });
      if (owner !== project && owner !== scope && owner.documentation && on('documentation')) blocks.push({ kind: 'paragraph', text: owner.documentation, style: 'doc' });
    }
    const f = facts(project, e, index, language, diagramsOf, relationshipsOf);
    blocks.push({ kind: 'heading', level: 2, text: name(e), id: e._id });
    blocks.push({ kind: 'paragraph', text: `${t.type}: ${typeLabel(e._type, language)} · ${t.qualifiedName}: ${qname(e)}`, style: 'meta' });
    if (on('documentation') && e.documentation) blocks.push({ kind: 'paragraph', text: e.documentation, style: 'doc' });
    if (on('properties') && f.properties.length) blocks.push({ kind: 'heading', level: 3, text: t.properties }, { kind: 'table', head: [t.property, t.value], rows: f.properties.map(([k, v]) => [k, v]) });
    if (on('attributes')) {
      if (f.attributes.length) blocks.push({ kind: 'heading', level: 3, text: t.attributes }, { kind: 'table', head: [t.visibility, t.name, t.typeCol, t.multiplicity, t.defaultValue], rows: f.attributes.map(([v, n, ty, m, d]) => [v, n, ty, m, d]) });
      if (f.literals.length) blocks.push({ kind: 'heading', level: 3, text: t.literals }, { kind: 'list', items: f.literals });
      if (f.columns.length) blocks.push({ kind: 'heading', level: 3, text: t.columns }, { kind: 'table', head: [t.name, t.typeCol, t.key, 'NULL', fieldLabel('referenceTo', language)], rows: f.columns });
    }
    if (on('operations') && f.operations.length) blocks.push({ kind: 'heading', level: 3, text: t.operations }, { kind: 'table', head: [t.visibility, t.name, t.parameters, t.returns], rows: f.operations.map(([v, n, p, ret]) => [v, n, p, ret]) });
    if (on('relationships') && f.relationships.length) blocks.push({ kind: 'heading', level: 3, text: t.relationships }, { kind: 'table', head: [r.relationship, t.type, r.from, r.to], rows: f.relationships.map((x) => [x.name, x.type, name(x.from), name(x.to)]) });
    if (on('tags')) {
      const tags = (e.tags ?? []).map((tag) => [tag.name ?? '', tag.kind === 'reference' ? name(index.get(tag.reference)) : String(tag.value ?? '')]);
      if (tags.length) blocks.push({ kind: 'heading', level: 3, text: r.tags }, { kind: 'table', head: [t.name, t.value], rows: tags });
      const rules = (e.ownedRules ?? []).map((c) => [c.name ?? '', c.specification ?? '']);
      if (rules.length) blocks.push({ kind: 'heading', level: 3, text: r.constraints }, { kind: 'table', head: [t.name, r.specification], rows: rules });
    }
    if (on('diagrams') && f.diagrams.length) blocks.push({ kind: 'paragraph', text: `${t.appearsIn}: ${f.diagrams.map(name).join(', ')}`, style: 'meta' });
  }

  // Requirements table: the fields of SysMLRequirement (whatever meta.js defines) and their trace links.
  const requirements = [];
  walk(scope, (e) => { if (e._type === 'SysMLRequirement') requirements.push(e); });
  if (on('requirements') && requirements.length) {
    const fields = fieldsOf('SysMLRequirement').filter((f) => !['name', 'documentation', 'stereotype', 'id', 'text'].includes(f.key) && f.type !== 'ref' && f.type !== 'refs');
    const head = ['ID', t.name, fieldLabel('text', language), ...fields.map((f) => fieldLabel(f.key, language)), r.traceability];
    const rows = requirements.map((q) => {
      const links = (relationshipsOf.get(q._id) ?? []).map((x) => {
        const [a, b] = relationshipEnds(x);
        const other = index.get(a === q._id ? b : a);
        return `${typeLabel(x._type, language)} ${a === q._id ? '→' : '←'} ${name(other)}`;
      });
      return [String(q.id ?? ''), name(q), String(q.text ?? ''), ...fields.map((f) => (typeof q[f.key] === 'boolean' ? (q[f.key] ? t.yes : t.no) : String(q[f.key] ?? ''))), links.join('\n')];
    });
    blocks.push({ kind: 'heading', level: 1, text: r.requirements, id: 'requirements' }, { kind: 'table', head, rows });
  }
  if (!blocks.some((b) => b.kind === 'heading')) blocks.push({ kind: 'paragraph', text: r.empty });
  return { title, subtitle, language, template: templateId, meta, blocks };
}

/** Headings of a report (for tables of contents). */
export const reportHeadings = (report) => report.blocks.filter((b) => b.kind === 'heading' && b.level <= 2);
