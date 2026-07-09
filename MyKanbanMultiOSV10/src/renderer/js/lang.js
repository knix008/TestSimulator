/* ── Internationalization (한국어 / English) ──────────────────────────────── */
const LANGS = {
  ko: {
    // Nav
    logout: '로그아웃', settings: '설정', userMgmt: '사용자 관리',
    // Auth
    login: '로그인', loginTitle: 'MyKanban에 오신 것을 환영합니다',
    loginSub: '팀의 업무를 시각화하세요',
    idLabel: '아이디', pwLabel: '비밀번호', registerLink: '계정 등록 요청',
    backToLogin: '← 로그인으로 돌아가기',
    registerTitle: '등록 요청', registerSub: '관리자 승인 후 로그인할 수 있습니다',
    nameLabel: '이름', emailLabel: '이메일', submitRegister: '등록 요청',
    // Boards / Projects
    myBoards: '내 프로젝트', newBoard: '+ 새 프로젝트',
    boardEmpty: '아직 프로젝트가 없습니다. 새 프로젝트를 만들어 시작하세요!',
    createBoard: '새 프로젝트 만들기', boardName: '프로젝트 이름 *',
    boardDesc: '설명', create: '만들기', edit: '편집', delete: '삭제', cancel: '취소', save: '저장',
    owner: '소유자',
    // Board view
    backToBoards: '← 프로젝트 목록', addColumn: '+ 컬럼 추가', addCard: '+ 카드 추가',
    members: '멤버', summary: '요약', renameColumn: '이름 변경', deleteColumn: '컬럼 삭제',
    // Card
    cardTitle: '제목 *', cardDesc: '설명', assignee: '담당자', dueDate: '마감일',
    attachments: '첨부파일', noAttach: '첨부파일 없음', attachFile: '파일 첨부',
    cardColor: '카드 배경색', deleteCard: '카드 삭제', cardEdit: '카드 편집', addCardTitle: '카드 추가',
    // Members
    memberMgmt: '멤버 관리', projectOwner: '프로젝트 소유자', addMember: '멤버 추가',
    roleAdmin: '관리자', roleEditor: '편집자', roleViewer: '뷰어', removeBtn: '제거',
    // Users admin
    allUsers: '전체 사용자', pendingApproval: '승인 대기', addUser: '+ 사용자 추가',
    approve: '승인', reject: '거부', active: '활성', pending: '대기', inactive: '비활성',
    admin: '관리자', user: '사용자', createdAt: '가입일', noUsers: '사용자가 없습니다.',
    noPending: '승인 대기 중인 요청이 없습니다.',
    // Settings
    dbSettings: 'DB 설정', dbCurrent: '현재', dbChangeWarn: 'DB를 변경하면 기존 데이터는 이전되지 않습니다.',
    testConn: '연결 테스트', applyDb: '적용', resetSqlite: 'SQLite 초기화',
    host: '호스트', port: '포트', dbName: '데이터베이스명', dbUser: '사용자', dbPass: '비밀번호', dbFile: 'DB 파일 경로',
    profile: '내 프로필', displayName: '표시 이름', changePw: '비밀번호 변경',
    curPw: '현재 비밀번호', newPw: '새 비밀번호', confirmPw: '새 비밀번호 확인',
    // Summary
    summaryTitle: '프로젝트 요약', totalCards: '전체 카드', completedCards: '완료된 카드',
    overdueCards: '기한 초과', burndownChart: '번다운 차트 (최근 30일)',
    cardsCreated: '생성', cardsCompleted: '완료',
    // Export / Import
    exportProject: '프로젝트 내보내기 (.kprj)',
    importProject: '프로젝트 가져오기 (.kprj)',
    exportSuccess: '내보내기 완료',
    importSuccess: '가져오기 완료. 새 프로젝트가 생성되었습니다.',
    importError: '가져오기 실패',
    // Misc
    none: '없음', loading: '로딩 중...',
  },
  en: {
    logout: 'Logout', settings: 'Settings', userMgmt: 'User Management',
    login: 'Login', loginTitle: 'Welcome to MyKanban',
    loginSub: 'Visualize your team\'s work',
    idLabel: 'Username', pwLabel: 'Password', registerLink: 'Request Account Registration',
    backToLogin: '← Back to Login',
    registerTitle: 'Registration Request', registerSub: 'You can log in after admin approval',
    nameLabel: 'Name', emailLabel: 'Email', submitRegister: 'Submit Request',
    myBoards: 'My Projects', newBoard: '+ New Project',
    boardEmpty: 'No projects yet. Create a new project to get started!',
    createBoard: 'Create New Project', boardName: 'Project Name *',
    boardDesc: 'Description', create: 'Create', edit: 'Edit', delete: 'Delete', cancel: 'Cancel', save: 'Save',
    owner: 'Owner',
    backToBoards: '← Projects', addColumn: '+ Add Column', addCard: '+ Add Card',
    members: 'Members', summary: 'Summary', renameColumn: 'Rename', deleteColumn: 'Delete Column',
    cardTitle: 'Title *', cardDesc: 'Description', assignee: 'Assignee', dueDate: 'Due Date',
    attachments: 'Attachments', noAttach: 'No attachments', attachFile: 'Attach File',
    cardColor: 'Card Color', deleteCard: 'Delete Card', cardEdit: 'Edit Card', addCardTitle: 'Add Card',
    memberMgmt: 'Member Management', projectOwner: 'Project Owner', addMember: 'Add Member',
    roleAdmin: 'Admin', roleEditor: 'Editor', roleViewer: 'Viewer', removeBtn: 'Remove',
    allUsers: 'All Users', pendingApproval: 'Pending Approval', addUser: '+ Add User',
    approve: 'Approve', reject: 'Reject', active: 'Active', pending: 'Pending', inactive: 'Inactive',
    admin: 'Admin', user: 'User', createdAt: 'Joined', noUsers: 'No users.', noPending: 'No pending requests.',
    dbSettings: 'Database Settings', dbCurrent: 'Current', dbChangeWarn: 'Changing DB will not migrate existing data.',
    testConn: 'Test Connection', applyDb: 'Apply', resetSqlite: 'Reset to SQLite',
    host: 'Host', port: 'Port', dbName: 'Database', dbUser: 'Username', dbPass: 'Password', dbFile: 'DB File Path',
    profile: 'My Profile', displayName: 'Display Name', changePw: 'Change Password',
    curPw: 'Current Password', newPw: 'New Password', confirmPw: 'Confirm New Password',
    summaryTitle: 'Project Summary', totalCards: 'Total Cards', completedCards: 'Completed',
    overdueCards: 'Overdue', burndownChart: 'Burndown Chart (Last 30 Days)',
    cardsCreated: 'Created', cardsCompleted: 'Completed',
    exportProject: 'Export Project (.kprj)',
    importProject: 'Import Project (.kprj)',
    exportSuccess: 'Export complete',
    importSuccess: 'Import complete. A new project was created.',
    importError: 'Import failed',
    none: 'None', loading: 'Loading...',
  }
};

const I18n = (() => {
  let lang = localStorage.getItem('kanban-lang') || 'ko';

  function t(key) {
    return (LANGS[lang] && LANGS[lang][key]) || (LANGS.ko[key]) || key;
  }

  function setLang(l) {
    lang = l;
    localStorage.setItem('kanban-lang', l);
    document.documentElement.lang = l;
  }

  function getLang() { return lang; }

  return { t, setLang, getLang };
})();
