import './talk.css';
import { chatMessages, chatPeople, chatRooms, checkChat, currentSession, fetchChatFile, loginSession, logoutSession, openChat, postChat, postChatFile, rememberProfile, savedLogin, sessionProfile, sessionToken, watchSharedSession } from '../platform/data.js';

const text = {
  ko: {
    product: 'MyWorkForce Talk',
    hint: '같은 회사 사람과 대화하고, 작업 알림을 받습니다.',
    account: '로그인 ID',
    password: '암호',
    signIn: '로그인',
    signOut: '로그아웃',
    notices: '알림',
    talks: '대화',
    people: '사람',
    group: '단체 대화',
    groupName: '대화 이름',
    create: '만들기',
    needTwo: '두 명 이상을 고르세요.',
    empty: '대화를 고르거나 사람을 누르세요.',
    placeholder: '메시지를 입력하세요',
    send: '보내기',
    file: '파일',
    language: 'EN',
    work: '작업 프로그램',
    sent: '파일을 보냈습니다.',
    failed: '보내지 못했습니다.',
    show: '비밀번호 표시',
    confirm: '확인',
    confirmed: '확인함',
    personal: '이 알림은 로그인한 사람만 확인합니다.',
  },
  en: {
    product: 'MyWorkForce Talk',
    hint: 'Talk with people in this company and receive work notices.',
    account: 'Login ID',
    password: 'Password',
    signIn: 'Sign in',
    signOut: 'Sign out',
    notices: 'Notices',
    talks: 'Talks',
    people: 'People',
    group: 'Group talk',
    groupName: 'Talk name',
    create: 'Create',
    needTwo: 'Choose at least two people.',
    empty: 'Choose a talk, or press a person.',
    placeholder: 'Write a message',
    send: 'Send',
    file: 'File',
    language: 'KO',
    work: 'Work',
    sent: 'The file was sent.',
    failed: 'That could not be sent.',
    show: 'Show password',
    confirm: 'Confirm',
    confirmed: 'Confirmed',
    personal: 'Only the signed-in person confirms these notices.',
  },
};

const state = {
  language: 'ko',
  rooms: [],
  people: [],
  roomId: '',
  messages: [],
  error: '',
  account: '',
  password: '',
  groupOpen: false,
  picked: new Set(),
  groupName: '',
};

