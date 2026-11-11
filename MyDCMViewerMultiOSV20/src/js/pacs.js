/* PACS window: DICOM network nodes, verify (C-ECHO), search (C-FIND), retrieve (C-GET / C-MOVE),
 * send (C-STORE) and a Storage SCP that receives what C-MOVE or a modality pushes.
 * Protocol: dicomNet.js; sockets: net-transport.js (desktop only — a browser page cannot open TCP sockets).
 *
 *   PacsUI.dialog(box, payload, ctx)   the 'pacs' dialog
 *     payload { nodes: [{ name, ae, host, port }], localAE, localPort, inbox (folder for retrieved files; default ~/MyDCMViewer/PACS),
 *               sendFiles: [paths] (the open file / series, for C-STORE), sendLabel }
 *     ctx.send('nodes', { nodes, localAE, localPort })  — persist the node list
 *     ctx.send('retrieved', { dir, files })             — open what arrived
 *   PacsUI.SIZE  popup size hint
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PacsUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EN = {
    'pacs.title': 'PACS — DICOM network', 'pacs.nodes': 'Remote node', 'pacs.newNode': 'New node', 'pacs.name': 'Name', 'pacs.ae': 'AE title',
    'pacs.host': 'Host', 'pacs.port': 'Port', 'pacs.saveNode': 'Save', 'pacs.deleteNode': 'Delete', 'pacs.echo': 'Verify (C-ECHO)',
    'pacs.local': 'This computer', 'pacs.localAE': 'Our AE title', 'pacs.localPort': 'Receive port', 'pacs.scpStart': 'Start receiving',
    'pacs.scpStop': 'Stop receiving', 'pacs.scpOn': 'Receiving on port {port} as {ae}', 'pacs.scpOff': 'Not receiving',
    'pacs.search': 'Search', 'pacs.patientName': 'Patient name', 'pacs.patientId': 'Patient ID', 'pacs.dateFrom': 'From', 'pacs.dateTo': 'To',
    'pacs.modality': 'Modality', 'pacs.accession': 'Accession no.', 'pacs.find': 'Search (C-FIND)', 'pacs.clear': 'Clear',
    'pacs.studies': 'Studies', 'pacs.series': 'Series of the selected study', 'pacs.noResults': 'No matches.',
    'pacs.get': 'Retrieve (C-GET)', 'pacs.move': 'Retrieve (C-MOVE to us)', 'pacs.send': 'Send {what} (C-STORE)',
    'pacs.noSend': 'Open a DICOM file or series to send it.', 'pacs.desktopOnly': 'DICOM networking needs the desktop app: a web page cannot open network connections.',
    'pacs.echoOk': '{ae} answered C-ECHO ({ms} ms).', 'pacs.found': '{n} studies found.', 'pacs.foundSeries': '{n} series.',
    'pacs.retrieving': 'Retrieving… {n} received', 'pacs.retrieved': '{n} files received into {dir}', 'pacs.sending': 'Sending {done} / {total}…',
    'pacs.sent': 'Sent {ok} of {total} files.', 'pacs.received': 'Received {name} from {ae}', 'pacs.pickStudy': 'Select a study first.',
    'pacs.needNode': 'Fill in AE title, host and port.', 'pacs.hint': 'C-MOVE needs this computer registered on the PACS with our AE title, address and receive port.',
    'pacs.open': 'Open received files', 'pacs.date': 'Date', 'pacs.description': 'Description', 'pacs.count': 'Images', 'pacs.number': 'No.',
  };
  const KO = {
    'pacs.title': 'PACS — DICOM 네트워크', 'pacs.nodes': '원격 노드', 'pacs.newNode': '새 노드', 'pacs.name': '이름', 'pacs.ae': 'AE 타이틀',
    'pacs.host': '호스트', 'pacs.port': '포트', 'pacs.saveNode': '저장', 'pacs.deleteNode': '삭제', 'pacs.echo': '연결 확인 (C-ECHO)',
    'pacs.local': '이 컴퓨터', 'pacs.localAE': '우리 AE 타이틀', 'pacs.localPort': '수신 포트', 'pacs.scpStart': '수신 시작',
    'pacs.scpStop': '수신 중지', 'pacs.scpOn': '포트 {port}에서 {ae}(으)로 수신 중', 'pacs.scpOff': '수신 안 함',
    'pacs.search': '검색', 'pacs.patientName': '환자 이름', 'pacs.patientId': '환자 ID', 'pacs.dateFrom': '시작일', 'pacs.dateTo': '종료일',
    'pacs.modality': '장비', 'pacs.accession': '접수 번호', 'pacs.find': '검색 (C-FIND)', 'pacs.clear': '지우기',
    'pacs.studies': '검사', 'pacs.series': '선택한 검사의 시리즈', 'pacs.noResults': '찾은 결과가 없습니다.',
    'pacs.get': '가져오기 (C-GET)', 'pacs.move': '가져오기 (C-MOVE로 받기)', 'pacs.send': '{what} 보내기 (C-STORE)',
    'pacs.noSend': '보낼 DICOM 파일이나 시리즈를 먼저 여세요.', 'pacs.desktopOnly': 'DICOM 네트워크는 데스크톱 앱에서만 됩니다. 웹 페이지는 네트워크 연결을 열 수 없습니다.',
    'pacs.echoOk': '{ae}이(가) C-ECHO에 응답했습니다 ({ms} ms).', 'pacs.found': '검사 {n}건을 찾았습니다.', 'pacs.foundSeries': '시리즈 {n}개.',
    'pacs.retrieving': '가져오는 중… {n}개 받음', 'pacs.retrieved': '{dir}에 파일 {n}개를 받았습니다', 'pacs.sending': '보내는 중 {done} / {total}…',
    'pacs.sent': '{total}개 중 {ok}개를 보냈습니다.', 'pacs.received': '{ae}에서 {name} 받음', 'pacs.pickStudy': '먼저 검사를 고르세요.',
    'pacs.needNode': 'AE 타이틀, 호스트, 포트를 입력하세요.', 'pacs.hint': 'C-MOVE를 쓰려면 PACS에 이 컴퓨터(우리 AE 타이틀·주소·수신 포트)가 등록되어 있어야 합니다.',
    'pacs.open': '받은 파일 열기', 'pacs.date': '날짜', 'pacs.description': '설명', 'pacs.count': '영상', 'pacs.number': '번호',
  };
  const I18N = { en: EN, ko: KO };

  const STYLE = `
.pacs { display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.pacs h2 { margin: 0; }
.pacs fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px 10px; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: end; }
.pacs legend { padding: 0 4px; font-weight: 600; }
.pacs label { display: flex; flex-direction: column; gap: 2px; color: var(--text-dim); font-size: 12px; }
.pacs input, .pacs select { background: var(--panel-bg2); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text); font: inherit; }
.pacs input.ae { width: 130px; } .pacs input.host { width: 170px; } .pacs input.port { width: 70px; } .pacs input.q { width: 130px; } .pacs input[type=date] { width: 140px; }
.pacs .grid { max-height: 210px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; }
.pacs table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pacs th, .pacs td { padding: 4px 6px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border); }
.pacs th { position: sticky; top: 0; background: var(--panel-bg2); font-weight: 600; }
.pacs tbody tr { cursor: pointer; } .pacs tbody tr:hover { background: var(--hover, rgba(127,127,127,.12)); }
.pacs tbody tr.sel { background: var(--accent); color: var(--accent-text, #fff); }
.pacs .status { min-height: 18px; color: var(--accent); } .pacs .status.err { color: var(--danger, #ef4444); }
.pacs .hint { color: var(--text-dim); font-size: 11px; margin: 0; }
.pacs .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pacs .grow { flex: 1; }
`;

  function dialog(box, payload, ctx) {
    payload = payload || {};
    ctx = ctx || {};
    const I = typeof window !== 'undefined' && window.I18n;
    const t = (k, p) => {
      let s = I && I.t ? I.t(k, p) : k;
      if (s === k || s == null) {
        s = ((I18N[(I && I.lang) || 'en'] || EN)[k]) || EN[k] || k;
        if (p) s = s.replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? p[n] : m));
      }
      return s;
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const P = window.Platform, DN = window.DicomNet, NT = window.NetTransport;
    if (!document.getElementById('pacsStyle')) { const st = document.createElement('style'); st.id = 'pacsStyle'; st.textContent = STYLE; document.head.append(st); }
    box.classList.add('pacs');

    let nodes = (payload.nodes || []).map((n) => ({ ...n }));
    const online = !!(NT && NT.available && NT.available());
    box.innerHTML = `<h2>${esc(t('pacs.title'))}</h2>
      ${online ? '' : `<p class="status err">${esc(t('pacs.desktopOnly'))}</p>`}
      <fieldset><legend>${esc(t('pacs.nodes'))}</legend>
        <label>${esc(t('pacs.nodes'))}<select id="pcNode"></select></label>
        <label>${esc(t('pacs.name'))}<input id="pcName" class="ae"></label>
        <label>${esc(t('pacs.ae'))}<input id="pcAe" class="ae" maxlength="16"></label>
        <label>${esc(t('pacs.host'))}<input id="pcHost" class="host"></label>
        <label>${esc(t('pacs.port'))}<input id="pcPort" class="port" type="number" min="1" max="65535"></label>
        <button class="btn" id="pcSave">${esc(t('pacs.saveNode'))}</button>
        <button class="btn" id="pcDel">${esc(t('pacs.deleteNode'))}</button>
        <button class="btn primary" id="pcEcho">${esc(t('pacs.echo'))}</button>
      </fieldset>
      <fieldset><legend>${esc(t('pacs.local'))}</legend>
        <label>${esc(t('pacs.localAE'))}<input id="pcLae" class="ae" maxlength="16" value="${esc(payload.localAE || 'MYDCMVIEWER')}"></label>
        <label>${esc(t('pacs.localPort'))}<input id="pcLport" class="port" type="number" min="1" max="65535" value="${esc(payload.localPort || 11112)}"></label>
        <button class="btn" id="pcScp">${esc(t('pacs.scpStart'))}</button>
        <span id="pcScpState" class="grow">${esc(t('pacs.scpOff'))}</span>
        <p class="hint" style="flex-basis:100%">${esc(t('pacs.hint'))}</p>
      </fieldset>
      <fieldset><legend>${esc(t('pacs.search'))}</legend>
        <label>${esc(t('pacs.patientName'))}<input id="qName" class="q" placeholder="DOE^*"></label>
        <label>${esc(t('pacs.patientId'))}<input id="qId" class="q"></label>
        <label>${esc(t('pacs.dateFrom'))}<input id="qFrom" type="date"></label>
        <label>${esc(t('pacs.dateTo'))}<input id="qTo" type="date"></label>
        <label>${esc(t('pacs.modality'))}<input id="qMod" class="port" placeholder="CT"></label>
        <label>${esc(t('pacs.accession'))}<input id="qAcc" class="q"></label>
        <button class="btn primary" id="pcFind">${esc(t('pacs.find'))}</button>
        <button class="btn" id="pcClear">${esc(t('pacs.clear'))}</button>
      </fieldset>
      <div><b>${esc(t('pacs.studies'))}</b><div class="grid"><table id="pcStudies"><thead><tr>
        <th>${esc(t('pacs.patientName'))}</th><th>${esc(t('pacs.patientId'))}</th><th>${esc(t('pacs.date'))}</th><th>${esc(t('pacs.modality'))}</th>
        <th>${esc(t('pacs.description'))}</th><th>${esc(t('pacs.accession'))}</th><th>${esc(t('pacs.count'))}</th></tr></thead><tbody></tbody></table></div></div>
      <div><b>${esc(t('pacs.series'))}</b><div class="grid"><table id="pcSeries"><thead><tr>
        <th>${esc(t('pacs.number'))}</th><th>${esc(t('pacs.modality'))}</th><th>${esc(t('pacs.description'))}</th><th>${esc(t('pacs.count'))}</th></tr></thead><tbody></tbody></table></div></div>
      <div class="row">
        <button class="btn primary" id="pcGet">${esc(t('pacs.get'))}</button>
        <button class="btn" id="pcMove">${esc(t('pacs.move'))}</button>
        <button class="btn" id="pcSend">${esc(t('pacs.send', { what: payload.sendLabel || '' }).replace(/\s+/g, ' '))}</button>
        <span class="grow"></span>
        <button class="btn" id="pcOpen" disabled>${esc(t('pacs.open'))}</button>
        <button class="btn" id="pcClose">${esc(t('dlg.close') === 'dlg.close' ? 'Close' : t('dlg.close'))}</button>
      </div>
      <div class="status" id="pcStatus"></div>`;
    const q = (id) => box.querySelector('#' + id);
    const status = (msg, err) => { const s = q('pcStatus'); s.textContent = msg || ''; s.classList.toggle('err', !!err); };
    const fail = (e) => status((e && e.message) || String(e), true);

    // compressed files go out uncompressed when the peer accepts nothing else
    const transcode = window.DicomWriter ? (b) => window.DicomWriter.decompress(b) : undefined;

    /* ── nodes ── */
    let current = -1;
    const fillNodes = () => {
      q('pcNode').innerHTML = nodes.map((n, i) => `<option value="${i}">${esc(n.name || n.ae)} (${esc(n.ae)}@${esc(n.host)}:${esc(n.port)})</option>`).join('')
        + `<option value="-1">${esc(t('pacs.newNode'))}</option>`;
      q('pcNode').value = String(current);
    };
    const showNode = (i) => {
      current = i;
      const n = nodes[i] || { name: '', ae: '', host: '', port: 104 };
      q('pcName').value = n.name || ''; q('pcAe').value = n.ae || ''; q('pcHost').value = n.host || ''; q('pcPort').value = n.port || 104;
      fillNodes();
    };
    const formNode = () => ({ name: q('pcName').value.trim(), ae: q('pcAe').value.trim().toUpperCase(), host: q('pcHost').value.trim(), port: +q('pcPort').value || 0 });
    const persist = () => ctx.send('nodes', { nodes, localAE: localAE(), localPort: localPort() });
    const localAE = () => (q('pcLae').value.trim().toUpperCase() || 'MYDCMVIEWER');
    const localPort = () => +q('pcLport').value || 11112;
    q('pcNode').addEventListener('change', () => showNode(+q('pcNode').value));
    q('pcSave').addEventListener('click', () => {
      const n = formNode();
      if (!n.ae || !n.host || !n.port) { status(t('pacs.needNode'), true); return; }
      if (current >= 0) nodes[current] = n; else { nodes.push(n); current = nodes.length - 1; }
      fillNodes(); persist(); status('');
    });
    q('pcDel').addEventListener('click', () => { if (current < 0) return; nodes.splice(current, 1); showNode(nodes.length ? 0 : -1); persist(); });
    [q('pcLae'), q('pcLport')].forEach((e) => e.addEventListener('change', persist));
    showNode(nodes.length ? 0 : -1);

    const client = () => {
      const n = formNode();
      if (!n.ae || !n.host || !n.port) throw new Error(t('pacs.needNode'));
      if (!online) throw new Error(t('pacs.desktopOnly'));
      return NT.client({ host: n.host, port: n.port, callingAE: localAE(), calledAE: n.ae, timeout: 15000, dimseTimeout: 60000 });
    };
    // one network operation at a time
    let busy = false;
    const run = (fn) => async () => {
      if (busy) return;
      busy = true;
      box.querySelectorAll('button').forEach((b) => { if (b.id !== 'pcClose') b.disabled = true; });
      try { await fn(); } catch (e) { fail(e); } finally {
        busy = false;
        box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        q('pcOpen').disabled = !lastReceived.files.length;
      }
    };

    q('pcEcho').addEventListener('click', run(async () => {
      const t0 = Date.now();
      const st = await client().echo();
      if (!st.ok) throw new Error(st.text);
      status(t('pacs.echoOk', { ae: formNode().ae, ms: Date.now() - t0 }));
    }));

    /* ── search ── */
    const da = (v) => String(v || '').replace(/-/g, '');
    const str = (v) => (Array.isArray(v) ? v.join('\\') : v == null ? '' : typeof v === 'object' && v.Alphabetic ? v.Alphabetic : String(v));
    const fmtDate = (v) => { const s = str(v); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s; };
    let studies = [], series = [], selStudy = -1, selSeries = -1;
    const studyQuery = () => {
      const from = da(q('qFrom').value), to = da(q('qTo').value);
      const query = {
        PatientName: q('qName').value.trim(), PatientID: q('qId').value.trim(),
        StudyDate: from || to ? `${from}-${to}` : '', AccessionNumber: q('qAcc').value.trim(), ModalitiesInStudy: q('qMod').value.trim().toUpperCase(),
      };
      for (const k of DN.DEFAULT_KEYS.STUDY) if (!(k in query)) query[k] = '';
      return query;
    };
    const rows = (tb, list, cells, sel, onPick) => {
      const body = q(tb).querySelector('tbody');
      body.innerHTML = list.length ? list.map((r, i) => `<tr data-i="${i}"${i === sel ? ' class="sel"' : ''}>${cells(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="7" class="hint">${esc(t('pacs.noResults'))}</td></tr>`;
      body.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => onPick(+tr.dataset.i)));
    };
    const showStudies = () => rows('pcStudies', studies, (r) => [str(r.PatientName), str(r.PatientID), fmtDate(r.StudyDate), str(r.ModalitiesInStudy), str(r.StudyDescription), str(r.AccessionNumber), str(r.NumberOfStudyRelatedInstances)], selStudy, pickStudy);
    const showSeries = () => rows('pcSeries', series, (r) => [str(r.SeriesNumber), str(r.Modality), str(r.SeriesDescription), str(r.NumberOfSeriesRelatedInstances)], selSeries, (i) => { selSeries = selSeries === i ? -1 : i; showSeries(); });
    async function pickStudy(i) {
      selStudy = i; selSeries = -1; series = [];
      showStudies(); showSeries();
      await run(async () => {
        const query = { StudyInstanceUID: str(studies[i].StudyInstanceUID) };
        for (const k of DN.DEFAULT_KEYS.SERIES) if (!(k in query)) query[k] = '';
        series = await client().find({ level: 'SERIES', root: 'study', query });
        series.sort((a, b) => (+str(a.SeriesNumber) || 0) - (+str(b.SeriesNumber) || 0));
        showSeries();
        status(t('pacs.foundSeries', { n: series.length }));
      })();
    }
    q('pcFind').addEventListener('click', run(async () => {
      studies = await client().find({ level: 'STUDY', root: 'study', query: studyQuery() });
      selStudy = -1; series = []; selSeries = -1;
      showStudies(); showSeries();
      status(t('pacs.found', { n: studies.length }));
    }));
    q('pcClear').addEventListener('click', () => { ['qName', 'qId', 'qFrom', 'qTo', 'qMod', 'qAcc'].forEach((id) => { q(id).value = ''; }); });
    showStudies(); showSeries();

    /* ── received files: one folder per retrieve / SCP session under the inbox ── */
    const lastReceived = { dir: '', files: [] };
    let folderFor = null;
    const inbox = async () => {
      if (!folderFor) {
        const base = payload.inbox || (P.isDesktop ? P.join(await P.homeDir(), 'MyDCMViewer', 'PACS') : '/PACS');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
        folderFor = await P.uniqueDir(P.join(base, stamp));
        lastReceived.dir = folderFor; lastReceived.files = [];
      }
      return folderFor;
    };
    const saveInstance = async (part10) => {
      const info = DN.parsePart10(part10);
      const dir = await inbox();
      // numbered: the same SOP Instance UID may arrive twice (different transfer syntaxes)
      const name = `${String(lastReceived.files.length + 1).padStart(4, '0')}_${(info.sopInstanceUid || String(Date.now())).replace(/[^0-9.]/g, '').slice(0, 64)}.dcm`;
      const path = P.join(dir, name);
      await P.writeFile(path, part10);
      lastReceived.files.push(path);
      q('pcOpen').disabled = false;
      return path;
    };
    const retrieveQuery = () => {
      if (selStudy < 0) throw new Error(t('pacs.pickStudy'));
      const st = studies[selStudy];
      return selSeries >= 0
        ? { level: 'SERIES', root: 'study', query: { StudyInstanceUID: str(st.StudyInstanceUID), SeriesInstanceUID: str(series[selSeries].SeriesInstanceUID) } }
        : { level: 'STUDY', root: 'study', query: { StudyInstanceUID: str(st.StudyInstanceUID) } };
    };
    const finish = () => {
      status(t('pacs.retrieved', { n: lastReceived.files.length, dir: lastReceived.dir }));
      if (lastReceived.files.length) ctx.send('retrieved', { dir: lastReceived.dir, files: lastReceived.files.slice() });
    };
    q('pcGet').addEventListener('click', run(async () => {
      const rq = retrieveQuery();
      folderFor = null;
      const r = await client().get(rq, {
        onInstance: async (part10) => { await saveInstance(part10); status(t('pacs.retrieving', { n: lastReceived.files.length })); return 0; },
      });
      if (r && r.ok === false && !lastReceived.files.length) throw new Error(r.text || 'C-GET failed');
      finish();
    }));
    q('pcMove').addEventListener('click', run(async () => {
      const rq = retrieveQuery();
      if (!scp) await startScp();
      folderFor = null;
      const before = lastReceived.files.length;
      const r = await client().move(rq, localAE(), { onProgress: () => status(t('pacs.retrieving', { n: lastReceived.files.length - before })) });
      if (r && r.ok === false && lastReceived.files.length === before) throw new Error(r.text || 'C-MOVE failed');
      finish();
    }));

    /* ── send ── */
    q('pcSend').addEventListener('click', run(async () => {
      const files = payload.sendFiles || [];
      if (!files.length) throw new Error(t('pacs.noSend'));
      const bytes = [];
      for (const f of files) bytes.push(new Uint8Array(await P.readFile(f)));
      const res = await client().store(bytes, { transcode, onProgress: (p) => status(t('pacs.sending', { done: p.done, total: p.total })) });
      const ok = res.filter((r) => r.ok).length;
      const bad = res.find((r) => !r.ok);
      status(t('pacs.sent', { ok, total: res.length }) + (bad ? ` — ${bad.text}` : ''), ok < res.length);
    }));

    /* ── Storage SCP ── */
    let scp = null;
    async function startScp() {
      if (!online) throw new Error(t('pacs.desktopOnly'));
      const ae = localAE(), port = localPort();
      const nodeList = () => nodes;
      const srv = await NT.listen(port, (transport, info) => {
        DN.serve(transport, {
          aeTitle: ae, acceptAll: true, anyCalledAE: true, transcode,
          onStore: async (part10, meta) => {
            const path = await saveInstance(part10);
            status(t('pacs.received', { name: P.basename(path), ae: (meta && meta.callingAE) || (info && info.peer) || '' }));
            return 0;
          },
          // C-MOVE from another node to one of the saved nodes
          moveDestination: (dest) => {
            const n = nodeList().find((x) => x.ae === dest);
            return n ? { aeTitle: n.ae, connect: () => NT.connect(n.host, n.port, { timeoutMs: 15000 }) } : null;
          },
        });
      });
      scp = srv;
      folderFor = null;
      q('pcScp').textContent = t('pacs.scpStop');
      q('pcScpState').textContent = t('pacs.scpOn', { port: srv.port || port, ae });
    }
    async function stopScp() {
      if (!scp) return;
      const s = scp; scp = null;
      await s.close();
      q('pcScp').textContent = t('pacs.scpStart');
      q('pcScpState').textContent = t('pacs.scpOff');
      if (lastReceived.files.length) finish();
    }
    q('pcScp').addEventListener('click', run(async () => { if (scp) await stopScp(); else await startScp(); }));
    q('pcOpen').addEventListener('click', () => { if (lastReceived.files.length) ctx.send('retrieved', { dir: lastReceived.dir, files: lastReceived.files.slice() }); });
    q('pcClose').addEventListener('click', async () => { await stopScp().catch(() => {}); ctx.close(); });
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => { if (scp) scp.close(); });
    if (ctx.onMessage) ctx.onMessage((event, data) => { if (event === 'send-files') payload.sendFiles = data || []; });
  }

  return { dialog, SIZE: { width: 980 }, I18N };
});
