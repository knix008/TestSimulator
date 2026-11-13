// Sample texts for the start page's "예제 텍스트" card (the same texts as samples/*.txt,
// embedded so the packaged app, which does not ship the samples folder, has them too).
export const SAMPLE_GROUPS = [
  { id: 'ko', icon: 'ttsLanguage', label: '한국어', language: 'ko-KR' },
  { id: 'en', icon: 'globe', label: 'English', language: 'en-US' },
];

export const SAMPLES = [
  {
    id: 'korean_greeting', group: 'ko', icon: 'ttsSpeak', title: '인사말', tip: '짧은 인사와 프로그램 소개',
    text: '안녕하세요. 반갑습니다.\n저는 MyTTS 데모 프로그램입니다.\n한국어와 영어를 모두 지원합니다.\n텍스트를 입력하고 읽기 버튼을 누르면 음성으로 변환됩니다.\n좋은 하루 보내세요!',
  },
  {
    id: 'korean_news', group: 'ko', icon: 'notes', title: '뉴스', tip: '날씨·경제·기술 소식 다섯 문장',
    text: '오늘 서울의 날씨는 맑고 기온은 섭씨 22도입니다.\n한국 경제는 올해 3.2퍼센트 성장할 것으로 예상됩니다.\n인공지능 기술이 빠르게 발전하면서 다양한 산업에 활용되고 있습니다.\n특히 텍스트 음성 변환 기술은 접근성 향상에 크게 기여하고 있습니다.\n앞으로도 더 자연스러운 음성 합성 기술이 개발될 것으로 기대됩니다.',
  },
  {
    id: 'korean_story', group: 'ko', icon: 'star', title: '동화', tip: '반짝이는 돌을 찾은 소년 이야기',
    text: '옛날 옛적에 작은 마을에 한 소년이 살았습니다.\n소년의 이름은 민준이었고, 매일 아침 산을 오르는 것을 좋아했습니다.\n어느 날, 산 정상에서 반짝이는 돌을 발견했습니다.\n돌을 집어 들자 따뜻한 빛이 손을 감쌌습니다.\n그 순간부터 민준이가 하는 말은 모두 현실이 되었습니다.\n민준이는 이 능력으로 마을 사람들을 도우며 행복하게 살았습니다.',
  },
  {
    id: 'korean_weather', group: 'ko', icon: 'sun', title: '일기 예보', tip: '오늘과 내일의 날씨 안내',
    text: '오늘 아침 기온은 영하 2도로 어제보다 조금 쌀쌀합니다.\n낮에는 햇살이 비치면서 서울의 최고 기온이 10도까지 오르겠습니다.\n저녁부터는 서쪽 지방에 구름이 많아지고 밤늦게 비가 조금 내리겠습니다.\n내일은 비가 그친 뒤 바람이 강하게 불어 체감 온도가 더 낮겠습니다.\n외출하실 때 따뜻한 옷과 작은 우산을 챙기시기 바랍니다.',
  },
  {
    id: 'korean_guide', group: 'ko', icon: 'ttsGuide', title: '안내 방송', tip: '도서관 이용 안내 방송',
    text: '도서관을 이용해 주시는 여러분께 안내 말씀 드리겠습니다.\n잠시 후 오후 여섯 시에 일반 열람실 운영이 끝납니다.\n대출하실 책은 일 층 안내 데스크에서 여섯 시 전까지 신청해 주십시오.\n반납은 정문 옆 무인 반납기에서 밤 열 시까지 하실 수 있습니다.\n오늘도 도서관을 찾아 주셔서 감사합니다.',
  },
  {
    id: 'english_greeting', group: 'en', icon: 'ttsSpeak', title: 'Greeting', tip: 'A short welcome to the app',
    text: 'Hello! Welcome to MyTTS.\nThis application converts text to speech using advanced AI models.\nYou can type any text in the input area and click the Read button.\nThe system supports both Korean and English languages.\nWe hope you enjoy using this application. Have a great day!',
  },
  {
    id: 'english_story', group: 'en', icon: 'star', title: 'Story', tip: 'Clara, the Voice Maker',
    text: "Once upon a time, in a land far away, there lived a young inventor named Clara.\nEvery day, she would tinker with gears and circuits in her workshop.\nOne morning, she discovered a way to give machines the gift of speech.\nThe machines could now tell stories, share knowledge, and sing songs.\nClara's invention spread joy throughout the kingdom, and she became known as the Voice Maker.\nHer legacy lives on in every device that speaks to us today.",
  },
  {
    id: 'english_tech', group: 'en', icon: 'bulb', title: 'Technology', tip: 'How modern TTS works',
    text: 'Text-to-speech technology has advanced significantly in recent years.\nModern TTS systems use deep learning models trained on thousands of hours of speech data.\nThese models can produce natural-sounding voices with proper intonation and rhythm.\nApplications range from accessibility tools for visually impaired users to voice assistants.\nThe Kokoro 82M model used in this application achieves high quality English synthesis.\nFuture developments will bring even more realistic and expressive speech generation.',
  },
  {
    id: 'english_recipe', group: 'en', icon: 'list', title: 'Recipe', tip: 'Pancakes in five steps',
    text: 'Here is a simple recipe for fluffy pancakes.\nFirst, whisk one cup of flour with two teaspoons of baking powder and a pinch of salt.\nIn another bowl, mix one egg, one cup of milk and two tablespoons of melted butter.\nPour the wet ingredients into the dry ones and stir until just combined.\nCook small circles of batter in a hot pan for about two minutes on each side.\nServe them warm with fresh fruit and a little maple syrup.',
  },
  {
    id: 'english_announcement', group: 'en', icon: 'ttsSpeak', title: 'Announcement', tip: 'A train station announcement',
    text: 'Attention please, passengers on platform three.\nThe ten fifteen express train to Riverside is running about five minutes late.\nPlease stand behind the yellow line as the train approaches the platform.\nThe first two carriages are reserved for passengers with bicycles.\nWe apologize for the delay and thank you for travelling with us today.',
  },
];
