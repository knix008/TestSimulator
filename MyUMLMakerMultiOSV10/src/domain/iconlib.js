// The icons a non-UML diagram can hold: 100 pictures in ten groups (24×24 stroke drawings),
// plus the user's own (below). A project stores only the icon's
// id, never drawing code, so a file from somebody else cannot put markup in the page.
const group = (id, ko, en, color, icons) => ({ id, ko, en, color, icons: icons.map(([iconId, iconKo, iconEn, body]) => ({ id: iconId, ko: iconKo, en: iconEn, body, color })) });

export const ICON_GROUPS = [
  group('people', '사람', 'People', '#2563eb', [
    ['person', '사람', 'Person', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
    ['group', '그룹', 'Group', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.6c2.1.8 3.5 2.7 3.5 5.4"/>'],
    ['customer', '고객', 'Customer', '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3c0-3 3-5 7-5s7 2 7 5v3z"/><path d="M12 15.5l1 1.8 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3z"/>'],
    ['admin', '관리자', 'Administrator', '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.6 3-6 7-6 1.2 0 2.300.2 3.300.6"/><circle cx="18" cy="17" r="2"/><path d="M18 13v2M18 19v2M14 17h2M20 17h2"/>'],
    ['developer', '개발자', 'Developer', '<circle cx="12" cy="6.500" r="3.500"/><path d="M6 21v-2c0-3 2.700-5 6-5s6 2 6 5v2"/><path d="M10 17l-1.500 1.500L10 20M14 17l1.500 1.500L14 20"/>'],
    ['doctor', '의사', 'Doctor', '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 3.500-7 8-7s8 3 8 7"/><path d="M12 16.500v3.500M10.200 18.200h3.600"/>'],
    ['student', '학생', 'Student', '<path d="M2.500 9L12 4.500 21.500 9 12 13.500z"/><path d="M6.500 11.500V16c0 1.800 2.500 3.500 5.500 3.500s5.500-1.700 5.500-3.500v-4.500M21.500 9v6"/>'],
    ['team', '팀', 'Team', '<circle cx="12" cy="6" r="3"/><circle cx="5" cy="10" r="2.300"/><circle cx="19" cy="10" r="2.300"/><path d="M7 21v-2.500c0-2.800 2.200-4.500 5-4.500s5 1.700 5 4.500V21M1.500 19c0-2.500 1.500-4 3.500-4M22.500 19c0-2.500-1.500-4-3.500-4"/>'],
    ['handshake', '협력', 'Partnership', '<path d="M2 8l5-2 5 2 5-2 5 2v7l-4 2-2-1-3 3-2-1-2 1-3-3-4-1z"/><path d="M12 8l-3 3c-1 1 .5 2.500 1.500 1.500L13 10l5 5"/>'],
    ['speaker', '발표자', 'Presenter', '<circle cx="7" cy="7" r="3"/><path d="M2 21v-3c0-3 2-5 5-5 2 0 3 1 4 2l3-1"/><rect x="13" y="3" width="9" height="7" rx="1"/><path d="M17.500 10v3"/>'],
  ]),
  group('devices', '장치', 'Devices', '#0891b2', [
    ['desktop', '데스크톱', 'Desktop', '<rect x="3" y="4" width="18" height="12" rx="1.500"/><path d="M9 20h6M12 16v4"/>'],
    ['laptop', '노트북', 'Laptop', '<rect x="5" y="5" width="14" height="10" rx="1.500"/><path d="M2.500 19h19l-2.500-4H5z"/>'],
    ['phone', '휴대폰', 'Phone', '<rect x="7" y="2.500" width="10" height="19" rx="2"/><path d="M11 18.500h2"/>'],
    ['tablet', '태블릿', 'Tablet', '<rect x="4.500" y="3" width="15" height="18" rx="2"/><path d="M11 18h2"/>'],
    ['server', '서버', 'Server', '<rect x="4" y="3.500" width="16" height="7" rx="1.500"/><rect x="4" y="13.500" width="16" height="7" rx="1.500"/><path d="M7.500 7h.01M7.500 17h.01M11 7h6M11 17h6"/>'],
    ['printer', '프린터', 'Printer', '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'],
    ['camera', '카메라', 'Camera', '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.500" r="3.500"/>'],
    ['sensor', '센서', 'Sensor', '<circle cx="12" cy="12" r="2.500"/><path d="M7.500 7.500a6.400 6.400 0 0 0 0 9M16.500 7.500a6.400 6.400 0 0 1 0 9M4.500 4.500a10.600 10.600 0 0 0 0 15M19.500 4.500a10.600 10.600 0 0 1 0 15"/>'],
    ['robot', '로봇', 'Robot', '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M2.500 12v3M21.500 12v3"/><circle cx="12" cy="3.500" r="1"/><path d="M9 12.500h.01M15 12.500h.01M9 16h6"/>'],
    ['chip', '칩', 'Chip', '<rect x="6" y="6" width="12" height="12" rx="1.500"/><rect x="9.500" y="9.500" width="5" height="5"/><path d="M9 2.500V6M15 2.500V6M9 18v3.500M15 18v3.500M2.500 9H6M2.500 15H6M18 9h3.500M18 15h3.500"/>'],
  ]),
  group('network', '네트워크·클라우드', 'Network & Cloud', '#4f46e5', [
    ['cloud', '클라우드', 'Cloud', '<path d="M7 19a4.500 4.500 0 0 1-.6-9A6 6 0 0 1 18 9.500 4.800 4.800 0 0 1 17.500 19z"/>'],
    ['cloudUp', '클라우드 업로드', 'Cloud Upload', '<path d="M7 18a4.500 4.500 0 0 1-.6-9A6 6 0 0 1 18 8.500 4.800 4.800 0 0 1 17.500 18"/><path d="M12 21v-8M9 15.500l3-3 3 3"/>'],
    ['globe', '인터넷', 'Internet', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'],
    ['wifi', '와이파이', 'Wi-Fi', '<path d="M2.500 9a14 14 0 0 1 19 0M6 12.800a9 9 0 0 1 12 0M9.300 16.300a4.200 4.200 0 0 1 5.400 0"/><path d="M12 20h.01"/>'],
    ['router', '라우터', 'Router', '<rect x="3" y="13" width="18" height="7" rx="1.500"/><path d="M7 16.500h.01M11 16.500h.01M8 13L5 5M16 13l3-8"/>'],
    ['switchBox', '스위치', 'Switch', '<rect x="2.500" y="8" width="19" height="8" rx="1.500"/><path d="M6 12h.01M9.500 12h.01M13 12h.01M16.500 12h.01M6 8V5M12 8V5M18 8V5M6 16v3M12 16v3M18 16v3"/>'],
    ['firewall', '방화벽', 'Firewall', '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.300h18M3 14.700h18M9 4v5.300M15 4v5.300M6 9.300v5.400M12 9.300v5.400M18 9.300v5.400M9 14.700V20M15 14.700V20"/>'],
    ['api', 'API', 'API', '<path d="M9 7L4 12l5 5M15 7l5 5-5 5"/><circle cx="12" cy="12" r="1.500"/>'],
    ['nodes', '노드 연결', 'Connected Nodes', '<circle cx="12" cy="5" r="2.500"/><circle cx="5" cy="18" r="2.500"/><circle cx="19" cy="18" r="2.500"/><path d="M10.800 7.200l-4.600 8.600M13.200 7.200l4.600 8.600M7.500 18h9"/>'],
    ['signal', '신호', 'Signal', '<path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/>'],
  ]),
  group('data', '데이터·파일', 'Data & Files', '#16a34a', [
    ['database', '데이터베이스', 'Database', '<ellipse cx="12" cy="5.500" rx="8" ry="3"/><path d="M4 5.500v13c0 1.700 3.600 3 8 3s8-1.300 8-3v-13M4 12c0 1.700 3.600 3 8 3s8-1.300 8-3"/>'],
    ['file', '파일', 'File', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'],
    ['fileText', '문서', 'Document', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>'],
    ['folder', '폴더', 'Folder', '<path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'],
    ['chartBar', '막대 차트', 'Bar Chart', '<path d="M3 21h18"/><rect x="5" y="11" width="3.500" height="10"/><rect x="10.500" y="6" width="3.500" height="15"/><rect x="16" y="14" width="3.500" height="7"/>'],
    ['chartPie', '원 차트', 'Pie Chart', '<path d="M11 3a9 9 0 1 0 9.900 9.900H11z"/><path d="M15 3.300A9 9 0 0 1 20.700 9H15z"/>'],
    ['chartLine', '선 차트', 'Line Chart', '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>'],
    ['table', '표', 'Table', '<rect x="3" y="4" width="18" height="16" rx="1.500"/><path d="M3 9.500h18M3 15h18M9 4v16"/>'],
    ['archive', '보관', 'Archive', '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>'],
    ['code', '코드', 'Code', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.500 9.500L7 12l2.500 2.500M14.500 9.500L17 12l-2.500 2.500M12.800 8.500l-1.600 7"/>'],
  ]),
  group('security', '보안', 'Security', '#dc2626', [
    ['lock', '자물쇠', 'Lock', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>'],
    ['unlock', '잠금 해제', 'Unlocked', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.500-2M12 15v2"/>'],
    ['key', '열쇠', 'Key', '<circle cx="8" cy="15" r="5"/><path d="M11.500 11.500L21 2M17 6l3 3M14 9l2 2"/>'],
    ['shield', '방패', 'Shield', '<path d="M12 2.500l8 3v6c0 5-3.400 8.500-8 10-4.600-1.500-8-5-8-10v-6z"/>'],
    ['shieldCheck', '보호됨', 'Protected', '<path d="M12 2.500l8 3v6c0 5-3.400 8.500-8 10-4.600-1.500-8-5-8-10v-6z"/><path d="M8.500 12l2.500 2.500 4.500-5"/>'],
    ['eye', '보기', 'Visible', '<path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'],
    ['eyeOff', '숨김', 'Hidden', '<path d="M4 4l16 16M9.900 5.300A9.800 9.800 0 0 1 12 5c6.400 0 10 7 10 7a17 17 0 0 1-3.300 4M6.300 6.800C3.600 8.500 2 12 2 12s3.600 7 10 7c1.700 0 3.200-.5 4.500-1.200"/>'],
    ['fingerprint', '지문', 'Fingerprint', '<path d="M6 10a6 6 0 0 1 12 0v3M6 14c0 2.500-.5 4-1.500 5.500M9.500 10.500a2.500 2.500 0 0 1 5 0c0 4-.5 7-2 10M12 10.500c0 4-.5 7-2.500 10M18 16.500c0 1-.2 2-.5 3"/>'],
    ['bug', '버그', 'Bug', '<rect x="7" y="8" width="10" height="13" rx="5"/><path d="M9 8a3 3 0 0 1 6 0M3 13h4M17 13h4M4 7l3.500 3M20 7l-3.500 3M4 20l3.500-3M20 20l-3.500-3"/>'],
    ['alertShield', '위협', 'Threat', '<path d="M12 2.500l8 3v6c0 5-3.400 8.500-8 10-4.600-1.500-8-5-8-10v-6z"/><path d="M12 8v5M12 16.500h.01"/>'],
  ]),
  group('communication', '소통', 'Communication', '#db2777', [
    ['mail', '메일', 'E-mail', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
    ['chat', '대화', 'Chat', '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h5"/>'],
    ['bell', '알림', 'Notification', '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2.500H4z"/><path d="M10 21h4"/>'],
    ['call', '전화', 'Call', '<path d="M5 3h4l2 5-2.500 1.500a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2C10.700 21 3 13.300 3 5a2 2 0 0 1 2-2z"/>'],
    ['megaphone', '공지', 'Announcement', '<path d="M3 10v4l13 5V5z"/><path d="M16 9a3 3 0 0 1 0 6M7 15.500l1.500 5h3L10 16.700"/>'],
    ['video', '영상 통화', 'Video Call', '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.500L21 7v10l-5-3.500"/>'],
    ['share', '공유', 'Share', '<circle cx="18" cy="5" r="2.500"/><circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="19" r="2.500"/><path d="M8.300 10.800l7.400-4.500M8.300 13.200l7.400 4.500"/>'],
    ['rss', '소식', 'Feed', '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.500"/>'],
    ['thumbUp', '좋아요', 'Like', '<path d="M7 10v11H3V10zM7 10l4-7a2.500 2.500 0 0 1 3 2.500V9h6a1.500 1.500 0 0 1 1.500 1.800l-1.700 8.500A2 2 0 0 1 17.800 21H7"/>'],
    ['qr', 'QR 코드', 'QR Code', '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18v3h3v-3"/>'],
  ]),
  group('business', '업무·금융', 'Business & Finance', '#b86e00', [
    ['briefcase', '서류 가방', 'Briefcase', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.500 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 12.500h18"/>'],
    ['money', '돈', 'Money', '<rect x="2.500" y="6" width="19" height="12" rx="1.500"/><circle cx="12" cy="12" r="3"/><path d="M6 9.500v5M18 9.500v5"/>'],
    ['coin', '동전', 'Coin', '<circle cx="12" cy="12" r="9"/><path d="M15 8.500c-.8-1-1.900-1.500-3-1.500-2 0-3.500 1-3.500 2.500 0 3.500 7 1.500 7 5 0 1.500-1.500 2.500-3.500 2.500-1.200 0-2.300-.5-3-1.500M12 5v14"/>'],
    ['card', '신용카드', 'Credit Card', '<rect x="2.500" y="5" width="19" height="14" rx="2"/><path d="M2.500 10h19M6 15h4"/>'],
    ['cart', '장바구니', 'Cart', '<path d="M2.500 3.500h3l2.500 12h11l2-8.500H6.500"/><circle cx="9.500" cy="19.500" r="1.700"/><circle cx="17" cy="19.500" r="1.700"/>'],
    ['store', '상점', 'Store', '<path d="M4 10v10h16V10M3 10l2-6h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 20v-5h4v5"/>'],
    ['building', '회사', 'Company', '<rect x="5" y="3" width="14" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"/>'],
    ['calendar', '달력', 'Calendar', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['target', '목표', 'Goal', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.500"/>'],
    ['trendUp', '성장', 'Growth', '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  ]),
  group('places', '이동·장소', 'Transport & Places', '#ea580c', [
    ['truck', '트럭', 'Truck', '<rect x="2.500" y="6" width="12" height="11"/><path d="M14.500 10h4l3 3.500V17h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17.500" cy="18" r="2"/>'],
    ['car', '자동차', 'Car', '<path d="M3 16v-3l2.500-6h13L21 13v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3.500 12.500h17"/><circle cx="7.500" cy="17" r="1.800"/><circle cx="16.500" cy="17" r="1.800"/>'],
    ['bus', '버스', 'Bus', '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 21v-3M16 21v-3M8 14.500h.01M16 14.500h.01"/>'],
    ['plane', '비행기', 'Plane', '<path d="M21.500 3c-1-.8-2.700-.5-3.700.5L14 7.500 5 5.500 3.500 7l7 4-3.500 3.500-2.500-.5L3 15.500l3.500 1.500 1.500 3.500 1.500-1.500-.5-2.500 3.500-3.500 4 7 1.500-1.500-2-9 4-3.800c1-1 1.300-2.700.5-3.700z"/>'],
    ['ship', '배', 'Ship', '<path d="M3 15l2 5h14l2-5-9-3z"/><path d="M6 13.300V8h12v5.300M12 8V3M2 22c2 0 2-1 4-1s2 1 4 1"/>'],
    ['drone', '드론', 'Drone', '<rect x="9" y="9.500" width="6" height="5" rx="1"/><path d="M9 10L5.500 6.500M15 10l3.500-3.500M9 14l-3.500 3.500M15 14l3.500 3.500M3 6.500h5M16 6.500h5M3 17.500h5M16 17.500h5"/>'],
    ['pin', '위치', 'Location', '<path d="M12 22s7-7.300 7-12.500a7 7 0 0 0-14 0C5 14.700 12 22 12 22z"/><circle cx="12" cy="9.500" r="2.500"/>'],
    ['map', '지도', 'Map', '<path d="M3 6l6-2.500 6 2.500 6-2.500v15L15 21l-6-2.500L3 21zM9 3.500v15M15 6v15"/>'],
    ['home', '집', 'Home', '<path d="M3 11.500L12 4l9 7.500"/><path d="M5.500 10v10h13V10M10 20v-6h4v6"/>'],
    ['factory', '공장', 'Factory', '<path d="M3 21V10l6 4v-4l6 4V4h6v17z"/><path d="M7 17.500h2M12 17.500h2M17 17.500h2"/>'],
  ]),
  group('nature', '자연·과학', 'Nature & Science', '#0d9488', [
    ['sun', '해', 'Sun', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.500M12 19.500V22M2 12h2.500M19.500 12H22M5 5l1.800 1.800M17.200 17.200L19 19M19 5l-1.800 1.800M6.800 17.200L5 19"/>'],
    ['moon', '달', 'Moon', '<path d="M20 14.500A8.500 8.500 0 0 1 9.500 4a8.500 8.500 0 1 0 10.500 10.500z"/>'],
    ['bolt', '전기', 'Power', '<path d="M13 2.500L5 14h6l-1 7.500L19 10h-6z"/>'],
    ['drop', '물방울', 'Water', '<path d="M12 3s7 7.200 7 11.500a7 7 0 0 1-14 0C5 10.200 12 3 12 3z"/>'],
    ['flame', '불꽃', 'Flame', '<path d="M12 2.500c.5 4 5.500 6 5.500 11.500a5.500 5.500 0 0 1-11 0c0-2.500 1.300-4 2.500-5 .2 1.500 1 2.500 2 3 .5-3.500-.5-6.500 1-9.500z"/>'],
    ['leaf', '잎', 'Leaf', '<path d="M20.500 3.500C11 3.500 4.500 8 4.500 15c0 1.500.5 3 1 4 1 .5 2.500 1 4 1 7 0 11-6.500 11-16.500z"/><path d="M4 21c2-5 6-9 11-11.500"/>'],
    ['tree', '나무', 'Tree', '<path d="M12 2.500L6.500 10H9l-4 6h14l-4-6h2.500z"/><path d="M12 16v5.500"/>'],
    ['flask', '실험', 'Experiment', '<path d="M9.500 3h5M10.500 3v6.500L4.500 19a1.500 1.500 0 0 0 1.300 2.200h12.400a1.500 1.500 0 0 0 1.300-2.200l-6-9.500V3M7.500 15h9"/>'],
    ['atom', '원자', 'Atom', '<circle cx="12" cy="12" r="1.700"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>'],
    ['thermometer', '온도', 'Temperature', '<path d="M14 14.500V5a2 2 0 0 0-4 0v9.500a4 4 0 1 0 4 0z"/><path d="M12 9v8"/>'],
  ]),
  group('symbols', '상징·상태', 'Symbols & Status', '#9333ea', [
    ['check', '완료', 'Done', '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l2.800 2.800L16 9.500"/>'],
    ['cross', '실패', 'Failed', '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'],
    ['warning', '경고', 'Warning', '<path d="M12 3.500L2.500 20.500h19z"/><path d="M12 10v5M12 17.800h.01"/>'],
    ['info', '정보', 'Information', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500h.01"/>'],
    ['question', '질문', 'Question', '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.300-1 .8-1 1.700M12 17h.01"/>'],
    ['star', '별', 'Star', '<path d="M12 3l2.800 5.800 6.200.9-4.500 4.400 1.100 6.300L12 17.400l-5.600 3 1.100-6.300L3 9.700l6.200-.9z"/>'],
    ['heart', '하트', 'Heart', '<path d="M12 20.500S3 15 3 8.800A4.800 4.800 0 0 1 12 6.500a4.800 4.800 0 0 1 9 2.300c0 6.200-9 11.700-9 11.700z"/>'],
    ['flag', '깃발', 'Flag', '<path d="M5 21V4h13l-3 4.500 3 4.500H5"/>'],
    ['bulb', '아이디어', 'Idea', '<path d="M9 17h6M10 21h4M8.500 14.500a6.500 6.500 0 1 1 7 0c-.7.500-1 1.300-1 2.500h-5c0-1.200-.3-2-1-2.500z"/>'],
    ['gear', '설정', 'Settings', '<circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>'],
  ]),
];

export const LIBRARY_ICONS = ICON_GROUPS.flatMap((g) => g.icons);
const BY_ID = new Map(LIBRARY_ICONS.map((item) => [item.id, item]));

/** A library icon by id (undefined if unknown: the file came from a newer version, say). */
export const libraryIcon = (id) => BY_ID.get(id);

// ───────────────────────── the user's own icons (kept in localStorage, shared by all windows)

export const MY_ICONS_KEY = 'myumlmaker.myIcons.v1';
export const MY_ICONS_MAX = 200;
/** A data URL larger than this is refused: localStorage holds about 5 MB in all. */
export const MY_ICON_MAX_BYTES = 256 * 1024;
const ICON_SRC = /^data:image\/(png|jpeg|gif|webp|bmp|svg\+xml)[;,]/i;

/** Only pictures as data URLs: drawn with <image>, so nothing in them can run. */
export const isIconSource = (src) => typeof src === 'string' && ICON_SRC.test(src);

export function loadMyIcons(storage) {
  try {
    const list = JSON.parse(storage?.getItem(MY_ICONS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === 'string' && isIconSource(item.src)).map((item) => ({ id: item.id, name: String(item.name ?? ''), src: item.src })) : [];
  } catch {
    return [];
  }
}

export function storeMyIcons(storage, list) {
  storage?.setItem(MY_ICONS_KEY, JSON.stringify(list));
}

/** The list with one more icon, or { error } saying why not. */
export function addMyIcon(list, { name, src }, id = `my-${Date.now().toString(36)}-${list.length}`) {
  if (!isIconSource(src)) return { error: 'type' };
  if (src.length > MY_ICON_MAX_BYTES) return { error: 'size' };
  if (list.length >= MY_ICONS_MAX) return { error: 'count' };
  const existing = list.find((item) => item.src === src);
  if (existing) return { list, icon: existing };
  const icon = { id, name: String(name ?? '').trim() || `#${list.length + 1}`, src };
  return { list: [...list, icon], icon };
}

export const removeMyIcon = (list, id) => list.filter((item) => item.id !== id);
