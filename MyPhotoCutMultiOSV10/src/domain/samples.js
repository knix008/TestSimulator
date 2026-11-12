// Sample portraits: famous people of history and portrait paintings, all public domain
// (public/samples/; scripts/fetch-samples.mjs downloads them).
export const SAMPLE_PHOTOS = [
  { id: 'monalisa', file: 'monalisa.jpg', commons: 'Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg', ko: '모나리자', en: 'Mona Lisa' },
  { id: 'pearl', file: 'pearl-earring.jpg', commons: '1665_Girl_with_a_Pearl_Earring.jpg', ko: '진주 귀걸이를 한 소녀', en: 'Girl with a Pearl Earring' },
  { id: 'vangogh', file: 'van-gogh.jpg', commons: 'Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg', ko: '반 고흐 자화상', en: 'Van Gogh self-portrait' },
  { id: 'einstein', file: 'einstein.jpg', commons: 'Albert_Einstein_Head.jpg', ko: '아인슈타인', en: 'Albert Einstein' },
  { id: 'curie', file: 'curie.jpg', commons: 'Marie_Curie_c._1920s.jpg', ko: '마리 퀴리', en: 'Marie Curie' },
  { id: 'lincoln', file: 'lincoln.jpg', commons: 'Abraham_Lincoln_O-77_matte_collodion_print.jpg', ko: '링컨', en: 'Abraham Lincoln' },
  { id: 'douglass', file: 'douglass.jpg', commons: 'Frederick_Douglass_(circa_1879).jpg', ko: '프레더릭 더글러스', en: 'Frederick Douglass' },
  { id: 'beethoven', file: 'beethoven.jpg', commons: "Joseph_Karl_Stieler's_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg", ko: '베토벤', en: 'Ludwig van Beethoven' },
  { id: 'mozart', file: 'mozart.jpg', commons: 'Wolfgang-amadeus-mozart_1.jpg', ko: '모차르트', en: 'Wolfgang Amadeus Mozart' },
  { id: 'ermine', file: 'lady-with-an-ermine.jpg', commons: 'Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg', ko: '흰 담비를 안은 여인', en: 'Lady with an Ermine' },
  { id: 'rembrandt', file: 'rembrandt.jpg', commons: 'Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg', ko: '렘브란트 자화상', en: 'Rembrandt self-portrait' },
  { id: 'durer', file: 'durer.jpg', commons: 'Albrecht Dürer - 1500 self-portrait (High resolution and detail).jpg', ko: '뒤러 자화상', en: 'Dürer self-portrait' },
  { id: 'scream', file: 'scream.jpg', commons: 'Edvard_Munch_-_The_Scream_-_Google_Art_Project.jpg', ko: '절규', en: 'The Scream' },
  { id: 'milkmaid', file: 'milkmaid.jpg', commons: 'Johannes Vermeer - Het melkmeisje - Google Art Project.jpg', ko: '우유를 따르는 여인', en: 'The Milkmaid' },
  { id: 'whistler', file: 'whistler-mother.jpg', commons: 'Whistlers Mother high res.jpg', ko: '휘슬러의 어머니', en: "Whistler's Mother" },
  { id: 'blueboy', file: 'blue-boy.jpg', commons: 'Thomas Gainsborough - The Blue Boy (c. 1770).jpg', ko: '푸른 소년', en: 'The Blue Boy' },
  { id: 'napoleon', file: 'napoleon.jpg', commons: 'Napoleon at the Great St. Bernard - Jacques-Louis David - Google Cultural Institute.jpg', ko: '알프스를 넘는 나폴레옹', en: 'Napoleon Crossing the Alps' },
  { id: 'castiglione', file: 'castiglione.jpg', commons: 'Baldassare_Castiglione,_by_Raffaello_Sanzio,_from_C2RMF_retouched.jpg', ko: '카스틸리오네의 초상', en: 'Portrait of Baldassare Castiglione' },
  { id: 'cavalier', file: 'laughing-cavalier.jpg', commons: 'Frans Hals – The Laughing Cavalier.jpg', ko: '웃는 기사', en: 'The Laughing Cavalier' },
  { id: 'simonetta', file: 'simonetta.jpg', commons: 'Sandro Botticelli - Idealized Portrait of a Lady (Portrait of Simonetta Vespucci as Nymph) - Google Art Project.jpg', ko: '시모네타 베스푸치', en: 'Simonetta Vespucci' },
];

export const sampleById = (id) => SAMPLE_PHOTOS.find((s) => s.id === id) ?? null;
/** URL of a sample relative to the app page. */
export const sampleUrl = (sample) => `samples/${sample.file}`;
