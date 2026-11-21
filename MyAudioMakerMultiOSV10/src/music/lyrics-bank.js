// Phrase banks for the built-in lyric writer (music/lyrics.js), in Korean and English. Each theme has
// verse lines (scenes and details), hook lines (chorus: what the song says) and bridge lines (the
// turn). `{t}` is the user's own topic word; Korean particles after it are written as {t:을/를}.
// Lines are short (6–12 sung syllables) so the composer can set them to two bars each.

export const THEMES = [
  { id: 'love', ko: '사랑', en: 'Love', icon: 'themeLove' },
  { id: 'breakup', ko: '이별', en: 'Breakup', icon: 'themeBreakup' },
  { id: 'dream', ko: '꿈', en: 'Dreams', icon: 'themeDream' },
  { id: 'summer', ko: '여름', en: 'Summer', icon: 'themeSummer' },
  { id: 'night', ko: '밤', en: 'Night', icon: 'themeNight' },
  { id: 'friendship', ko: '우정', en: 'Friendship', icon: 'themeFriendship' },
  { id: 'hope', ko: '희망', en: 'Hope', icon: 'themeHope' },
  { id: 'rain', ko: '비', en: 'Rain', icon: 'themeRain' },
  { id: 'city', ko: '도시', en: 'City', icon: 'themeCity' },
  { id: 'travel', ko: '여행', en: 'Travel', icon: 'themeTravel' },
  { id: 'youth', ko: '청춘', en: 'Youth', icon: 'themeYouth' },
  { id: 'winter', ko: '겨울', en: 'Winter', icon: 'themeWinter' },
];
export const themeOf = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Words that point to a theme when the user types a topic ("첫사랑", "rainy day" …). */
export const THEME_WORDS = {
  love: ['사랑', '연애', '고백', '설렘', '첫사랑', '너', '그대', 'love', 'heart', 'kiss', 'darling', 'baby', 'crush'],
  breakup: ['이별', '헤어', '눈물', '그리움', '안녕', '떠나', 'goodbye', 'tears', 'breakup', 'miss', 'lonely', 'gone'],
  dream: ['꿈', '목표', '미래', '별', '날개', 'dream', 'star', 'future', 'fly', 'goal'],
  summer: ['여름', '바다', '해변', '파도', '햇살', '휴가', 'summer', 'beach', 'sea', 'ocean', 'sun', 'wave'],
  night: ['밤', '새벽', '달', '야경', '불빛', 'night', 'midnight', 'moon', 'dark', 'lights'],
  friendship: ['친구', '우정', '함께', '우리', 'friend', 'together', 'crew', 'us'],
  hope: ['희망', '내일', '응원', '힘', '빛', 'hope', 'tomorrow', 'rise', 'light', 'brave'],
  rain: ['비', '빗', '장마', '우산', '구름', 'rain', 'umbrella', 'cloud', 'storm'],
  city: ['도시', '서울', '거리', '지하철', '빌딩', 'city', 'street', 'town', 'subway', 'downtown'],
  travel: ['여행', '기차', '길', '떠나자', '바람', 'travel', 'road', 'train', 'journey', 'away'],
  youth: ['청춘', '학교', '스무', '시절', '젊', 'youth', 'young', 'school', 'forever'],
  winter: ['겨울', '눈', '크리스마스', '추위', '첫눈', 'winter', 'snow', 'christmas', 'cold'],
};

