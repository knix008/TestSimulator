// The bulletin boards of the sample sites: for each sample that has one, the board page's name,
// its title and text, the categories and the posts — each text as a [Korean, English] pair.
// Posts: [title, category (index), author, date, views, notice, text]. samples.js turns them
// into a board block (blocks.js 'board').

const ADMIN = ['관리자', 'Admin'];
const STAFF = ['운영진', 'Team'];
const A = ['김하늘', 'Emma'];
const B = ['이준호', 'Liam'];
const C = ['박서연', 'Olivia'];
const D = ['최민지', 'Mia'];

export const SAMPLE_BOARDS = {
  church: {
    page: ['교회 소식', 'News'], title: ['교회 소식', 'Church news'], text: ['예배 안내와 교회 소식을 나눕니다.', 'Service times and news from the church.'],
    cats: [['공지', 'Notice'], ['예배', 'Worship'], ['나눔', 'Sharing']],
    posts: [
      [['성탄 예배 시간 안내', 'Christmas service times'], 0, ADMIN, '2026-11-02', 210, true, ['성탄 예배는 12월 25일 오전 11시에 드립니다.\n어린이 발표회가 함께 있습니다.', 'The Christmas service is on December 25 at 11 am.\nThe children will perform too.']],
      [['청년부 수련회 신청', 'Youth retreat sign-up'], 1, STAFF, '2026-11-04', 88, false, ['12월 첫 주말에 청년부 수련회가 있습니다. 교회 사무실에서 신청해 주세요.', 'The youth retreat is on the first weekend of December. Sign up at the church office.']],
      [['김장 나눔에 함께해 주세요', 'Help us share kimchi'], 2, A, '2026-11-06', 64, false, ['이웃에게 전할 김치를 함께 담급니다. 앞치마만 가져오세요.', 'We make kimchi for our neighbours. Just bring an apron.']],
      [['주차장 이용 안내', 'Parking'], 0, ADMIN, '2026-11-08', 45, false, ['예배 시간에는 옆 학교 운동장에 주차할 수 있습니다.', 'During services you can park in the school yard next door.']],
    ],
  },
  school: {
    page: ['알림장', 'Notices'], title: ['알림장', 'Class notices'], text: ['수업 소식과 부모님 질문을 모아 둡니다.', 'Class news and questions from parents.'],
    cats: [['공지', 'Notice'], ['수업', 'Class'], ['질문', 'Question']],
    posts: [
      [['겨울 방학 특강 안내', 'Winter holiday workshop'], 0, ADMIN, '2026-11-01', 156, true, ['방학 동안 로봇 만들기 특강을 엽니다. 반마다 8명까지 받습니다.', 'During the holidays we run a robot workshop. Up to eight kids a class.']],
      [['이번 주 수업: 미로 게임', "This week: a maze game"], 1, ['선생님', 'Teacher'], '2026-11-05', 73, false, ['블록 코딩으로 미로를 빠져나가는 게임을 만들었어요.', 'We built a maze game with block coding.']],
      [['노트북을 가져가야 하나요?', 'Should my child bring a laptop?'], 2, C, '2026-11-06', 39, false, ['수업 때 노트북이 필요한지 궁금합니다.', 'I wonder whether a laptop is needed in class.']],
      [['대회 수상을 축하합니다', 'Congratulations on the award'], 0, ADMIN, '2026-11-08', 95, false, ['정규반 친구들이 지역 대회에서 상을 받았습니다.', 'Our regular class won a prize at the local contest.']],
    ],
  },
  gym: {
    page: ['회원 게시판', 'Members'], title: ['회원 게시판', 'Members board'], text: ['운동 일지와 센터 소식을 나눠요.', 'Training logs and news from the gym.'],
    cats: [['공지', 'Notice'], ['운동 기록', 'Training log'], ['질문', 'Question']],
    posts: [
      [['연말 운영 시간 안내', 'Year-end opening hours'], 0, ADMIN, '2026-11-03', 132, true, ['12월 31일은 오후 6시까지 엽니다.', 'On December 31 we close at 6 pm.']],
      [['3개월 만에 10kg 뺐습니다', 'Down 10 kg in three months'], 1, B, '2026-11-05', 241, false, ['트레이너님 덕분에 꾸준히 할 수 있었어요. 다들 힘내세요!', 'Thanks to my trainer I kept going. Good luck, everyone!']],
      [['초보 운동 순서가 궁금해요', 'Where should a beginner start?'], 2, D, '2026-11-07', 58, false, ['처음 오면 어떤 기구부터 쓰면 좋을까요?', 'Which machines should I use first?']],
      [['새 기구가 들어왔습니다', 'New machines are in'], 0, STAFF, '2026-11-08', 77, false, ['2층에 새 러닝머신 4대를 놓았습니다.', 'Four new treadmills are on the second floor.']],
    ],
  },
  club: {
    page: ['산행 게시판', 'Hike board'], title: ['산행 게시판', 'Hike board'], text: ['산행 공지와 후기, 사진을 올려 주세요.', 'Hike notices, reports and photos.'],
    cats: [['공지', 'Notice'], ['후기', 'Report'], ['자유', 'General']],
    posts: [
      [['11월 산행 준비물', 'What to bring in November'], 0, STAFF, '2026-11-01', 118, true, ['따뜻한 겉옷, 물, 간식을 꼭 챙겨 주세요.', 'Please bring a warm jacket, water and snacks.']],
      [['둘레길 산행 후기', 'River trail report'], 1, A, '2026-11-09', 64, false, ['단풍이 정말 예뻤습니다. 다음에도 함께해요!', 'The autumn leaves were lovely. See you next time!']],
      [['등산화 추천해 주세요', 'Which hiking boots?'], 2, B, '2026-11-10', 41, false, ['처음 사는 등산화로 어떤 것이 좋을까요?', 'Any tips for a first pair of hiking boots?']],
      [['송년 산행 참석 확인', 'Year-end hike: who is coming?'], 0, STAFF, '2026-11-12', 52, false, ['12월 송년 산행에 오실 분은 댓글 대신 문자로 알려 주세요.', 'If you come to the year-end hike, please text us.']],
    ],
  },
  conference: {
    page: ['공지사항', 'Announcements'], title: ['공지사항', 'Announcements'], text: ['행사 소식과 자주 묻는 질문을 알려 드립니다.', 'News and answers about the event.'],
    cats: [['공지', 'Notice'], ['발표', 'Talks'], ['질문', 'Question']],
    posts: [
      [['입장 안내', 'Getting in'], 0, STAFF, '2026-11-10', 520, true, ['등록 데스크는 오전 9시에 엽니다. 이름표를 꼭 받아 가세요.', 'Registration opens at 9 am. Please pick up your badge.']],
      [['발표 자료를 올렸습니다', 'Slides are online'], 1, STAFF, '2026-11-21', 310, false, ['모든 발표 자료를 내려받을 수 있습니다.', 'All the slides can be downloaded now.']],
      [['실습 때 노트북이 필요한가요?', 'Do I need a laptop for workshops?'], 2, C, '2026-11-12', 97, false, ['실습 세션에 노트북을 가져가야 하나요?', 'Should I bring a laptop to the workshops?']],
      [['저녁 모임 장소 변경', 'Evening meetup has moved'], 0, STAFF, '2026-11-15', 143, false, ['저녁 모임은 2층 라운지에서 열립니다.', 'The evening meetup is in the second-floor lounge.']],
    ],
  },
  yoga: {
    page: ['수련 이야기', 'Stories'], title: ['수련 이야기', 'Practice stories'], text: ['수업 공지와 회원들의 이야기를 나눕니다.', 'Class news and stories from our members.'],
    cats: [['공지', 'Notice'], ['후기', 'Review'], ['질문', 'Question']],
    posts: [
      [['12월 수업 시간표', 'December timetable'], 0, ADMIN, '2026-11-05', 99, true, ['저녁 명상 수업이 하나 늘었습니다.', 'There is one more evening meditation class.']],
      [['처음 요가를 해 봤어요', 'My first yoga class'], 1, D, '2026-11-06', 47, false, ['몸이 뻣뻣해도 괜찮다고 해 주셔서 편했어요.', 'I felt at ease, even though I am not flexible.']],
      [['매트를 가져가야 하나요?', 'Should I bring a mat?'], 2, A, '2026-11-07', 31, false, ['스튜디오에 매트가 있는지 궁금합니다.', 'Are there mats at the studio?']],
      [['휴무 안내', 'Closed for a day'], 0, ADMIN, '2026-11-09', 54, false, ['11월 23일은 쉽니다.', 'We are closed on November 23.']],
    ],
  },
  bookclub: {
    page: ['읽기 게시판', 'Reading board'], title: ['읽기 게시판', 'Reading board'], text: ['읽은 책의 한 줄과 모임 소식을 남겨 주세요.', 'A line about your book, and club news.'],
    cats: [['공지', 'Notice'], ['한 줄 감상', 'One line'], ['추천', 'Suggestion']],
    posts: [
      [['11월의 책', 'The book for November'], 0, STAFF, '2026-11-01', 87, true, ['이번 달에는 짧은 소설 모음을 함께 읽습니다.', 'This month we read a book of short stories.']],
      [['마지막 장이 오래 남아요', 'The last chapter stays with me'], 1, C, '2026-11-08', 36, false, ['조용한 문장이 마음에 오래 남았습니다.', 'Its quiet sentences stayed with me for a long time.']],
      [['다음 달 책을 추천합니다', 'A book for next month'], 2, B, '2026-11-10', 29, false, ['겨울에 어울리는 여행 에세이를 추천해요.', 'I suggest a travel book that suits the winter.']],
      [['모임 장소 안내', 'Where we meet'], 0, STAFF, '2026-11-12', 40, false, ['책방 2층에서 저녁 7시에 만납니다.', 'We meet upstairs at the bookshop at 7 pm.']],
    ],
  },
  volunteer: {
    page: ['봉사 게시판', 'Volunteer board'], title: ['봉사 게시판', 'Volunteer board'], text: ['봉사 일정과 활동 후기를 나눕니다.', 'Dates and stories from our volunteering.'],
    cats: [['공지', 'Notice'], ['활동 후기', 'Story'], ['함께해요', 'Join us']],
    posts: [
      [['11월 봉사 일정', 'November dates'], 0, STAFF, '2026-11-01', 140, true, ['도시락 나눔과 하천 정화가 있습니다. 편한 날 함께해 주세요.', 'Meal delivery and a river clean-up. Join us on a day that suits you.']],
      [['도시락 나눔 후기', 'Meal delivery story'], 1, A, '2026-11-16', 58, false, ['할머니께서 고맙다고 손을 꼭 잡아 주셨어요.', 'An old lady held my hand to say thank you.']],
      [['나눔 장터 물건을 받습니다', 'Gifts for the charity market'], 2, STAFF, '2026-11-18', 66, false, ['깨끗한 옷과 책을 사무실로 보내 주세요.', 'Please send clean clothes and books to our office.']],
      [['봉사 시간 확인서 안내', 'Volunteering certificates'], 0, ADMIN, '2026-11-20', 49, false, ['확인서가 필요하신 분은 이메일로 알려 주세요.', 'If you need a certificate, please e-mail us.']],
    ],
  },
  academy: {
    page: ['학습 게시판', 'Study board'], title: ['학습 게시판', 'Study board'], text: ['반 공지, 질문과 공부 팁을 나눕니다.', 'Class notices, questions and study tips.'],
    cats: [['공지', 'Notice'], ['질문', 'Question'], ['공부 팁', 'Tip']],
    posts: [
      [['12월 반 편성 안내', 'December classes'], 0, ADMIN, '2026-11-04', 175, true, ['레벨 테스트 결과에 따라 반을 다시 나눕니다.', 'Classes change after the level test.']],
      [['발음 연습은 어떻게 하나요?', 'How do I practise pronunciation?'], 1, B, '2026-11-06', 62, false, ['혼자 발음 연습을 하는 방법이 궁금합니다.', 'How can I practise pronunciation on my own?']],
      [['하루 10분 따라 말하기', 'Ten minutes of repeating a day'], 2, ['선생님', 'Teacher'], '2026-11-07', 133, false, ['짧은 문장을 듣고 바로 따라 말해 보세요. 매일 하면 달라집니다.', 'Listen to a short sentence and repeat it at once. Do it every day.']],
      [['보강 수업 안내', 'Make-up class'], 0, ADMIN, '2026-11-09', 51, false, ['쉬었던 수업은 토요일 오전에 보강합니다.', 'Missed classes are made up on Saturday morning.']],
    ],
  },
  clinic: {
    page: ['공지사항', 'Notices'], title: ['공지사항', 'Notices'], text: ['진료 안내와 자주 묻는 질문입니다.', 'Opening times and common questions.'],
    cats: [['공지', 'Notice'], ['진료 안내', 'Care'], ['질문', 'Question']],
    posts: [
      [['연휴 진료 시간', 'Holiday opening hours'], 0, ADMIN, '2026-11-02', 188, true, ['연휴 첫날은 오전만 진료합니다.', 'On the first day of the holiday we are open in the morning only.']],
      [['스케일링은 1년에 한 번', 'A cleaning once a year'], 1, ['원장', 'Dentist'], '2026-11-05', 96, false, ['1년에 한 번 스케일링으로 잇몸을 지키세요.', 'A yearly cleaning keeps your gums healthy.']],
      [['아이가 처음 가도 괜찮나요?', "Is it fine for my child's first visit?"], 2, D, '2026-11-07', 44, false, ['다섯 살 아이도 진료를 받을 수 있나요?', 'Can a five-year-old be seen?']],
      [['주차 안내', 'Parking'], 0, ADMIN, '2026-11-08', 61, false, ['건물 지하 주차장을 1시간 무료로 쓸 수 있습니다.', 'The underground car park is free for one hour.']],
    ],
  },
  coworking: {
    page: ['입주자 게시판', 'Members board'], title: ['입주자 게시판', 'Members board'], text: ['공지와 입주자 소식을 나눕니다.', 'Notices and news between members.'],
    cats: [['공지', 'Notice'], ['함께 일해요', 'Work together'], ['자유', 'General']],
    posts: [
      [['회의실 예약 방법이 바뀝니다', 'Booking rooms has changed'], 0, STAFF, '2026-11-03', 201, true, ['이제 앱에서 회의실을 예약할 수 있습니다.', 'You can now book meeting rooms in the app.']],
      [['디자이너를 찾습니다', 'Looking for a designer'], 1, B, '2026-11-05', 72, false, ['작은 앱 화면을 함께 만들 디자이너를 찾아요.', 'I am looking for a designer for a small app.']],
      [['금요일 점심 함께해요', 'Lunch together on Friday'], 2, A, '2026-11-06', 38, false, ['라운지에서 함께 점심 먹어요.', "Let's have lunch together in the lounge."]],
      [['커피 머신 점검', 'Coffee machine check'], 0, STAFF, '2026-11-08', 55, false, ['수요일 오전에 커피 머신을 점검합니다.', 'The coffee machine is checked on Wednesday morning.']],
    ],
  },
  // ── the samples built around their board
  support: {
    page: ['고객 포럼', 'Forum'], title: ['고객 포럼', 'Customer forum'], text: ['궁금한 점을 묻고, 문제를 알려 주세요. 담당자가 답해 드립니다.', 'Ask a question or report a problem. Our team answers.'],
    cats: [['공지', 'Notice'], ['질문', 'Question'], ['오류 신고', 'Bug report'], ['제안', 'Idea']],
    posts: [
      [['새 버전 2.4 출시', 'Version 2.4 is out'], 0, ADMIN, '2026-11-02', 640, true, ['더 빠른 검색과 어두운 화면을 써 보세요.', 'Try the faster search and the dark mode.']],
      [['비밀번호를 잊었어요', 'I forgot my password'], 1, A, '2026-11-03', 120, false, ['로그인 화면의 비밀번호 찾기를 눌러도 메일이 오지 않아요.', 'The reset e-mail does not arrive.']],
      [['내보내기 버튼이 안 눌려요', 'The export button does nothing'], 2, B, '2026-11-04', 87, false, ['보고서 화면에서 내보내기를 누르면 아무 일도 없습니다.', 'Nothing happens when I press export on the report page.']],
      [['일정 공유 기능이 있으면 좋겠어요', 'Please add shared calendars'], 3, C, '2026-11-05', 64, false, ['팀원과 일정을 함께 보면 좋겠습니다.', 'It would help to see the team calendar together.']],
      [['파일 크기 제한이 있나요?', 'Is there a file size limit?'], 1, D, '2026-11-06', 51, false, ['큰 동영상 파일도 올릴 수 있는지 궁금합니다.', 'Can I upload large video files?']],
      [['점검 안내', 'Maintenance'], 0, ADMIN, '2026-11-07', 233, true, ['일요일 새벽 2시부터 1시간 동안 점검합니다.', 'We are down for one hour from 2 am on Sunday.']],
      [['동기화가 느려요', 'Sync is slow'], 2, A, '2026-11-08', 42, false, ['휴대폰에서 바뀐 내용이 PC에 늦게 보입니다.', 'Changes on my phone show late on my computer.']],
    ],
  },
  market: {
    page: ['장터 게시판', 'Market board'], title: ['장터 게시판', 'Market board'], text: ['장터 소식, 상품 문의, 구매 후기를 남겨 주세요.', 'Market news, questions and reviews.'],
    cats: [['공지', 'Notice'], ['상품 문의', 'Question'], ['구매 후기', 'Review']],
    posts: [
      [['이번 주 장터 쉬는 날', 'No market this week'], 0, ADMIN, '2026-11-02', 310, true, ['비 소식이 있어 이번 토요일 장터는 쉽니다.', 'Rain is coming, so there is no market this Saturday.']],
      [['사과는 언제까지 나오나요?', 'Until when are there apples?'], 1, A, '2026-11-03', 56, false, ['겨울에도 사과를 살 수 있나요?', 'Can I buy apples in the winter too?']],
      [['배추가 정말 달아요', 'The cabbage is so sweet'], 2, C, '2026-11-04', 72, false, ['김장할 때 썼는데 모두 맛있다고 했어요.', 'I used it for kimchi and everyone loved it.']],
      [['택배도 되나요?', 'Do you deliver?'], 1, B, '2026-11-05', 48, false, ['멀리 살아서 택배로 받고 싶어요.', 'I live far away and would like a delivery.']],
      [['새로 온 가게 소개', 'New stalls'], 0, STAFF, '2026-11-06', 129, false, ['수제 잼 가게와 꿀 가게가 함께합니다.', 'A jam stall and a honey stall join us.']],
    ],
  },
  fanclub: {
    page: ['팬 게시판', 'Fan board'], title: ['팬 게시판', 'Fan board'], text: ['공연 소식과 응원 글을 남겨 주세요.', 'Show news and messages for the band.'],
    cats: [['공지', 'Notice'], ['응원', 'Cheers'], ['공연 후기', 'Show review'], ['사진', 'Photos']],
    posts: [
      [['연말 공연 예매 안내', 'Year-end show tickets'], 0, STAFF, '2026-11-01', 980, true, ['팬클럽 회원은 하루 먼저 예매할 수 있습니다.', 'Members can book one day early.']],
      [['새 노래 정말 좋아요', 'The new song is great'], 1, D, '2026-11-03', 214, false, ['하루 종일 듣고 있어요. 늘 응원합니다!', 'I have been listening all day. Always cheering for you!']],
      [['부산 공연 후기', 'Busan show review'], 2, B, '2026-11-05', 187, false, ['마지막 곡에서 모두 함께 노래했어요.', 'We all sang together on the last song.']],
      [['공연장 사진 모음', 'Photos from the show'], 3, A, '2026-11-06', 256, false, ['멀리서 찍었지만 분위기가 잘 담겼어요.', 'Taken from far away, but the mood is all there.']],
      [['팬 모임 장소 안내', 'Fan meetup place'], 0, STAFF, '2026-11-08', 340, false, ['공연 전 오후 3시에 공연장 앞에서 만나요.', 'We meet at 3 pm in front of the hall before the show.']],
    ],
  },
  apartment: {
    page: ['입주민 게시판', 'Residents board'], title: ['입주민 게시판', 'Residents board'], text: ['관리 사무소 공지와 이웃 소식을 나눕니다.', 'Notices from the office and news between neighbours.'],
    cats: [['공지', 'Notice'], ['생활 정보', 'Life'], ['나눔', 'Sharing'], ['건의', 'Suggestion']],
    posts: [
      [['승강기 점검 안내', 'Lift maintenance'], 0, ['관리 사무소', 'Office'], '2026-11-02', 420, true, ['11월 10일 오전에 101동 승강기를 점검합니다.', 'The lift in building 101 is checked on the morning of November 10.']],
      [['분리수거 요일이 바뀝니다', 'Recycling day changes'], 0, ['관리 사무소', 'Office'], '2026-11-03', 388, true, ['이제 수요일과 토요일에 분리수거를 합니다.', 'Recycling is now on Wednesdays and Saturdays.']],
      [['어린이 자전거 나눔해요', 'Free kids bike'], 2, A, '2026-11-04', 92, false, ['아이가 커서 못 타는 자전거를 드려요.', 'My child has outgrown this bike. It is yours.']],
      [['동네 맛집 추천', 'Good places to eat nearby'], 1, C, '2026-11-05', 151, false, ['정문 앞 국수집이 정말 맛있어요.', 'The noodle shop by the front gate is really good.']],
      [['놀이터 그늘막 설치 건의', 'Shade for the playground'], 3, B, '2026-11-06', 77, false, ['여름에 놀이터가 너무 더워요. 그늘막을 설치하면 좋겠습니다.', 'The playground is too hot in summer. Please add some shade.']],
      [['주민 음악회 안내', 'Residents concert'], 0, ['관리 사무소', 'Office'], '2026-11-07', 205, false, ['11월 마지막 토요일, 커뮤니티 센터에서 작은 음악회를 엽니다.', 'A small concert at the community centre on the last Saturday of November.']],
    ],
  },
};
