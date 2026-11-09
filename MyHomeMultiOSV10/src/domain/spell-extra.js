// Words the dictionaries lack but a website commonly has: web and technology terms, loanwords of
// shops and services, days and months, well-known services, and the names the program itself
// puts in new blocks, templates and samples (so a fresh site has no spelling problems).
// The user's own words are added in Settings › Dictionary (or from the Problems panel).

const EN = `
signup login logout wifi faq faqs livestream livestreams selfie selfies emoji emojis sitemap sitemaps backend frontend fullstack javascript typescript css html api apis seo ux ui saas
pilates zumba crossfit selfcare skincare coworking onboarding rebrand glassmorphism neumorphism darkmode microsite microsites webshop webinar webinars nocode lowcode
pm am ok okay vs etc ebook ebooks inbox chatbot chatbots podcast podcasts hashtag hashtags dropdown popup popups favicon wireframe wireframes mockup mockups
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
christmas easter halloween thanksgiving seoul busan incheon jeju korea korean tokyo london paris newyork
instagram facebook youtube tiktok linkedin twitter kakao kakaotalk naver google apple microsoft netflix spotify github figma notion slack discord whatsapp pinterest threads
kubernetes docker americano latte espresso cappuccino macchiato barista brunch croissant
myhomemaker myhome mhomt
mondays tuesdays wednesdays thursdays fridays saturdays sundays macaron macarons meetup meetups roastery roasteries caffe ethiopia glasgow kyoto manchester
kg liam olivia kim choi yoon park lee jung han mia jamie alex sophie minho hangyeol ondam brightway northwind contoso fabrikam litware cloudnote leonardo vinci da
`;

const KO = `
뉴스레터 챗봇 해시태그 웨비나 백엔드 프런트엔드 프론트엔드 풀스택 반응형 섹션 템플릿 브랜딩 배너 팔로우 언팔로우 좋아요 공유 댓글 스토리 릴스 쇼츠 라이브
인스타그램 페이스북 유튜브 카카오톡 카카오 카톡 구글 틱톡 스레드 네이버 블로그 노션 피그마 깃허브 링크드인 엑스
스타트업 인플루언서 크리에이터 유튜버 프리랜서 노코드 로우코드 마이크로사이트 랜딩페이지 원페이지 홈페이지 웹페이지 웹사이트 웹진 웹툰 쇼핑몰 오픈마켓
라테 라떼 아메리카노 바리스타 브런치 비건 크로스핏 코워킹 그라데이션 미니멀 다크모드 라이트모드 벤토 글래스모피즘 뉴모피즘 인터랙션 마이크로인터랙션 스크롤 패럴랙스
더보기 바로가기 오시는길 자주묻는질문 특가 베스트 신상 신메뉴 원데이클래스 원데이 클래스 웨딩 일러스트레이터 트레이너 셰프 오너 굿즈 브루잉 브루 드립 디카페인 마카롱 크루아상 런치 디너 테이크아웃 브레이크타임 라스트오더
재방문율 소금빵 솥밥 모닝 포근 뜨개 향초 셔틀 청년부 입문반 정규반 대회반 산악회 둘레길 관악산 무농약 작품집 비스트로 페어링 전월세 중개사 클라우드 클라우드노트 온담 루나 한빛
김하늘 이준호 박서연 최민지 최민수 입주민 푸른숲 헬프데스크 그늘막 러닝머신 국수집 정유진 한지호 윤가은 김지우 이서준 민준 서연 레오나르도 다빈치
마이홈메이커 누군가 누구든 아무개
기초반 회화반 비즈니스반 입문반 네트워킹 다회용 달콤 라이프 로스터리 로스팅 리뉴얼 밀키트 병아리콩 보울 브루어리 세무 세무회계 세션 스무디 스타터 스페셜티 양조장 엔터프라이즈 자유석 커리 커리어 컨퍼런스 코칭 페일 포케 핸드 흑맥주
`;

const list = (text) => text.split(/\s+/).filter(Boolean);
export const SPELL_EXTRA = { en: list(EN), ko: list(KO) };