function t(key) { return text[state.language][key] || key; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function loadLanguage() {
  try {
    const settings = JSON.parse(localStorage.getItem('myworkforce-settings') || '{}');
    state.language = settings.language === 'en' ? 'en' : 'ko';
  } catch { state.language = 'ko'; }
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  document.documentElement.lang = state.language;
}

function roomTitle(room) {
  if (room.kind === 'notices') {
    const mine = state.people.find((person) => person.id === state.self)?.name || '';
    return mine ? `${mine} · ${t('notices')}` : t('notices');
  }
  return room.name || t('talks');
}

function shell() {
  const rooms = roomButtons();
  const people = personButtons();
  const checks = state.groupOpen ? state.people.filter((person) => person.id !== state.self).map((person) => `<label><input type="checkbox" data-pick="${esc(person.id)}" ${state.picked.has(person.id) ? 'checked' : ''}> ${esc(person.name)}</label>`).join('') : '';
  const messages = messageHtml();
  return `<div class="app">
    <header class="top"><img src="./icon.png" alt=""><b>${esc(t('product'))}</b><span>${esc(t('hint'))}</span><span class="grow"></span>
      <a href="./index.html">${esc(t('work'))}</a>
      <button type="button" class="quiet" data-action="language">${esc(t('language'))}</button>
      <button type="button" class="quiet" data-action="sign-out">${esc(t('signOut'))}</button>
    </header>
    <div class="body">
      <aside class="side">
        <h2>${esc(t('talks'))}</h2>
        <div class="rooms">${rooms}</div>
        <h2>${esc(t('people'))}</h2>
        <div class="people">${people}</div>
        <div class="group-box">
          <button type="button" data-action="group">${esc(t('group'))}</button>
          ${state.groupOpen ? `<input id="group-name" placeholder="${esc(t('groupName'))}" value="${esc(state.groupName)}"><div class="checks">${checks}</div><button type="button" class="primary" data-action="create-group">${esc(t('create'))}</button><p class="error">${esc(state.error)}</p>` : ''}
        </div>
      </aside>
      <section class="thread">
        <div class="messages" id="messages">${messages || `<p class="empty">${esc(t('empty'))}</p>`}</div>
        <form class="composer">
          <button type="button" class="quiet" data-action="file">${esc(t('file'))}</button>
          <textarea id="draft" placeholder="${esc(t('placeholder'))}"></textarea>
          <button type="submit">${esc(t('send'))}</button>
          <input id="file" type="file" hidden>
        </form>
      </section>
    </div>
  </div>`;
}

function loginCard() {
  return `<div class="login"><form class="card">
    <img src="./icon.png" alt="" width="36" height="36">
    <b>${esc(t('product'))}</b>
    <p class="muted">${esc(t('hint'))}</p>
    <label>${esc(t('account'))}<input name="account" value="${esc(state.account)}" autocomplete="username"></label>
    <label>${esc(t('password'))}<input name="password" type="password" autocomplete="current-password"></label>
    <label class="reveal"><input type="checkbox" data-reveal="password">${esc(t('show'))}</label>
    <p class="error">${esc(state.error)}</p>
    <button type="submit">${esc(t('signIn'))}</button>
  </form></div>`;
}

function roomButtons() {
  return state.rooms.map((room) => `<button type="button" class="room${room.id === state.roomId ? ' active' : ''}" data-room="${esc(room.id)}"><b>${esc(roomTitle(room))}</b><small>${esc(room.last?.body || '')}</small>${room.unread ? `<i>${room.unread}</i>` : ''}</button>`).join('');
}

function personButtons() {
  return state.people.filter((person) => person.id !== state.self).map((person) => `<button type="button" class="person" data-person="${esc(person.id)}"><b>${esc(person.name)}</b><small>${esc(person.login || '')}</small></button>`).join('');
}

function messageHtml() {
  const messages = state.messages.map((message) => {
    const mine = message.userId === state.self ? ' mine' : '';
    const notice = message.kind === 'notice' ? ' notice' : '';
    const who = message.kind === 'notice' ? t('notices') : (state.people.find((person) => person.id === message.userId)?.name || message.userId);
    const body = message.kind === 'file'
      ? `<a href="#" data-file="${esc(message.fileId)}" data-name="${esc(message.fileName)}">${esc(message.fileName || message.body)}</a>`
      : esc(message.body);
    const confirm = message.kind === 'notice'
      ? (message.checked
        ? `<button type="button" class="quiet" disabled>${esc(t('confirmed'))}</button>`
        : `<button type="button" data-action="check-notice" data-id="${esc(message.id)}">${esc(t('confirm'))}</button>`)
      : '';
    return `<article class="bubble${mine}${notice}${message.checked ? ' checked' : ''}"><div class="who">${esc(who)}</div><p>${body}</p>${confirm}</article>`;
  }).join('');
  const room = state.rooms.find((item) => item.id === state.roomId);
  const banner = room?.kind === 'notices' ? `<p class="notice-note">${esc(t('personal'))}</p>` : '';
  return banner + (messages || `<p class="empty">${esc(t('empty'))}</p>`);
}

function paint(options = {}) {
  const root = document.querySelector('#app');
  const live = sessionToken() && state.self && document.querySelector('.app');
  if (live && !options.full) {
    document.querySelector('.rooms').innerHTML = roomButtons();
    document.querySelector('.people').innerHTML = personButtons();
    const box = document.querySelector('#messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    box.innerHTML = messageHtml();
    if (atBottom) box.scrollTop = box.scrollHeight;
    return;
  }
  const draft = document.querySelector('#draft')?.value || '';
  root.innerHTML = sessionToken() && state.self ? shell() : loginCard();
  if (draft && document.querySelector('#draft')) document.querySelector('#draft').value = draft;
  const box = document.querySelector('#messages');
  if (box) box.scrollTop = box.scrollHeight;
}

async function refresh(full = false) {
  if (!state.self) return;
  const [rooms, people] = await Promise.all([chatRooms(), chatPeople()]);
  state.rooms = rooms.rooms || [];
  state.people = people.people || [];
  if (!state.roomId) state.roomId = state.rooms.find((room) => room.kind === 'notices')?.id || state.rooms[0]?.id || '';
  if (state.roomId) {
    const after = full ? '' : (state.messages.at(-1)?.at || '');
    const loaded = await chatMessages(state.roomId, after);
    const incoming = loaded.messages || [];
    state.messages = after ? state.messages.concat(incoming.filter((item) => !state.messages.some((have) => have.id === item.id))) : incoming;
  }
  paint();
}

let signing = false;

async function enter(account, password) {
  signing = true;
  try {
    const session = await loginSession(account, password);
    state.self = session.user.id;
    state.account = session.user.login || account;
    state.password = '';
    state.error = '';
    await refresh(true);
  } finally {
    signing = false;
  }
}

async function adopt(force = false) {
  if (signing) return;
  const token = sessionToken();
  if (!token) {
    if (state.self) {
      state.self = '';
      state.rooms = [];
      state.messages = [];
      state.roomId = '';
      paint({ full: true });
    }
    return;
  }
  const profile = sessionProfile();
  if (state.self && profile?.id === state.self && !force) return;
  try {
    const session = profile?.id ? { user: profile } : await currentSession();
    if (!profile?.id) rememberProfile(session.user);
    if (state.self === session.user.id && !force) return;
    state.self = session.user.id;
    state.account = session.user.login || session.user.name || state.account;
    state.roomId = '';
    state.messages = [];
    state.error = '';
    await refresh(true);
  } catch {
    state.self = '';
    paint({ full: true });
  }
}

document.querySelector('#app').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.classList.contains('card')) {
    enter(form.account.value.trim(), form.password.value).catch((error) => { state.error = error.message || t('failed'); paint({ full: true }); });
    return;
  }
  const draft = document.querySelector('#draft');
  const body = draft?.value.trim() || '';
  if (!body || !state.roomId) return;
  draft.value = '';
  postChat(state.roomId, body).then(() => refresh()).catch(() => { state.error = t('failed'); paint(); });
});

