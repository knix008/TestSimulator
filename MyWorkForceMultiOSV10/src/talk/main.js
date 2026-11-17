import './talk.css';
import { icon } from '../icons.js';
import { waitForService, changeOwnPassword, chatMessages, chatPeople, chatProfile, chatRooms, checkChat, currentSession, fetchChatFile, inviteChat, loginSession, logoutSession, openChat, postChat, postChatFile, rememberLogin, rememberProfile, saveChatProfile, savedLogin, sessionProfile, sessionToken, watchSharedSession } from '../platform/data.js';
import { installTooltips } from '../ui/tooltip.js';
import { openMain } from '../platform/native.js';

const text = {
  ko: {
    product: 'MyWorkForce Talk',
    hint: '같은 회사 사람과 대화하고, 작업 알림을 받습니다.',
    account: 'ID',
    password: 'Password',
    changeTitle: '새 암호 정하기',
    changeLead: '처음 로그인했습니다. 관리자가 정해 준 암호 대신, 자신만 아는 새 암호를 정해야 계속할 수 있습니다.',
    changeMine: '지금 암호를 확인한 뒤 새 암호로 바꿉니다.',
    changePassword: '암호 바꾸기',
    current: '지금 암호',
    next: '새 암호',
    again: '다시 입력',
    change: '바꾸기',
    cancel: '취소',
    changed: '암호를 바꿨습니다.',
    rule: '6자 이상, 지금 암호와 다르게 정합니다.',
    teams: '팀',
    noTeam: '팀 없음',
    lead: '팀장',
    errors: {
      password: '암호가 맞지 않습니다.',
      'not-registered': '등록된 사용자가 아닙니다.',
      'password-change': '처음 로그인했습니다. 계속하려면 새 암호를 정하세요.',
      'password-weak': '암호는 6자 이상이어야 합니다.',
      'password-same': '지금 암호와 다른 암호를 정하세요.',
      'password-mismatch': '새 암호 두 칸이 서로 다릅니다.',
      connect: '데이터 서비스에 연결하지 못했습니다.',
      service: '데이터 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.',
      permission: '권한이 없습니다.',
    },
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
    mine: '내 정보',
    details: '사람 정보',
    name: '이름',
    title: '직급',
    team: '팀',
    phone: '휴대폰',
    email: '메일',
    photo: '사진',
    save: '저장',
    close: '닫기',
    saved: '저장했습니다.',
    invite: '초대',
    inviteHint: '이 개인 대화에 여러 사람을 초대할 수 있습니다.',
    inviteNeed: '먼저 개인 대화를 고르세요.',
    inviteDone: '초대했습니다.',
    back: '대화 목록',
    openPage: '이 페이지 열기',
  },
  en: {
    product: 'MyWorkForce Talk',
    hint: 'Talk with people in this company and receive work notices.',
    account: 'ID',
    password: 'Password',
    changeTitle: 'Choose a new password',
    changeLead: 'This is your first sign-in. Replace the password you were given with one only you know to continue.',
    changeMine: 'Confirm the current password, then choose a new one.',
    changePassword: 'Change password',
    current: 'Current password',
    next: 'New password',
    again: 'Repeat',
    change: 'Change',
    cancel: 'Cancel',
    changed: 'Your password is changed.',
    rule: 'At least 6 characters, different from the current one.',
    teams: 'Teams',
    noTeam: 'No team',
    lead: 'Lead',
    errors: {
      password: 'That password does not match.',
      'not-registered': 'That account is not registered.',
      'password-change': 'This is your first sign-in. Choose a new password to continue.',
      'password-weak': 'A password needs at least 6 characters.',
      'password-same': 'Choose a password different from the current one.',
      'password-mismatch': 'The two new password boxes do not match.',
      connect: 'Could not reach the data service.',
      service: 'The data service did not answer. Try again in a moment.',
      permission: 'You do not have permission.',
    },
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
    mine: 'My details',
    details: 'Person details',
    name: 'Name',
    title: 'Title',
    team: 'Team',
    phone: 'Phone',
    email: 'Email',
    photo: 'Photo',
    save: 'Save',
    close: 'Close',
    saved: 'Saved.',
    invite: 'Invite',
    inviteHint: 'Invite more people into this personal talk.',
    inviteNeed: 'Choose a personal talk first.',
    inviteDone: 'Invited.',
    back: 'Talks',
    openPage: 'Open this page',
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
  profile: null,
  profileError: '',
  photos: {},
  pane: 'talks',
  threadOpen: false,
  mustChange: false,
  currentPw: '',
};

function t(key) { return text[state.language][key] || key; }
/** An error code from the data service, in words. */
function errorText(error) { const code = error?.message || ''; return text[state.language].errors[code] || (code && code !== 'connect' ? code : t('failed')); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

const SKIN = ['#f6d7b8', '#e7b98a', '#c68642', '#8d5524', '#f3c7a1', '#d9a066'];
const HAIR = ['#2b2118', '#6b3e26', '#1f2937', '#b45309', '#4c1d95', '#0f766e'];
const SHIRT = ['#2563eb', '#db2777', '#0d9488', '#ea580c', '#4f46e5', '#16a34a'];

function hash(text) {
  let value = 0;
  for (const char of String(text || '?')) value = (value * 33 + char.charCodeAt(0)) >>> 0;
  return value;
}

function portraitSvg(seed) {
  const value = hash(seed);
  const skin = SKIN[value % SKIN.length];
  const hair = HAIR[(value >> 3) % HAIR.length];
  const shirt = SHIRT[(value >> 6) % SHIRT.length];
  const style = (value >> 9) % 3;
  const hairPath = style === 0
    ? `<path d="M16 40c-6-20 8-30 32-28 20 2 28 14 24 28-8-12-18-16-28-12-8 2-18 6-28 12z" fill="${hair}"/>`
    : style === 1
      ? `<path d="M18 44c0-22 12-34 30-34s30 12 30 34c-8-10-18-14-30-14s-22 4-30 14z" fill="${hair}"/>`
      : `<path d="M22 36c2-16 12-24 26-24s24 8 26 24c-6 6-12 2-16-4-6 8-14 8-20 0-4 6-10 8-16 4z" fill="${hair}"/>`;
  return `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="48" fill="${shirt}"/><circle cx="48" cy="42" r="18" fill="${skin}"/>${hairPath}<ellipse cx="48" cy="88" rx="26" ry="16" fill="${shirt}"/></svg>`;
}

function photoOf(person) {
  const cached = state.photos[person?.id];
  if (cached) return cached;
  const photo = String(person?.photo || '');
  return photo.startsWith('data:image/') ? photo : '';
}

function faceHtml(person, size = '') {
  const photo = photoOf(person);
  const body = photo ? `<img src="${esc(photo)}" alt="">` : portraitSvg(person?.id || person?.name);
  return `<span class="avatar${size ? ` ${size}` : ''}" data-face="${esc(person?.id || '')}">${body}</span>`;
}

function rememberFaces() {
  for (const person of state.people) {
    if (!person.hasPhoto) {
      delete state.photos[person.id];
      continue;
    }
    if (state.photos[person.id]) continue;
    const id = person.id;
    chatProfile(id).then((result) => {
      const photo = result.person?.photo || '';
      if (!photo) return;
      state.photos[id] = photo;
      document.querySelectorAll(`[data-face="${id}"]`).forEach((slot) => {
        slot.innerHTML = `<img src="${esc(photo)}" alt="">`;
      });
    }).catch(() => {});
  }
}

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

function railButton(pane, glyph, label, extra = '') {
  const active = state.pane === pane ? ' active' : '';
  return `<button type="button" class="rail-button${active}" data-pane="${pane}" title="${esc(label)}" aria-label="${esc(label)}">${icon(glyph)}${extra}</button>`;
}

function latestNoticeTarget() {
  const notes = state.messages.filter((item) => item.kind === 'notice' && item.target);
  const picked = notes.find((item) => !item.checked) || notes.at(-1);
  return picked?.target || { view: 'notifications' };
}

function personalRoom() {
  const room = state.rooms.find((item) => item.id === state.roomId);
  return room && room.kind !== 'notices' ? room : null;
}

function stageHtml() {
  if (state.pane === 'people') {
    return `<div class="stage-page"><h2>${icon('people')}<span>${esc(t('people'))}</span></h2><div class="people">${personButtons()}</div></div>`;
  }
  if (state.pane === 'profile') return `<div class="stage-page">${profileCard() || `<p class="empty">${icon('user')}<span>${esc(t('details'))}</span></p>`}</div>`;
  if (state.pane === 'invite') return inviteHtml();
  if (state.pane === 'password') return `<div class="stage-page">${passwordForm(false)}</div>`;
  if (state.pane === 'notices') return threadHtml(true);
  if (state.threadOpen && personalRoom()) return threadHtml(false);
  const rooms = roomButtons();
  return `<div class="stage-page"><h2>${icon('comment')}<span>${esc(t('talks'))}</span></h2><div class="rooms">${rooms || `<p class="empty">${icon('comment')}<span>${esc(t('empty'))}</span></p>`}</div></div>`;
}

function threadHtml(notices) {
  const room = state.rooms.find((item) => item.id === state.roomId);
  const title = room ? roomTitle(room) : (notices ? t('notices') : t('talks'));
  const back = notices ? '' : `<button type="button" data-action="back-talks" title="${esc(t('back'))}" aria-label="${esc(t('back'))}">${icon('chevronLeft')}</button>`;
  const invite = notices ? '' : `<button type="button" data-pane="invite" title="${esc(t('invite'))}" aria-label="${esc(t('invite'))}">${icon('plus')}</button>`;
  return `<div class="thread">
    <div class="thread-head">${back}<b>${icon(notices ? 'bell' : 'comment')}<span>${esc(title)}</span></b>${invite}</div>
    <div class="messages" id="messages">${messageHtml()}</div>
    <form class="composer">
      <button type="button" class="quiet" data-action="file" title="${esc(t('file'))}" aria-label="${esc(t('file'))}">${icon('paperclip')}</button>
      <textarea id="draft" placeholder="${esc(t('placeholder'))}"></textarea>
      <button type="submit" title="${esc(t('send'))}" aria-label="${esc(t('send'))}">${icon('check')}</button>
      <input id="file" type="file" hidden>
    </form>
  </div>`;
}

function inviteHtml() {
  const room = personalRoom();
  if (!room) {
    const rooms = roomButtons();
    return `<div class="stage-page"><h2>${icon('plus')}<span>${esc(t('invite'))}</span></h2><p class="muted">${icon('comment')}<span>${esc(t('inviteNeed'))}</span></p><div class="rooms">${rooms}</div></div>`;
  }
  const memberIds = new Set((room.members || []).map((member) => member.id));
  const checks = state.people.filter((person) => person.id !== state.self && !memberIds.has(person.id)).map((person) => `<label class="pick">${faceHtml(person)}<input type="checkbox" data-pick="${esc(person.id)}" ${state.picked.has(person.id) ? 'checked' : ''}><span>${esc(person.name)}</span></label>`).join('');
  return `<div class="stage-page"><h2>${icon('plus')}<span>${esc(t('invite'))}</span></h2><p>${icon('comment')}<span>${esc(roomTitle(room))}</span></p><p class="muted">${esc(t('inviteHint'))}</p><div class="checks">${checks || `<p class="empty">${icon('people')}<span>${esc(t('people'))}</span></p>`}</div><button type="button" class="primary" data-action="invite-send">${icon('plus')}<span>${esc(t('invite'))}</span></button><p class="error">${esc(state.error)}</p></div>`;
}

function shell() {
  const unread = state.rooms.find((room) => room.kind === 'notices')?.unread || 0;
  const badge = unread ? `<i class="count">${unread}</i>` : '<i class="count" hidden></i>';
  return `<div class="app">
    <header class="top">${icon('comment')}<img src="./icon.png" alt=""><b>${esc(t('product'))}</b><span>${esc(t('hint'))}</span></header>
    <div class="body">
      <aside class="rail">
        ${railButton('notices', 'bell', t('notices'), badge)}
        ${railButton('talks', 'comment', t('talks'))}
        ${railButton('people', 'people', t('people'))}
        ${railButton('invite', 'plus', t('invite'))}
        <span class="grow"></span>
        ${railButton('profile', 'user', t('mine'))}
        <button type="button" class="rail-button" data-action="language" title="${esc(t('language'))}" aria-label="${esc(t('language'))}">${icon('globe')}</button>
        <button type="button" class="rail-button" data-action="work" title="${esc(t('work'))}" aria-label="${esc(t('work'))}">${icon('folder')}</button>
        ${railButton('password', 'key', t('changePassword'))}
        <button type="button" class="rail-button" data-action="sign-out" title="${esc(t('signOut'))}" aria-label="${esc(t('signOut'))}">${icon('logout')}</button>
      </aside>
      <section class="stage">${stageHtml()}</section>
    </div>
  </div>`;
}

function loginCard() {
  return `<div class="login"><form class="card">
    ${icon('comment')}<img src="./icon.png" alt="" width="36" height="36">
    <b>${esc(t('product'))}</b>
    <p class="muted">${icon('info')}<span>${esc(t('hint'))}</span></p>
    <label><span class="field-name">${icon('idCard')}<span>${esc(t('account'))}</span></span><input name="account" value="${esc(state.account)}" autocomplete="username" spellcheck="false" autocapitalize="off"></label>
    <label><span class="field-name">${icon('key')}<span>${esc(t('password'))}</span></span><input name="password" type="password" autocomplete="current-password"></label>
    <label class="reveal"><input type="checkbox" data-reveal="password">${icon('eye')}<span>${esc(t('show'))}</span></label>
    <p class="error">${esc(state.error)}</p>
    <button type="submit" class="login-submit">${icon('login')}<span>${esc(t('signIn'))}</span></button>
  </form></div>`;
}

/** Choosing one's own password: forced at the first sign-in, or by choice from the side rail. */
function passwordForm(forced) {
  return `<form class="card change${forced ? ' forced' : ''}" data-change>
    <b>${icon('key')}<span>${esc(forced ? t('changeTitle') : t('changePassword'))}</span></b>
    <p class="muted">${esc(forced ? t('changeLead') : t('changeMine'))}</p>
    ${forced && state.currentPw ? '' : `<label><span class="field-name">${icon('key')}<span>${esc(t('current'))}</span></span><input name="current" type="password" required autocomplete="current-password"></label>`}
    <label><span class="field-name">${icon('key')}<span>${esc(t('next'))}</span></span><input name="next" type="password" required minlength="6" autocomplete="new-password"></label>
    <label><span class="field-name">${icon('key')}<span>${esc(t('again'))}</span></span><input name="again" type="password" required minlength="6" autocomplete="new-password"></label>
    <p class="muted">${icon('info')}<span>${esc(t('rule'))}</span></p>
    <p class="error">${esc(state.error)}</p>
    <div class="actions">${forced
      ? `<button type="button" class="quiet" data-action="sign-out">${icon('logout')}<span>${esc(t('signOut'))}</span></button>`
      : `<button type="button" class="quiet" data-pane="talks">${icon('close')}<span>${esc(t('cancel'))}</span></button>`}
      <button type="submit" class="login-submit">${icon('check')}<span>${esc(t('change'))}</span></button></div>
  </form>`;
}

function roomButtons() {
  return state.rooms.filter((room) => room.kind !== 'notices').map((room) => `<button type="button" class="room${room.id === state.roomId ? ' active' : ''}" data-room="${esc(room.id)}"><b>${icon(room.kind === 'group' ? 'people' : 'comment')}<span>${esc(roomTitle(room))}</span></b><small>${esc(room.last?.body || '')}</small>${room.unread ? `<i>${room.unread}</i>` : ''}</button>`).join('');
}

function personRow(person) {
  const teams = (person.teams || []).map((team) => team.name);
  const line = [person.jobTitle, ...(teams.length ? teams : [person.team])].filter(Boolean).join(' · ');
  const talk = person.id === state.self ? '' : `<button type="button" class="icon-button" data-action="direct" data-id="${esc(person.id)}" title="${esc(t('talks'))}" aria-label="${esc(t('talks'))}">${icon('comment')}</button>`;
  return `<div class="person-row"><button type="button" class="person" data-action="profile" data-id="${esc(person.id)}">${faceHtml(person)}<span class="person-copy"><span class="person-name">${esc(person.name)}</span>${line ? `<small>${esc(line)}</small>` : ''}</span></button>${talk}</div>`;
}

/** People grouped by team (Company → Teams); someone in several teams shows in each. */
function personButtons() {
  const teams = new Map();
  const loose = [];
  for (const person of state.people) {
    if (!(person.teams || []).length) { loose.push(person); continue; }
    for (const team of person.teams) {
      if (!teams.has(team.id)) teams.set(team.id, { name: team.name, people: [] });
      teams.get(team.id).people.push(person);
    }
  }
  const group = (name, glyph, people) => `<div class="team-group"><h3>${icon(glyph)}<span>${esc(name)}</span><i class="count-chip">${people.length}</i></h3>${people.map(personRow).join('')}</div>`;
  const sorted = [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((team) => group(team.name, 'team', team.people)).join('') + (loose.length ? group(t('noTeam'), 'user', loose) : '');
}

function profileCard() {
  const person = state.profile;
  if (!person) return '';
  const self = state.people.find((item) => item.id === state.self);
  const canEdit = person.id === state.self || self?.admin;
  const field = (glyph, label, name, value) => canEdit
    ? `<label>${icon(glyph)}<span>${esc(label)}</span><input name="${name}" value="${esc(value || '')}"></label>`
    : `<p>${icon(glyph)}<span>${esc(label)}</span><b>${esc(value || '')}</b></p>`;
  return `<form class="profile-card" data-profile>
    <div class="profile-head">${faceHtml(person, 'lg')}<span class="person-copy"><b>${esc(person.name)}</b><small>${esc(t('details'))}</small></span><button type="button" data-action="close-profile">${icon('close')}<span>${esc(t('close'))}</span></button></div>
    ${field('user', t('name'), 'name', person.name)}
    ${field('flag', t('title'), 'jobTitle', person.jobTitle)}
    <p>${icon('team')}<span>${esc(t('teams'))}</span><b class="team-chips">${(person.teams || []).map((team) => `<i class="chip">${icon(team.lead ? 'shield' : 'team')}${esc(team.name)}${team.lead ? ` · ${esc(t('lead'))}` : ''}</i>`).join(' ') || esc(person.team || t('noTeam'))}</b></p>
    ${field('phone', t('phone'), 'phone', person.phone)}
    ${field('globe', t('email'), 'email', person.email)}
    ${canEdit ? `<label>${icon('image')}<span>${esc(t('photo'))}</span><input id="portrait" type="file" accept="image/*"></label><button type="submit">${icon('save')}<span>${esc(t('save'))}</span></button>` : ''}
    <p class="error">${esc(state.profileError)}</p>
  </form>`;
}

function messageHtml() {
  const messages = state.messages.map((message) => {
    const mine = message.userId === state.self ? ' mine' : '';
    const notice = message.kind === 'notice' ? ' notice' : '';
    const sender = state.people.find((person) => person.id === message.userId);
    const who = message.kind === 'notice' ? t('notices') : (sender?.name || message.userId);
    const whoFace = message.kind === 'notice' ? icon('bell') : faceHtml(sender || { id: message.userId, name: who });
    const file = message.kind === 'file'
      ? `<a href="#" data-file="${esc(message.fileId)}" data-name="${esc(message.fileName)}">${icon('file')}<span>${esc(message.fileName || message.body)}</span></a>`
      : '';
    const body = message.kind === 'file' ? file : esc(message.body);
    const confirm = message.kind === 'notice'
      ? (message.checked
        ? `<button type="button" class="quiet" disabled>${icon('check')}<span>${esc(t('confirmed'))}</span></button>`
        : `<button type="button" data-action="check-notice" data-id="${esc(message.id)}">${icon('check')}<span>${esc(t('confirm'))}</span></button>`)
      : '';
    const target = message.kind === 'notice' ? ` data-open-notice="${esc(message.id)}" title="${esc(t('openPage'))}"` : '';
    return `<article class="bubble${mine}${notice}${message.checked ? ' checked' : ''}"${target}><div class="who">${whoFace}<span>${esc(who)}</span></div><p>${body}</p>${confirm}</article>`;
  }).join('');
  const room = state.rooms.find((item) => item.id === state.roomId);
  const banner = room?.kind === 'notices' ? `<p class="notice-note">${icon('bell')}<span>${esc(t('personal'))}</span></p>` : '';
  return banner + (messages || `<p class="empty">${icon('comment')}<span>${esc(t('empty'))}</span></p>`);
}

function paint(options = {}) {
  const root = document.querySelector('#app');
  const live = sessionToken() && state.self && !state.mustChange && document.querySelector('.app');
  if (live && !options.full) {
    const rooms = document.querySelector('.rooms');
    if (rooms) rooms.innerHTML = roomButtons();
    const people = document.querySelector('.people');
    if (people) people.innerHTML = personButtons();
    const box = document.querySelector('#messages');
    if (box) {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      box.innerHTML = messageHtml();
      if (atBottom) box.scrollTop = box.scrollHeight;
    }
    const count = document.querySelector('.rail .count');
    if (count) {
      const unread = state.rooms.find((room) => room.kind === 'notices')?.unread || 0;
      count.hidden = !unread;
      count.textContent = unread ? String(unread) : '';
    }
    return;
  }
  const draft = document.querySelector('#draft')?.value || '';
  root.innerHTML = state.mustChange && sessionToken() ? `<div class="login">${passwordForm(true)}</div>` : (sessionToken() && state.self ? shell() : loginCard());
  if (draft && document.querySelector('#draft')) document.querySelector('#draft').value = draft;
  const box = document.querySelector('#messages');
  if (box) box.scrollTop = box.scrollHeight;
}

async function refresh(full = false) {
  if (!state.self || state.mustChange) return;
  let rooms;
  let people;
  try {
    [rooms, people] = await Promise.all([chatRooms(), chatPeople()]);
  } catch (error) {
    if (error?.message === 'password-change') { askNewPassword(''); return; }
    throw error;
  }
  state.rooms = rooms.rooms || [];
  state.people = people.people || [];
  if (state.pane === 'notices') {
    const notes = state.rooms.find((room) => room.kind === 'notices');
    if (notes) state.roomId = notes.id;
  }
  const showMessages = state.pane === 'notices' || (state.pane === 'talks' && state.threadOpen);
  if (showMessages && state.roomId) {
    const after = full ? '' : (state.messages.at(-1)?.at || '');
    const loaded = await chatMessages(state.roomId, after);
    const incoming = loaded.messages || [];
    state.messages = after ? state.messages.concat(incoming.filter((item) => !state.messages.some((have) => have.id === item.id))) : incoming;
  }
  paint(full ? { full: true } : {});
  rememberFaces();
}

let signing = false;

function askNewPassword(current) {
  state.mustChange = true;
  state.currentPw = current || '';
  state.error = '';
  paint({ full: true });
}

async function enter(account, password) {
  signing = true;
  try {
    const session = await loginSession(account, password);
    state.self = session.user.id;
    state.account = session.user.login || account;
    state.password = '';
    state.error = '';
    if (session.user.mustChangePassword) { askNewPassword(password); return; }
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
    if (state.self === session.user.id && !force && !session.user.mustChangePassword) return;
    state.self = session.user.id;
    if (session.user.mustChangePassword) { state.account = session.user.login || state.account; askNewPassword(''); return; }
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
  if (form.classList.contains('card') && !form.hasAttribute('data-change')) {
    enter(form.account.value.trim(), form.password.value).catch((error) => { state.error = errorText(error); paint({ full: true }); });
    return;
  }
  if (form.hasAttribute('data-change')) {
    const current = state.currentPw || form.elements.current?.value || '';
    const next = form.elements.next.value;
    if (next !== form.elements.again.value) { state.error = t('errors')['password-mismatch']; paint({ full: true }); return; }
    changeOwnPassword(current, next).then(() => {
      if (savedLogin()?.password) rememberLogin(state.account, next);
      state.mustChange = false;
      state.currentPw = '';
      state.error = '';
      state.pane = 'talks';
      return refresh(true).then(() => { state.profileError = t('changed'); });
    }).catch((error) => {
      if (error?.message === 'password') state.currentPw = '';
      state.error = errorText(error);
      paint({ full: true });
    });
    return;
  }
  if (form.hasAttribute('data-profile')) {
    const person = state.profile;
    const name = form.elements.name?.value.trim() || '';
    if (!person || !name) return;
    saveChatProfile({
      id: person.id,
      name,
      jobTitle: form.elements.jobTitle.value.trim(),
      team: person.team || '',
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      photo: person.photo || '',
    }).then((result) => {
      state.profile = result.person;
      state.photos[result.person.id] = result.person.photo || '';
      state.profileError = t('saved');
      return refresh(true);
    }).catch((error) => {
      state.profileError = error.message || t('failed');
      paint({ full: true });
    });
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
  const paneEl = event.target.closest('[data-pane]');
  if (paneEl) {
    const pane = paneEl.dataset.pane;
    state.pane = pane;
    if (pane === 'notices') {
      const known = latestNoticeTarget();
      state.roomId = state.rooms.find((item) => item.kind === 'notices')?.id || '';
      state.threadOpen = true;
      state.messages = [];
      openMain(known);
      refresh(true).then(() => openMain(latestNoticeTarget(), { focus: false })).catch(() => {});
      return;
    }
    if (pane === 'people') openMain({ view: 'teams' });
    if (pane === 'password') state.error = '';
    if (pane === 'profile') {
      openMain({ view: 'users', profile: true, userId: state.self });
      chatProfile(state.self).then((result) => {
        state.profile = result.person;
        state.photos[result.person.id] = result.person.photo || '';
        state.profileError = '';
        paint({ full: true });
      }).catch(() => { state.profileError = t('failed'); paint({ full: true }); });
      return;
    }
    if (pane === 'talks') state.threadOpen = false;
    paint({ full: true });
    return;
  }
  const room = event.target.closest('[data-room]');
  if (room) {
    state.roomId = room.dataset.room;
    state.messages = [];
    const found = state.rooms.find((item) => item.id === state.roomId);
    if (found?.kind === 'notices') {
      state.pane = 'notices';
      state.threadOpen = true;
    } else if (state.pane !== 'invite') {
      state.pane = 'talks';
      state.threadOpen = true;
    }
    refresh(true).catch(() => {});
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  const action = actionEl?.dataset.action;
  if (action === 'work') { openMain({ view: 'board' }); return; }
  if (action === 'direct') {
    openChat({ kind: 'direct', members: [actionEl.dataset.id] }).then((result) => {
      state.roomId = result.room.id;
      state.pane = 'talks';
      state.threadOpen = true;
      state.profile = null;
      state.messages = [];
      return refresh(true);
    }).catch(() => { state.error = t('failed'); paint(); });
    return;
  }
  if (action === 'back-talks') {
    state.pane = 'talks';
    state.threadOpen = false;
    paint({ full: true });
    return;
  }
  if (action === 'invite-send') {
    const talk = personalRoom();
    const members = [...state.picked];
    if (!talk || !members.length) { state.error = t('inviteNeed'); paint({ full: true }); return; }
    inviteChat(talk.id, members).then(() => {
      state.picked.clear();
      state.error = '';
      state.pane = 'talks';
      state.threadOpen = true;
      state.messages = [];
      return refresh(true);
    }).catch(() => { state.error = t('failed'); paint({ full: true }); });
    return;
  }
  if (action === 'profile' || action === 'my-profile') {
    const id = action === 'my-profile' ? state.self : actionEl.dataset.id;
    if (!id) return;
    state.pane = 'profile';
    chatProfile(id).then((result) => {
      state.profile = result.person;
      state.photos[result.person.id] = result.person.photo || '';
      state.profileError = '';
      paint({ full: true });
    }).catch(() => { state.profileError = t('failed'); paint({ full: true }); });
    return;
  }
  if (action === 'close-profile') {
    state.profile = null;
    state.profileError = '';
    state.pane = 'people';
    paint({ full: true });
    return;
  }
  if (action === 'sign-out') {
    logoutSession();
    state.self = '';
    state.mustChange = false;
    state.currentPw = '';
    state.rooms = [];
    state.messages = [];
    state.profile = null;
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
  const notice = event.target.closest('[data-open-notice]');
  if (!action && notice) {
    const message = state.messages.find((item) => item.id === notice.dataset.openNotice);
    openMain(message?.target || { view: 'notifications' });
    return;
  }
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
  if (event.target.id === 'portrait') {
    const file = event.target.files?.[0];
    if (!file || !state.profile) return;
    if (!file.type.startsWith('image/') || file.size > 360_000) {
      state.profileError = t('failed');
      paint({ full: true });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.profile.photo = String(reader.result || '');
      const holder = document.querySelector('.profile-card .avatar.lg');
      if (holder) holder.innerHTML = `<img src="${esc(state.profile.photo)}" alt="">`;
    };
    reader.readAsDataURL(file);
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
  // The installed program starts the data service together with this window: wait for it first.
  try { await waitForService(30000); } catch { /* signing in says it did not answer */ }
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
installTooltips(document.body);
paint({ full: true });
boot().catch(() => { state.self = ''; paint({ full: true }); });
watchSharedSession(() => { adopt().catch(() => {}); });
setInterval(() => { if (state.self) refresh().catch(() => {}); }, 2000);