export const BANK = {
  ko: {
    love: {
      verse: ['창가에 스민 아침 햇살처럼', '네 이름을 조용히 불러봐', '두 손 가득 설렘을 안고서', '오늘도 너에게로 걸어가', '작은 웃음 하나에 하루가 피어', '네 곁에 있으면 시간이 멈춰', '아무 말 없이도 마음이 닿아', '커피 향 사이로 네가 웃어', '서툰 고백을 연습해 봐', '바람이 불어와 네 향기가 나', '별것 아닌 말에도 두근거려', '네 손을 잡으면 세상이 달라'],
      hook: ['너라서 좋아 그냥 너라서', '사랑해 이 말밖엔 없어', '내 맘이 너를 향해 달려가', '오늘도 너만 보여', '{t:이/가} 되어 줄래 내 곁에', '널 부르는 이 노래를 들어줘', '우리 둘이 함께라면 괜찮아', '너 하나면 충분해'],
      bridge: ['언젠가 우리 멀어진대도', '이 순간만은 잊지 않을게', '조금 느려도 괜찮아', '너의 모든 날에 내가 있을게'],
    },
    breakup: {
      verse: ['텅 빈 방에 남은 너의 향기', '아직 지우지 못한 사진 한 장', '네가 앉던 자리 그대로인데', '혼자 걷는 길이 낯설기만 해', '괜찮다는 말이 자꾸 떨려', '마지막 인사가 아직 남아', '식어버린 커피처럼 차가워', '창밖엔 또 계절이 바뀌어', '전화기를 들었다 놓아', '네 목소리가 귓가에 맴돌아', '추억은 아직 여기 있는데', '우리 이야기는 어디로 갔을까'],
      hook: ['안녕 이란 말이 너무 아파', '보내야 하는데 놓지 못해', '그대 없는 밤은 길기만 해', '울지 않을게 오늘만은', '{t:을/를} 잊는 법을 몰라', '돌아와 줄래 한 번만 더', '이젠 정말 안녕인가 봐', '눈물이 멈추질 않아'],
      bridge: ['시간이 흐르면 괜찮아질까', '고마웠다고 말하고 싶어', '언젠가 웃으며 떠올릴게', '행복하길 바랄게 진심으로'],
    },
    dream: {
      verse: ['작은 방 안에 그린 커다란 꿈', '아무도 몰라도 나는 알아', '넘어져도 다시 일어나', '별을 세며 잠들던 그 밤', '가방 속엔 낡은 노트 한 권', '천천히 하지만 멈추지 않아', '높은 벽 앞에서 숨을 골라', '내 발자국이 길이 되겠지', '손끝에 닿을 듯 반짝여', '어제보다 한 걸음 더'],
      hook: ['날아올라 저 하늘 끝까지', '꿈꾸는 대로 이뤄질 거야', '포기하지 마 너는 빛나', '{t:을/를} 향해 달려가', '나는 나를 믿어', '두려움도 날개가 돼', '끝까지 가 보자 우리'],
      bridge: ['길을 잃어도 괜찮아', '별빛이 길을 비춰줄 거야', '오늘의 눈물은 내일의 노래', '다시 한 번 꿈을 꿔'],
    },
    summer: {
      verse: ['파란 바다가 손짓하는 날', '모래 위에 남긴 우리 발자국', '시원한 바람이 머리를 넘겨', '햇살이 쏟아지는 해변에서', '아이스크림처럼 녹는 오후', '파도 소리에 맞춰 춤을 춰', '선글라스 너머 네 미소', '여름밤 불꽃이 터질 때', '끝없는 수평선을 따라', '뜨거운 태양 아래 우리'],
      hook: ['여름이 와 우리 떠나자', '뜨겁게 이 여름을 즐겨', '파도처럼 너에게 갈게', '{t:과/와} 함께 이 계절을', '썸머 썸머 멈추지 마', '오늘 밤은 끝나지 않아'],
      bridge: ['계절이 지나도 기억할게', '태양보다 더 뜨거운 너', '이 순간을 사진에 담아', '내년 여름에도 여기서'],
    },
    night: {
      verse: ['새벽 세 시 잠들지 못한 밤', '창밖엔 도시의 불빛이 흘러', '달빛이 내려앉은 골목길', '조용한 라디오 노래 한 곡', '이불 속에서 너를 떠올려', '별들이 하나둘 켜질 때', '고요한 밤공기를 마셔', '가로등 아래 그림자 둘'],
      hook: ['이 밤이 지나가기 전에', '달빛 아래 너를 불러', '잠 못 드는 밤 너를 그려', '{t:이/가} 빛나는 밤', '오늘 밤은 너와 나', '아침이 오지 않았으면'],
      bridge: ['어둠 속에도 빛은 있어', '새벽이 오면 말할게', '꿈속에서라도 만나', '이 밤의 끝에서 기다려'],
    },
    friendship: {
      verse: ['교실 창가에서 웃던 우리', '말하지 않아도 알 수 있어', '힘든 날엔 어깨를 내줘', '늦은 밤 통화 속 수다', '서로의 비밀을 지켜준 날', '함께라서 두렵지 않았어', '낡은 사진 속 우리 얼굴', '어디에 있어도 같은 하늘'],
      hook: ['우리 언제까지나 함께야', '친구야 고마워 늘 곁에 있어 줘서', '손잡고 끝까지 가자', '{t:과/와} 함께라면 웃을 수 있어', '너는 내 편 나는 네 편', '영원히 이 노래처럼'],
      bridge: ['멀리 떨어져 있어도', '마음은 늘 같은 곳에', '시간이 흘러도 변하지 않아', '다시 만나는 그날까지'],
    },
    hope: {
      verse: ['긴 겨울이 끝나 가고 있어', '흐린 하늘 사이로 빛이 새어', '작은 씨앗이 싹을 틔워', '어제의 상처도 아물 거야', '눈을 감고 숨을 깊게 쉬어', '다시 걸어갈 힘이 생겨', '창문을 열면 새 바람이 와', '오늘은 어제와 다를 거야'],
      hook: ['괜찮아 다 잘 될 거야', '내일은 분명 빛날 거야', '고개를 들어 하늘을 봐', '{t:이/가} 우리를 기다려', '우린 다시 일어설 거야', '희망을 노래해'],
      bridge: ['비가 그치면 무지개가 떠', '혼자가 아니야 우리가 있어', '천천히 해도 괜찮아', '끝은 또 다른 시작이야'],
    },
    rain: {
      verse: ['창문을 두드리는 빗소리', '우산 하나에 두 어깨가 젖어', '젖은 거리 위 번지는 불빛', '빗물에 흘려보낸 이야기', '회색 하늘 아래 걷는 길', '커피 한 잔에 비가 스며', '빗방울이 노래가 되어', '물웅덩이에 비친 내 얼굴'],
      hook: ['비가 내리면 네가 생각나', '이 비가 그치면 웃을게', '빗속을 함께 걸어 줄래', '{t:을/를} 적시는 빗방울', '레인 레인 나를 데려가', '오늘은 그냥 울어도 돼'],
      bridge: ['구름 뒤엔 해가 있어', '빗소리에 마음을 맡겨', '비가 지나간 자리에', '맑은 하늘이 기다려'],
    },
    city: {
      verse: ['바쁜 지하철 속 낯선 얼굴', '높은 빌딩 사이 작은 하늘', '신호등 불빛이 바뀔 때', '퇴근길 버스 창에 기대', '네온사인 아래 흔들리는 밤', '수많은 사람 속 나 혼자', '골목 끝 작은 카페 하나', '도시의 소음이 노래가 돼'],
      hook: ['이 도시는 잠들지 않아', '서울의 밤을 달려', '불빛 속에 너를 찾아', '{t:의} 거리에서 춤을 춰', '시티 라이트 나를 비춰', '오늘도 우린 살아가'],
      bridge: ['가끔은 멈춰 서 봐', '하늘을 올려다봐', '복잡한 길 위에서도', '너의 자리는 여기야'],
    },
    travel: {
      verse: ['기차 창밖으로 스치는 풍경', '지도 없이 떠나는 아침', '낯선 골목의 따뜻한 인사', '배낭 하나에 담은 설렘', '바람이 이끄는 대로 가', '새로운 하늘 아래 서서', '처음 본 바다가 반짝여', '길 위에서 만난 이야기'],
      hook: ['떠나자 어디든 좋아', '바람을 따라 멀리 가자', '이 길의 끝에서 만나', '{t:(으)로} 떠나는 여행', '세상은 넓고 우린 자유로워', '오늘이 가장 빛나는 날'],
      bridge: ['돌아갈 곳이 있어서', '더 멀리 갈 수 있어', '길을 잃어도 괜찮아', '그게 바로 여행이니까'],
    },
    youth: {
      verse: ['교복 입던 그 시절 우리', '운동장 끝에 노을이 질 때', '서툴러도 뜨거웠던 날들', '꿈 하나로 밤을 새웠지', '자전거 타고 달리던 언덕', '이유 없이 웃음이 났어', '스무 살의 우리가 그리워', '모든 게 처음이던 계절'],
      hook: ['청춘은 지금 여기 있어', '뜨겁게 달려 멈추지 마', '우리의 계절은 끝나지 않아', '{t:이/가} 빛나던 그때처럼', '젊음을 노래해 크게', '오늘도 우린 청춘이야'],
      bridge: ['시간은 흘러가도', '마음은 그대로야', '그때의 우리를 기억해', '다시 한 번 달려 보자'],
    },
    winter: {
      verse: ['첫눈이 내리는 거리에서', '하얀 입김 사이로 웃어', '따뜻한 손난로 같은 너', '창밖엔 소복이 쌓인 눈', '크리스마스 불빛 반짝일 때', '목도리를 둘러 줄게', '차가운 바람 속 따뜻한 말', '눈 위에 남긴 발자국 둘'],
      hook: ['하얀 겨울에 너를 만나', '눈이 오면 우리 만나자', '이 겨울이 따뜻한 이유', '{t:과/와} 보내는 겨울밤', '스노우 스노우 내려줘', '너와 함께라 춥지 않아'],
      bridge: ['봄이 오면 녹아 버려도', '이 마음은 그대로야', '눈꽃처럼 반짝이는', '우리의 겨울을 기억해'],
    },
  },
  en: {
    love: {
      verse: ['Morning light across your face', 'I keep your name inside my chest', 'Every little thing you do', 'Feels like summer in my veins', 'Coffee steam and quiet talk', 'We could stay like this all day', 'Holding hands beneath the stars', 'Your laughter fills the empty room', 'I practice words I want to say', 'You turn the grey to gold again', 'Every song reminds me of you', 'The world goes slow when you are near'],
      hook: ['It is you, it is always you', 'I love you more than words can say', 'My heart is running back to you', 'You are all I need tonight', 'Be my {t} and stay with me', 'Hold me close and never let go', 'Together we can light the sky', 'You and me against the world'],
      bridge: ['If the years should pull us apart', 'I will keep this moment in my heart', 'We can take it slow, my love', 'I will be there every day'],
    },
    breakup: {
      verse: ['Your sweater still upon my chair', 'A photo that I cannot burn', 'The empty side of every bed', 'I walk these streets alone again', 'I say I am fine, but my voice breaks', 'The last goodbye is still unsaid', 'Cold coffee and a silent phone', 'The seasons change without you here', 'I dial your number, then I stop', 'Your voice is ringing in my head'],
      hook: ['Goodbye is the hardest word', 'I should let you go but I cannot', 'Nights are long without you here', 'I will not cry tonight', 'I cannot forget your {t}', 'Come back to me just one more time', 'I guess this is the end of us', 'The tears just will not stop'],
      bridge: ['Maybe time will heal the pain', 'I just want to say thank you', 'Someday I will smile at this', 'I hope that you are happy now'],
    },
    dream: {
      verse: ['A tiny room, a giant dream', 'Nobody knows, but I believe', 'I fall but I get up again', 'Counting stars to fall asleep', 'An old notebook in my bag', 'Slow but never standing still', 'In front of walls I catch my breath', 'My footsteps turn into a road', 'So close I almost touch the light', 'One more step than yesterday'],
      hook: ['Fly up to the edge of the sky', 'Every dream is coming true', 'Do not give up, you shine so bright', 'Running to my {t} tonight', 'I believe in who I am', 'Even fear becomes my wings', 'Let us go until the end'],
      bridge: ['If you lose your way, it is fine', 'The starlight will guide you home', 'Tears today, a song tomorrow', 'Dream again, dream once more'],
    },
    summer: {
      verse: ['Blue water calling out my name', 'Footprints written in the sand', 'Cool wind running through my hair', 'Sunlight pouring on the shore', 'Melting like an ice cream sky', 'Dancing to the sound of waves', 'Your smile behind the shades', 'Fireworks burst on summer nights', 'Following the endless line', 'Under the burning summer sun'],
      hook: ['Summer is here, let us run away', 'Burning bright this summer night', 'Like a wave I come to you', 'Me and you and summer {t}', 'Summer, summer, do not stop', 'This night will never end'],
      bridge: ['When the season fades away', 'I will remember you', 'Hotter than the sun, it is you', 'Same place again next year'],
    },
    night: {
      verse: ['Three a.m. and wide awake', 'City lights are flowing by', 'Moonlight falling on the street', 'One old song on the radio', 'Thinking of you under sheets', 'Stars are turning on one by one', 'Breathing in the quiet air', 'Two shadows under a streetlight'],
      hook: ['Before this night is gone', 'Under the moon I call your name', 'Sleepless nights I draw your face', 'The {t} is shining bright tonight', 'Tonight it is you and me', 'I wish the morning never came'],
      bridge: ['Even darkness holds a light', 'When the morning comes I will say', 'Meet me in my dreams tonight', 'Wait for me at the end of the night'],
    },
    friendship: {
      verse: ['Laughing by the classroom window', 'No words and still we understand', 'On heavy days you lend a shoulder', 'Late night calls and silly talk', 'Keeping secrets like a vow', 'Never scared because of you', 'Our faces in an old photo', 'Wherever we are, the same sky'],
      hook: ['We will be together forever', 'Thank you, friend, for being here', 'Hand in hand until the end', 'With my {t} I can smile', 'You are mine and I am yours', 'Forever like this song'],
      bridge: ['Even when we are far apart', 'Our hearts are in the same place', 'Time can change but we will not', 'Until the day we meet again'],
    },
    hope: {
      verse: ['The longest winter fades away', 'Light is breaking through the grey', 'A little seed begins to grow', 'Yesterday will heal in time', 'Close your eyes and breathe it in', 'I have the strength to walk again', 'Open windows, brand new air', 'Today will not be like before'],
      hook: ['It is okay, it will be fine', 'Tomorrow we will shine', 'Lift your head and see the sky', 'Our {t} is waiting there', 'We will rise again', 'Sing a song of hope'],
      bridge: ['After rain there comes a rainbow', 'You are not alone, we are here', 'It is fine to take it slow', 'Every end is a new start'],
    },
    rain: {
      verse: ['Rain is knocking on my window', 'One umbrella, two wet shoulders', 'Lights are bleeding on the street', 'Stories washing down the drain', 'Walking under heavy clouds', 'Rain is falling in my cup', 'Raindrops turning into song', 'My face inside a puddle'],
      hook: ['When it rains I think of you', 'When the rain stops I will smile', 'Will you walk with me in the rain', 'Raindrops falling on my {t}', 'Rain, rain, take me away', 'Tonight it is okay to cry'],
      bridge: ['Behind the clouds there is the sun', 'Let the rain carry my heart', 'Where the storm has passed us by', 'Clear skies are waiting there'],
    },
    city: {
      verse: ['Strangers on a crowded train', 'A little sky between the towers', 'When the traffic lights turn green', 'Leaning on the bus window', 'Neon nights are swaying slow', 'Alone among a million faces', 'A tiny cafe down the lane', 'City noise becomes a song'],
      hook: ['This city never sleeps', 'Running through the city night', 'Searching for you in the lights', 'Dancing down the {t} streets', 'City lights, shine on me', 'Every day we carry on'],
      bridge: ['Sometimes you should stop and breathe', 'Look up at the open sky', 'Even on the busy roads', 'There is a place for you'],
    },
    travel: {
      verse: ['Landscapes passing by the train', 'A morning with no map at all', 'Warm hellos in foreign streets', 'A backpack full of butterflies', 'Going where the wind may blow', 'Standing under a brand new sky', 'The first sea I have ever seen', 'Stories found along the road'],
      hook: ['Let us go, anywhere is fine', 'Follow the wind and fly away', 'Meet me at the end of the road', 'A trip to {t} tonight', 'The world is wide and we are free', 'Today is the brightest day'],
      bridge: ['Because we have a home to return', 'We can travel farther still', 'If we lose our way, it is fine', 'That is what a journey is'],
    },
    youth: {
      verse: ['Back when we wore our school clothes', 'Sunset at the edge of the field', 'Clumsy but our hearts were burning', 'Staying up with just one dream', 'Riding bikes up every hill', 'Laughing for no reason', 'I miss the us at twenty', 'The season when it all began'],
      hook: ['Youth is here and it is now', 'Run so hot and never stop', 'Our season will not end', 'Shining like our {t} days', 'Sing out loud for being young', 'We are young again today'],
      bridge: ['Even as the time goes by', 'The heart stays just the same', 'Remember who we used to be', 'Let us run once more'],
    },
    winter: {
      verse: ['First snow falling on the street', 'Smiling through a frosty breath', 'You are warm like a hand warmer', 'Snow is piling up outside', 'When the Christmas lights are glowing', 'Let me wrap my scarf on you', 'Warm words in the freezing wind', 'Two pairs of footprints in the snow'],
      hook: ['I found you in a white winter', 'When it snows, come meet me there', 'You are why this winter is warm', 'Winter nights with you and {t}', 'Snow, snow, fall on me', 'With you I am never cold'],
      bridge: ['Even if the spring will melt it', 'This feeling will remain', 'Sparkling like a snowflake', 'Remember our winter'],
    },
  },
};

/** Lines for intros and outros (hum and fade). */
export const VOCALISE = {
  ko: ['우 우 우 우', '라 라 라 라 라', '오 오 오 예', '음 음 음 음', '나 나 나 나'],
  en: ['Ooh, ooh, ooh', 'La la la la la', 'Oh oh oh yeah', 'Mm mm mm mm', 'Na na na na'],
};

/** Title patterns: {hook} is a short phrase from the chorus, {t} the topic, {theme} the theme name. */
export const TITLES = {
  ko: ['{t}', '{theme}의 노래', '우리의 {theme}', '{t}, 그리고 너', '오늘의 {theme}', '{theme} 일기', '안녕, {t}', '{t}에게'],
  en: ['{t}', 'Song of {theme}', 'Our {theme}', '{t} and You', '{theme} Tonight', '{theme} Diary', 'Hello, {t}', 'Dear {t}'],
};