document.querySelector('#app').addEventListener('click', (event) => {
  const fileLink = event.target.closest('[data-file]');
  if (fileLink) {
    event.preventDefault();
    fetchChatFile(fileLink.dataset.file).then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileLink.dataset.name || 'file';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(() => { state.error = t('failed'); paint(); });
    return;
  }
  const room = event.target.closest('[data-room]');
  if (room) {
    state.roomId = room.dataset.room;
    state.messages = [];
    refresh(true).catch(() => {});
    return;
  }
  const person = event.target.closest('[data-person]');
  if (person) {
    openChat({ kind: 'direct', members: [person.dataset.person] }).then((result) => {
      state.roomId = result.room.id;
      state.messages = [];
      return refresh(true);
    }).catch(() => { state.error = t('failed'); paint(); });
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'sign-out') {
    logoutSession();
    state.self = '';
    state.rooms = [];
    state.messages = [];
    paint({ full: true });
  }
  if (action === 'language') {
    state.language = state.language === 'en' ? 'ko' : 'en';
    document.documentElement.lang = state.language;
    paint({ full: true });
  }
  if (action === 'group') { state.groupOpen = !state.groupOpen; state.error = ''; paint({ full: true }); }
  if (action === 'create-group') {
    const name = document.querySelector('#group-name')?.value.trim() || '';
    state.groupName = name;
    const members = [...state.picked];
    if (!name || members.length < 2) { state.error = t('needTwo'); paint(); return; }
    openChat({ kind: 'group', name, members }).then((result) => {
      state.roomId = result.room.id;
      state.groupOpen = false;
      state.picked.clear();
      state.groupName = '';
      state.messages = [];
      state.error = '';
      return refresh(true);
    }).catch(() => { state.error = t('failed'); paint({ full: true }); });
  }
  if (action === 'file') document.querySelector('#file')?.click();
  if (action === 'check-notice') {
    const id = event.target.closest('[data-action="check-notice"]')?.dataset.id;
    if (!id) return;
    checkChat(id).then(() => {
      const message = state.messages.find((item) => item.id === id);
      if (message) message.checked = true;
      return refresh();
    }).catch(() => { state.error = t('failed'); paint(); });
  }
});

document.querySelector('#app').addEventListener('change', (event) => {
  if (event.target.dataset.reveal === 'password') {
    const input = event.target.closest('form')?.querySelector('[name="password"]');
    if (input) input.type = event.target.checked ? 'text' : 'password';
    return;
  }
  const pick = event.target.dataset.pick;
  if (pick) {
    if (event.target.checked) state.picked.add(pick);
    else state.picked.delete(pick);
    return;
  }
  const file = event.target.id === 'file' ? event.target.files?.[0] : null;
  if (!file || !state.roomId) return;
  if (file.size > 8 * 1024 * 1024) { state.error = t('failed'); paint({ full: true }); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result || '').split(',')[1] || '';
    postChatFile(state.roomId, file.name, file.type || 'application/octet-stream', data)
      .then(() => refresh())
      .catch(() => { state.error = t('failed'); paint(); });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
});

document.querySelector('#app').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.id === 'draft' && !event.shiftKey) {
    event.preventDefault();
    event.target.closest('form')?.requestSubmit();
  }
});

async function boot() {
  if (!sessionToken()) {
    try {
      const settings = JSON.parse(localStorage.getItem('myworkforce-settings') || '{}');
      const saved = savedLogin();
      if (settings.autoLogin === true && saved?.account) await enter(saved.account, saved.password || '');
    } catch { /* the login card stays until an account is typed */ }
    return;
  }
  await adopt(true);
}

loadLanguage();
paint({ full: true });
boot().catch(() => { state.self = ''; paint({ full: true }); });
watchSharedSession(() => { adopt().catch(() => {}); });
setInterval(() => { if (state.self) refresh().catch(() => {}); }, 2000);
