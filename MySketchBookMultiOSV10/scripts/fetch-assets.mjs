// npm run assets — downloads the CC0 asset library from Poly Haven into library/:
//
//   models/<id>.glb + models/manifest.json + models/thumbs/<id>.webp   interior props (1k glTF packed into one GLB)
//   textures/<set>/{diff,nor,rough,ao}.jpg + textures/index.json        material preset textures (src/engine/materials.js `textures`)
//   hdri/<id>.hdr (+ <id>_2k.hdr) + hdri/thumbs/<id>.webp                environments (src/library/environments.js)
//   LICENSES.md                                                           CC0 statement + every asset with its URL and authors
//
// Polite: at most 4 downloads at a time, retries with back-off, resumable (raw downloads are cached in
// node_modules/.cache/polyhaven and skipped when present with the right size; a model whose GLB already
// exists is not rebuilt unless --force).
//
//   npm run assets                      everything
//   npm run assets -- --only models     models | textures | hdri (comma separated)
//   npm run assets -- --ids ArmChair_01,sofa_02 --force
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { MATERIAL_PRESETS } from '../src/engine/materials.js';
import { ENVIRONMENTS } from '../src/library/environments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'library');
const CACHE = path.join(root, 'node_modules', '.cache', 'polyhaven');
const API = 'https://api.polyhaven.com';
const UA = 'MySketchBook-asset-fetcher/1.0 (+https://github.com/knix008)';
const MAX_TEX = 1024;
// 3D performance budget per model (triangles as drawn, GLB bytes): a heavier model is refused, not shipped —
// pick one variant (`pick`) or leave it out.
const MAX_TRIS = 300000;
const MAX_BYTES = 15 * 1048576;

const args = process.argv.slice(2);
const argList = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : new Set(args[i + 1].split(',').map((s) => s.trim()).filter(Boolean)); };
const ONLY = argList('only');
const IDS = argList('ids');
const FORCE = args.includes('--force');

// ───────────────────────── curated models
// [Poly Haven id, our category (src/library/categories.js), Korean name, placement]
// placement: floor (default) | surface (sits on a table/shelf) | wall | ceiling
const MODELS = [
  // living room
  ['ArmChair_01', 'living', '빈티지 암체어'],
  ['GreenChair_01', 'living', '그린 암체어'],
  ['Rockingchair_01', 'living', '흔들의자'],
  ['mid_century_lounge_chair', 'living', '미드센추리 라운지 체어'],
  ['modern_arm_chair_01', 'living', '모던 암체어'],
  ['Sofa_01', 'living', '패브릭 소파'],
  ['sofa_02', 'living', '3인 소파'],
  ['sofa_03', 'living', '가죽 소파'],
  ['chinese_sofa', 'living', '중국풍 소파'],
  ['Ottoman_01', 'living', '오토만'],
  ['CoffeeTable_01', 'living', '커피 테이블'],
  ['coffee_table_round_01', 'living', '원형 커피 테이블'],
  ['modern_coffee_table_01', 'living', '모던 커피 테이블 01'],
  ['modern_coffee_table_02', 'living', '모던 커피 테이블 02'],
  ['WoodenTable_01', 'living', '나무 낮은 테이블'],
  ['side_table_01', 'living', '사이드 테이블'],
  ['side_table_tall_01', 'living', '높은 사이드 테이블'],
  ['small_wooden_table_01', 'living', '작은 나무 테이블'],
  ['ClassicConsole_01', 'living', '클래식 콘솔 테이블'],
  ['chinese_screen_panels', 'living', '병풍 (칸막이)'],
  ['vintage_grandfather_clock_01', 'living', '괘종시계'],
  ['scandinavian_masonry_heater', 'living', '북유럽 벽난로'],
  // dining
  ['dining_chair_02', 'dining', '다이닝 체어'],
  ['WoodenChair_01', 'dining', '나무 의자'],
  ['painted_wooden_chair_01', 'dining', '도장 나무 의자 01'],
  ['gallinera_chair', 'dining', '라탄 의자'],
  ['gallinera_table', 'dining', '라탄 식탁'],
  ['dining_table', 'dining', '나무 식탁'],
  ['round_wooden_table_01', 'dining', '원형 나무 식탁'],
  ['bar_chair_round_01', 'dining', '원형 바 체어'],
  ['metal_stool_01', 'dining', '금속 스툴'],
  ['steel_frame_shelves_02', 'storage', '철제 선반'],
  ['wooden_stool_01', 'dining', '나무 스툴'],
  ['CoffeeCart_01', 'dining', '커피 카트'],
  // bedroom
  ['GothicBed_01', 'bedroom', '고딕 침대'],
  ['vintage_day_bed', 'bedroom', '빈티지 데이베드'],
  ['ClassicNightstand_01', 'bedroom', '클래식 협탁'],
  ['painted_wooden_nightstand', 'bedroom', '도장 나무 협탁'],
  ['GothicCommode_01', 'bedroom', '고딕 서랍장'],
  ['vintage_wooden_drawer_01', 'bedroom', '빈티지 나무 서랍장'],
  ['alarm_clock_01', 'bedroom', '자명종 시계', 'surface'],
  // storage
  ['GothicCabinet_01', 'storage', '고딕 장식장'],
  ['chinese_cabinet', 'storage', '중국풍 장식장'],
  ['modern_wooden_cabinet', 'storage', '모던 나무 수납장'],
  ['painted_wooden_cabinet', 'storage', '도장 나무 수납장'],
  ['vintage_cabinet_01', 'storage', '빈티지 진열장'],
  ['drawer_cabinet', 'storage', '서랍 수납장'],
  ['WoodenTable_03', 'storage', '나무 사이드보드'],
  ['wooden_bookshelf_worn', 'storage', '나무 책장'],
  ['wooden_display_shelves_01', 'storage', '나무 진열 선반'],
  ['wicker_basket_01', 'storage', '라탄 바구니 01', 'surface'],
  ['wicker_basket_02', 'storage', '라탄 바구니 02', 'surface'],
  ['cardboard_box_01', 'storage', '종이 상자'],
  // office & kids
  ['metal_office_desk', 'office', '철제 사무용 책상'],
  ['classic_laptop', 'office', '노트북', 'surface'],
  ['binder_notebook', 'office', '바인더 노트', 'surface'],
  ['stationery_supplies', 'office', '문구 세트', 'surface'],
  ['book_encyclopedia_set_01', 'office', '백과사전 세트', 'surface'],
  ['SchoolDesk_01', 'kids', '학생 책상'],
  ['SchoolChair_01', 'kids', '학생 의자'],
  ['standing_chalkboard_01', 'kids', '스탠드 칠판'],
  ['rubber_duck_toy', 'kids', '고무 오리 장난감', 'surface'],
  // lighting
  ['Chandelier_01', 'lighting', '샹들리에 01', 'ceiling'],
  ['Chandelier_02', 'lighting', '샹들리에 02', 'ceiling'],
  ['Chandelier_03', 'lighting', '샹들리에 03', 'ceiling'],
  ['chinese_chandelier', 'lighting', '중국풍 등', 'ceiling'],
  ['lantern_chandelier_01', 'lighting', '랜턴 샹들리에', 'ceiling'],
  ['modern_ceiling_lamp_01', 'lighting', '모던 펜던트 조명', 'ceiling'],
  ['caged_hanging_light', 'lighting', '케이지 펜던트 조명', 'ceiling'],
  ['hanging_industrial_lamp', 'lighting', '인더스트리얼 펜던트', 'ceiling'],
  ['desk_lamp_arm_01', 'lighting', '암 데스크 램프', 'surface'],
  ['industrial_pipe_lamp', 'lighting', '파이프 데스크 램프', 'surface'],
  ['industrial_wall_lamp', 'lighting', '인더스트리얼 벽등', 'wall'],
  ['industrial_wall_sconce', 'lighting', '벽 브래킷 조명', 'wall'],
  ['brass_candleholders', 'lighting', '황동 촛대', 'surface', { pick: ['brass_candleholder_03'] }],
  ['wooden_lantern_01', 'lighting', '나무 랜턴', 'surface'],
  ['vintage_oil_lamp', 'lighting', '빈티지 오일 램프', 'surface'],
  // decor
  ['throw_pillows_01', 'decor', '쿠션 세트', 'surface'],
  ['standing_picture_frame_01', 'decor', '탁상 액자 01', 'surface'],
  ['standing_picture_frame_02', 'decor', '탁상 액자 02', 'surface'],
  ['fancy_picture_frame_01', 'decor', '장식 액자', 'wall'],
  ['hanging_picture_frame_01', 'decor', '벽 액자 01', 'wall'],
  ['hanging_picture_frame_02', 'decor', '벽 액자 02', 'wall'],
  ['ornate_mirror_01', 'decor', '장식 거울', 'wall'],
  ['wall_clock', 'decor', '벽시계', 'wall'],
  ['mantel_clock_01', 'decor', '탁상 시계', 'surface'],
  ['antique_ceramic_vase_01', 'decor', '앤티크 도자기 화병', 'surface'],
  ['ceramic_vase_01', 'decor', '도자기 화병 01', 'surface'],
  ['ceramic_vase_02', 'decor', '도자기 화병 02', 'surface'],
  ['ceramic_vase_03', 'decor', '도자기 화병 03', 'surface'],
  ['brass_vase_01', 'decor', '황동 화병 01', 'surface'],
  ['brass_vase_02', 'decor', '황동 화병 02', 'surface'],
  ['marble_bust_01', 'decor', '대리석 흉상', 'surface'],
  ['carved_wooden_elephant', 'decor', '나무 코끼리 조각', 'surface'],
  ['concrete_cat_statue', 'decor', '고양이 조각상', 'surface'],
  ['chess_set', 'decor', '체스 세트', 'surface'],
  ['Ukulele_01', 'decor', '우쿨렐레', 'surface'],
  // kitchen
  ['tea_set_01', 'kitchen', '티 세트', 'surface'],
  ['wooden_bowl_01', 'kitchen', '나무 그릇 01', 'surface'],
  ['carved_wooden_plate', 'kitchen', '나무 접시', 'surface'],
  ['wooden_cutting_board', 'kitchen', '나무 도마', 'surface'],
  ['jug_01', 'kitchen', '도자기 저그', 'surface'],
  ['brass_pot_01', 'kitchen', '황동 냄비', 'surface'],
  ['pot_enamel_01', 'kitchen', '법랑 냄비', 'surface'],
  ['wine_bottles_01', 'kitchen', '와인병 세트', 'surface'],
  ['bananas', 'kitchen', '바나나', 'surface', { pick: ['bananas_bunch'] }],
  ['food_apple_01', 'kitchen', '사과', 'surface'],
  // appliances
  ['vintage_microwave', 'appliances', '전자레인지', 'surface'],
  ['vintage_electric_kettle', 'appliances', '전기 주전자', 'surface'],
  ['Television_01', 'appliances', '브라운관 텔레비전', 'surface'],
  ['television_02', 'appliances', '레트로 텔레비전', 'surface'],
  ['ceiling_fan', 'appliances', '실링 팬', 'ceiling'],
  // plants
  ['potted_plant_01', 'plants', '화분 식물 01'],
  ['potted_plant_02', 'plants', '화분 식물 02'],
  ['potted_plant_04', 'plants', '화분 식물 03', 'surface'],
  ['anthurium_botany_01', 'plants', '안스리움 화분', 'surface', { pick: ['anthurium_botany_01_b'] }],
  ['calathea_orbifolia_01', 'plants', '칼라테아 화분'],
  ['pachira_aquatica_01', 'plants', '파키라 (머니트리)', 'floor', { pick: ['_bark_d', '_leaves_d'] }],
  ['planter_pot_clay', 'plants', '토분', 'surface'],
  ['planter_box_01', 'plants', '나무 플랜터 박스'],
  // outdoor
  ['outdoor_table_chair_set_01', 'outdoor', '야외 테이블 세트'],
  ['painted_wooden_bench', 'outdoor', '나무 벤치'],

  // ── second wave: every Poly Haven model that plausibly belongs in a home, a garden/balcony or a garage.
  // Tried and left out: wooden_candlestick (213k triangles in the 1k glTF for a 22 cm candlestick),
  // decorative_book_set_01 (no glTF download), office_notepads / postcard_set_01 (loose paper sheets spread over 1 m),
  // shrub_04 / crystalline_iceplant (sparse seedlings and a flat yellow clump: poor in a room),
  // wooden_table_02 (its catalog id asset-wooden-table-02 would clash with WoodenTable_02).
  // Left out on purpose: weapons, industrial machinery and infrastructure, ships and vehicles, rocks/cliffs,
  // landscape trees and ground cover, buildings/facades, creatures, medical/safety gear, smoking items.
  // living
  ['chinese_armchair', 'living', '중국풍 암체어'],
  ['painted_wooden_sofa', 'living', '도장 나무 소파'],
  ['chinese_tea_table', 'living', '중국풍 찻상', 'floor', { tags: ['차탁', '좌식'] }],
  ['gothic_coffee_table', 'living', '고딕 커피 테이블'],
  ['industrial_coffee_table', 'living', '인더스트리얼 커피 테이블'],
  ['chinese_console_table', 'living', '중국풍 콘솔 테이블'],
  ['WoodenTable_02', 'living', '나무 보조 테이블'],
  ['wooden_stool_02', 'living', '작은 나무 발받침', 'floor', { tags: ['스툴', '발판'] }],
  ['spinning_wheel_01', 'living', '앤티크 물레', 'floor', { tags: ['장식', '빈티지'] }],
  // dining
  ['painted_wooden_chair_02', 'dining', '도장 나무 의자 02'],
  ['painted_wooden_table', 'dining', '도장 나무 식탁'],
  ['round_wooden_table_02', 'dining', '원형 나무 식탁 02'],
  ['chinese_stool', 'dining', '중국풍 스툴'],
  ['folding_wooden_stool', 'dining', '접이식 나무 스툴'],
  ['metal_stool_02', 'dining', '금속 스툴 02'],
  ['metal_stool_03', 'dining', '금속 바 스툴', 'floor', { tags: ['바', '카운터'] }],
  ['painted_wooden_stool', 'dining', '도장 나무 스툴'],
  ['brass_goblets', 'dining', '황동 고블릿 잔', 'surface', { tags: ['술잔', '컵'] }],
  ['carrot_cake', 'dining', '당근 케이크', 'surface', { tags: ['디저트', '음식'] }],
  ['strawberry_chocolate_cake', 'dining', '딸기 초콜릿 케이크', 'surface', { tags: ['디저트', '음식'] }],
  ['croissant', 'dining', '크루아상', 'surface', { tags: ['빵', '음식'] }],
  ['hamburger_buns', 'dining', '햄버거 빵', 'surface', { tags: ['빵', '음식'] }],
  // bedroom
  ['old_bed_frame', 'bedroom', '철제 침대 프레임', 'floor', { tags: ['침대'] }],
  // Poly Haven lists it at 4.49 × 2.02 m (0.9 m drawers): about 2.4× too big for a three-drawer altar chest.
  ['chinese_commode', 'bedroom', '중국풍 서랍 콘솔', 'floor', { height: 0.86, tags: ['서랍장'] }],
  ['vintage_suitcase', 'bedroom', '빈티지 여행 가방', 'floor', { pick: ['vintage_suitcase_01'], tags: ['트렁크', '가방'] }],
  ['digital_wrist_watch', 'bedroom', '전자 손목시계', 'surface'],
  ['round_spectacles', 'bedroom', '둥근 안경', 'surface'],
  // bathroom (cleaning and first aid)
  ['medical_box', 'bathroom', '구급 상자', 'surface', { tags: ['약상자'] }],
  ['all_purpose_cleaner', 'bathroom', '다목적 세정제', 'surface', { tags: ['청소', '세제'] }],
  ['bleach_bottle', 'bathroom', '표백제 병', 'surface', { tags: ['청소', '세제', '락스'] }],
  ['drain_cleaner', 'bathroom', '배수구 세정제', 'surface', { tags: ['청소', '세제'] }],
  ['multi_cleaner_bottle', 'bathroom', '스프레이 세정제', 'surface', { tags: ['청소', '세제'] }],
  ['plunger', 'bathroom', '변기 뚫어뻥', 'floor', { tags: ['화장실', '청소'] }],
  // storage (shelves, boxes, garage and workshop)
  ['painted_wooden_cabinet_02', 'storage', '도장 나무 찬장'],
  ['Shelf_01', 'storage', '나무 선반장'],
  ['painted_wooden_shelves', 'storage', '도장 나무 선반'],
  ['steel_frame_shelves_01', 'storage', '철제 선반 02'],
  ['steel_frame_shelves_03', 'storage', '대형 철제 선반'],
  ['worn_metal_rack', 'storage', '낡은 금속 랙'],
  ['wooden_crate_01', 'storage', '나무 상자 01'],
  ['wooden_crate_02', 'storage', '나무 상자 02'],
  ['plastic_crate_01', 'storage', '플라스틱 상자 01'],
  ['plastic_crate_02', 'storage', '플라스틱 상자 02'],
  ['plastic_crate_03', 'storage', '플라스틱 상자 03'],
  ['plastic_container', 'storage', '플라스틱 수납함'],
  ['metal_tool_chest', 'storage', '금속 공구 서랍장', 'floor', { tags: ['공구', '차고', '작업실'] }],
  ['metal_toolbox', 'storage', '금속 공구함', 'floor', { tags: ['공구', '차고', '작업실'] }],
  ['tool_cart', 'storage', '공구 카트', 'floor', { tags: ['공구', '차고', '작업실'] }],
  ['hand_truck', 'storage', '손수레 (핸드 트럭)', 'floor', { tags: ['차고', '운반'] }],
  ['ladder_sectioned_01', 'storage', '알루미늄 사다리', 'floor', { tags: ['차고'] }],
  ['wooden_ladder', 'storage', '나무 사다리 01'],
  ['wooden_ladder_02', 'storage', '나무 사다리 02'],
  ['Drill_01', 'storage', '전동 드릴', 'surface', { tags: ['공구', '작업실'] }],
  ['vintage_hand_drill', 'storage', '빈티지 핸드 드릴', 'surface', { tags: ['공구', '작업실'] }],
  ['bench_vice_01', 'storage', '작업대 바이스', 'surface', { tags: ['공구', '작업실'] }],
  ['hand_plane_no4', 'storage', '대패', 'surface', { tags: ['공구', '목공'] }],
  ['handsaw_wood', 'storage', '나무 톱', 'surface', { tags: ['공구', '목공'] }],
  ['wooden_hammer_01', 'storage', '나무 망치', 'surface', { tags: ['공구'] }],
  ['cross_pein_hammer', 'storage', '쇠망치', 'surface', { tags: ['공구'] }],
  ['screwdrivers_02', 'storage', '드라이버 세트', 'surface', { tags: ['공구'] }],
  ['adjustable_wrench', 'storage', '몽키 스패너', 'surface', { tags: ['공구'] }],
  ['pliers', 'storage', '펜치', 'surface', { tags: ['공구'] }],
  ['measuring_tape_01', 'storage', '줄자', 'surface', { tags: ['공구'] }],
  ['spray_paint_bottles', 'storage', '스프레이 페인트', 'surface', { drop: ['dirty'], tags: ['작업실'] }],
  ['small_oil_can_01', 'storage', '작은 기름통', 'surface', { tags: ['차고'] }],
  ['oil_tin', 'storage', '오일 캔', 'surface', { tags: ['차고'] }],
  ['metal_jerrycan', 'storage', '금속 연료통', 'floor', { tags: ['차고'] }],
  ['multi_cleaner_5_litre', 'storage', '대용량 세제 통', 'floor', { tags: ['청소', '다용도실'] }],
  ['dustpan', 'storage', '쓰레받기', 'floor', { tags: ['청소'] }],
  ['plastic_broom', 'storage', '플라스틱 빗자루', 'floor', { tags: ['청소'] }],
  ['wooden_broom', 'storage', '나무 빗자루', 'floor', { tags: ['청소'] }],
  ['korean_fire_extinguisher_01', 'storage', '소화기', 'floor', { tags: ['안전'] }],
  ['tire_pump', 'storage', '자전거 펌프', 'floor', { tags: ['차고', '자전거'] }],
  // office
  ['clipboard', 'office', '클립보드', 'surface'],
  ['vintage_stapler', 'office', '빈티지 스테이플러', 'surface', { tags: ['문구'] }],
  ['magnifying_glass_01', 'office', '돋보기', 'surface'],
  ['vintage_microscope', 'office', '빈티지 현미경', 'surface'],
  ['binoculars', 'office', '쌍안경', 'surface'],
  ['vintage_binocular', 'office', '빈티지 쌍안경', 'surface'],
  ['seadogs_compass', 'office', '항해 나침반', 'surface'],
  // kids (toys and games)
  ['treasure_chest', 'kids', '보물 상자', 'floor', { tags: ['장난감', '상자'] }],
  ['gamepad', 'kids', '게임 패드', 'surface', { tags: ['게임'] }],
  ['gaming_console', 'kids', '게임기', 'surface', { tags: ['게임'] }],
  ['dartboard', 'kids', '다트판', 'wall', { tags: ['게임', '놀이'] }],
  ['sungka_board', 'kids', '숭카 보드게임', 'surface', { tags: ['게임', '놀이'] }],
  ['football', 'kids', '축구공', 'floor', { tags: ['공', '운동'] }],
  ['american_football', 'kids', '미식축구공', 'floor', { tags: ['공', '운동'] }],
  ['baseball_01', 'kids', '야구공', 'surface', { tags: ['공', '운동'] }],
  ['baseball_bat', 'kids', '야구 방망이', 'floor', { tags: ['운동'] }],
  // lighting
  ['industrial_caged_sconce', 'lighting', '케이지 벽등', 'wall', { pick: ['industrial_caged_sconce_a'] }],
  ['pull_chain_light_socket', 'lighting', '풀체인 전구 소켓', 'ceiling', { tags: ['전구'] }],
  ['mounted_fluorescent_lights', 'lighting', '형광등', 'ceiling', { tags: ['천장등'] }],
  ['Lantern_01', 'lighting', '빈티지 랜턴', 'surface'],
  ['brass_diya_lantern', 'lighting', '황동 디야 등', 'ceiling', { tags: ['랜턴'] }],
  ['vintage_flashlight', 'lighting', '빈티지 손전등', 'surface'],
  // decor
  ['ceramic_vase_04', 'decor', '도자기 화병 04', 'surface'],
  ['brass_vase_03', 'decor', '황동 화병 03', 'surface'],
  ['brass_vase_04', 'decor', '황동 화병 04', 'surface'],
  ['fancy_picture_frame_02', 'decor', '장식 액자 02', 'wall'],
  ['hanging_picture_frame_03', 'decor', '벽 액자 03', 'wall'],
  ['vintage_telephone_wall_clock', 'decor', '전화기 모양 벽시계', 'wall'],
  ['lambis_shell', 'decor', '소라 껍데기', 'surface', { tags: ['조개'] }],
  ['bronze_ray_statue', 'decor', '청동 가오리 조각', 'floor', { tags: ['조각상'] }],
  ['bronze_shark_statue', 'decor', '청동 상어 조각', 'surface', { tags: ['조각상'] }],
  ['bronze_whale_statue', 'decor', '청동 고래 조각', 'floor', { tags: ['조각상'] }],
  ['bull_head', 'decor', '황소 머리 조각', 'surface', { tags: ['조각상'] }],
  ['horse_head', 'decor', '말 머리 조각', 'surface', { tags: ['조각상'] }],
  ['lion_head', 'decor', '사자 머리 조각', 'surface', { tags: ['조각상'] }],
  ['horse_statue_01', 'decor', '말 조각상', 'surface', { tags: ['조각상'] }],
  ['pocket_watch', 'decor', '회중시계 01', 'surface'],
  ['vintage_pocket_watch', 'decor', '회중시계 02', 'surface'],
  ['fishermans_hat', 'decor', '어부 모자', 'surface'],
  ['wine_barrel_01', 'decor', '와인 오크통', 'floor', { tags: ['술통'] }],
  ['lifebuoy', 'decor', '구명 튜브 장식', 'wall', { tags: ['해양'] }],
  // kitchen
  ['brass_pan_01', 'kitchen', '황동 프라이팬', 'surface'],
  ['brass_pot_02', 'kitchen', '황동 냄비 02', 'surface'],
  ['ceramic_pot', 'kitchen', '도자기 항아리', 'floor', { tags: ['옹기', '독'] }],
  ['metal_jug', 'kitchen', '금속 저그', 'surface', { tags: ['우유통', '물통'] }],
  ['wooden_bowl_02', 'kitchen', '나무 그릇 02', 'surface'],
  ['wooden_spoon', 'kitchen', '나무 주걱', 'surface', { tags: ['숟가락'] }],
  ['plastic_thermos', 'kitchen', '보온병', 'surface'],
  ['plastic_bottle_gallon', 'kitchen', '플라스틱 물통', 'surface'],
  ['CheeseBox_01', 'kitchen', '치즈 상자', 'surface', { tags: ['음식'] }],
  ['long_life_food', 'kitchen', '보존 식품', 'surface', { tags: ['음식', '통조림'] }],
  ['russian_food_cans_01', 'kitchen', '통조림', 'surface', { tags: ['음식'] }],
  ['food_avocado_01', 'kitchen', '아보카도', 'surface', { tags: ['과일', '음식'] }],
  ['food_kiwi_01', 'kitchen', '키위', 'surface', { tags: ['과일', '음식'] }],
  ['food_lime_01', 'kitchen', '라임', 'surface', { tags: ['과일', '음식'] }],
  ['food_lychee_01', 'kitchen', '리치', 'surface', { tags: ['과일', '음식'] }],
  ['food_pears_asian_01', 'kitchen', '배', 'surface', { tags: ['과일', '음식'] }],
  ['food_pomegranate_01', 'kitchen', '석류', 'surface', { tags: ['과일', '음식'] }],
  ['lemon', 'kitchen', '레몬', 'surface', { tags: ['과일', '음식'] }],
  ['food_ginger_01', 'kitchen', '생강', 'surface', { tags: ['채소', '음식'] }],
  ['sweet_potato', 'kitchen', '고구마', 'surface', { tags: ['채소', '음식'] }],
  ['yellow_onion', 'kitchen', '양파', 'surface', { tags: ['채소', '음식'] }],
  // appliances & electronics
  ['electric_stove', 'appliances', '전기 레인지', 'floor', { tags: ['오븐', '주방'] }],
  ['boombox', 'appliances', '붐박스 카세트', 'surface', { tags: ['오디오', '라디오'] }],
  ['cassette_player', 'appliances', '카세트 플레이어', 'surface', { tags: ['오디오'] }],
  ['portable_cassette_player', 'appliances', '휴대용 카세트', 'surface', { tags: ['오디오', '워크맨'] }],
  ['vintage_radio_transceiver', 'appliances', '빈티지 무전기 라디오', 'surface', { tags: ['오디오', '라디오'] }],
  ['Camera_01', 'appliances', '필름 카메라', 'surface'],
  ['vintage_video_camera', 'appliances', '빈티지 캠코더', 'surface', { tags: ['카메라'] }],
  ['filmstrip_projector_8mm', 'appliances', '8mm 영사기', 'surface', { tags: ['프로젝터'] }],
  ['projector_screen', 'appliances', '프로젝터 스크린', 'floor', { tags: ['홈시어터'] }],
  // plants (garden and balcony)
  ['planter_box_02', 'plants', '나무 플랜터 박스 02'],
  ['planter_box_03', 'plants', '나무 플랜터 박스 03'],
  ['seeding_tray_01', 'plants', '모종 트레이', 'surface', { tags: ['원예'] }],
  ['fern_02', 'plants', '고사리', 'floor', { pick: ['fern_02_b'], tags: ['양치식물'] }],
  ['shrub_03', 'plants', '관목 01', 'floor', { pick: ['shrub_03_a'] }],
  ['shrub_sorrel_01', 'plants', '괭이밥 덤불', 'floor', { tags: ['풀'] }],
  ['flower_empodium', 'plants', '엠포디움 꽃', 'floor', { pick: ['_a_'], tags: ['꽃'] }],
  ['flower_gazania', 'plants', '가자니아 꽃', 'floor', { pick: ['_h_'], tags: ['꽃'] }],
  ['flower_ursinia', 'plants', '우르시니아 꽃', 'floor', { pick: ['_a_'], tags: ['꽃'] }],
  ['flower_stinkkruid', 'plants', '들꽃 덤불', 'floor', { pick: ['_a_'], tags: ['꽃'] }],
  ['periwinkle_plant', 'plants', '빈카 (일일초)', 'floor', { pick: ['_01_'], tags: ['꽃'] }],
  ['dandelion_01', 'plants', '민들레', 'floor', { pick: ['_a_'], tags: ['꽃'] }],
  ['cheiridopsis_succulent', 'plants', '다육식물 (케이리돕시스)', 'floor', { pick: ['_h_'], tags: ['다육식물'] }],
  ['wild_rooibos_bush', 'plants', '루이보스 덤불', 'floor', { pick: ['_bush_a'], tags: ['관목'] }],
  ['quiver_tree_02', 'plants', '알로에 나무 (퀴버 트리)', 'floor', { tags: ['나무', '다육식물'] }],
  // outdoor (garden, balcony, yard)
  ['wooden_picnic_table', 'outdoor', '나무 피크닉 테이블'],
  ['plastic_monobloc_chair_01', 'outdoor', '플라스틱 야외 의자'],
  ['stone_fire_pit', 'outdoor', '돌 화로', 'floor', { tags: ['캠핑', '불멍'] }],
  ['barrel_stove', 'outdoor', '드럼통 난로', 'floor', { tags: ['난로'] }],
  ['propane_tank', 'outdoor', '프로판 가스통', 'floor', { tags: ['바비큐'] }],
  ['street_lamp_01', 'outdoor', '정원 가로등', 'floor', { tags: ['조명'] }],
  ['street_lamp_02', 'outdoor', '벽 가로등', 'wall', { tags: ['조명'] }],
  ['security_light', 'outdoor', '센서 투광등', 'wall', { tags: ['조명'] }],
  ['security_camera_01', 'outdoor', '보안 카메라', 'wall', { tags: ['CCTV'] }],
  ['exterior_aircon_unit', 'outdoor', '에어컨 실외기', 'floor', { drop: ['rusted'], tags: ['베란다', '가전'] }],
  ['metal_trash_can', 'outdoor', '금속 쓰레기통', 'floor', { drop: ['rust'] }],
  ['garden_gnome', 'outdoor', '정원 난쟁이 인형', 'floor', { tags: ['장식'] }],
  ['gothic_statue', 'outdoor', '고딕 석상', 'floor', { tags: ['조각상'] }],
  ['wooden_bucket_01', 'outdoor', '나무 양동이 01'],
  ['wooden_bucket_02', 'outdoor', '나무 양동이 02'],
  ['watering_can_metal_01', 'outdoor', '금속 물뿌리개', 'floor', { tags: ['원예', '화분'] }],
  ['garden_sprinkler_01', 'outdoor', '정원 스프링클러', 'floor', { tags: ['원예'] }],
  ['garden_hose_wall_mounted_01', 'outdoor', '벽걸이 정원 호스', 'wall', { tags: ['원예'] }],
  ['trowel_01', 'outdoor', '모종삽', 'floor', { tags: ['원예', '공구'] }],
  ['rusted_spade_01', 'outdoor', '삽', 'floor', { tags: ['원예', '공구'] }],
  ['garden_gloves_01', 'outdoor', '원예 장갑', 'surface', { tags: ['원예'] }],
  ['rubber_boots', 'outdoor', '고무 장화', 'floor', { pick: ['rubber_boots_l', 'rubber_boots_r'], tags: ['신발'] }],
  ['compost_bag_02', 'outdoor', '퇴비 포대', 'floor', { tags: ['원예'] }],
  ['compost_bags', 'outdoor', '쌓인 퇴비 포대', 'floor', { pick: ['floorstacked'], tags: ['원예'] }],
];

const CATEGORY_KO = {
  living: ['거실', '가구'], dining: ['식당', '주방', '가구'], bedroom: ['침실', '가구'], storage: ['수납', '가구'], office: ['서재', '사무'], kids: ['아이 방'],
  lighting: ['조명', '램프'], decor: ['장식', '소품', '인테리어'], kitchen: ['주방', '부엌'], appliances: ['가전'], plants: ['식물', '화분'], outdoor: ['실외', '정원'],
  bathroom: ['욕실', '화장실'],
};

// The app derives catalog ids by kebab-casing (src/library/assets.js): two ids that differ only in case or
// separators would collide, so the list is checked up front.
{
  const seen = new Map();
  for (const [id] of MODELS) {
    const key = id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
    if (seen.has(key)) throw new Error(`MODELS: ${id} and ${seen.get(key)} share the catalog id asset-${key}`);
    seen.set(key, id);
  }
}

// ───────────────────────── helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const tint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = tint('32'), yellow = tint('33'), red = tint('31'), dim = tint('2'), cyan = tint('36');

let downloadedBytes = 0;
let reusedFiles = 0;

async function request(url, kind = 'json', tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { status: res.status });
      return kind === 'json' ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= tries || err.status === 404) throw err;
      await sleep(800 * 2 ** (attempt - 1));
    }
  }
}

/** Downloads url → file unless it is already there with the expected size (resumable runs). */
async function download(url, file, size) {
  if (fs.existsSync(file) && (!size || fs.statSync(file).size === size)) { reusedFiles++; return file; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = await request(url, 'buffer');
  if (size && buf.length !== size) throw new Error(`Size mismatch for ${url}: ${buf.length} ≠ ${size}`);
  fs.writeFileSync(`${file}.part`, buf);
  fs.renameSync(`${file}.part`, file);
  downloadedBytes += buf.length;
  return file;
}

/** Runs jobs with at most `limit` in flight. */
async function pool(items, limit, job) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await job(items[i], i); }
  }));
  return results;
}

function progress(done, total, label, note = '') {
  const width = 24, fill = Math.round((done / total) * width);
  console.log(`${cyan(`[${'█'.repeat(fill)}${'░'.repeat(width - fill)}]`)} ${String(done).padStart(3)}/${total} ${label} ${dim(note)}`);
}

const authorsOf = (info) => Object.keys(info?.authors ?? {}).join(', ') || 'Poly Haven';
const fileSize = (file) => (fs.existsSync(file) ? fs.statSync(file).size : 0);

// ───────────────────────── models

async function fetchModels(list) {
  const dir = path.join(OUT, 'models');
  fs.mkdirSync(path.join(dir, 'thumbs'), { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const manifestFile = path.join(dir, 'manifest.json');
  const previous = new Map((fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : []).map((e) => [e.id, e]));
  const catalog = await request(`${API}/assets?t=models`);
  const models = IDS ? MODELS.filter(([id]) => IDS.has(id)) : MODELS;
  let done = 0;
  const entries = await pool(models, 4, async ([id, category, ko, placement = 'floor', options = {}]) => {
    const info = catalog[id];
    if (!info) { console.log(red(`  ✖ ${id}: not on Poly Haven`)); return previous.get(id) ?? null; }
    const glb = path.join(dir, `${id}.glb`);
    const thumb = path.join(dir, 'thumbs', `${id}.webp`);
    try {
      let stats = previous.get(id);
      if (FORCE || !fs.existsSync(glb) || !stats) stats = await buildModel(io, id, glb, info, options);
      await download(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256&format=webp`, thumb);
      const entry = {
        id, file: `${id}.glb`, ko, en: info.name, category, placement,
        size: stats.size, tris: stats.tris, bytes: fileSize(glb), thumb: `thumbs/${id}.webp`,
        tags: [...new Set([...ko.split(/[\s()]+/).filter(Boolean), ...(CATEGORY_KO[category] ?? []), ...(options.tags ?? []), ...info.name.toLowerCase().split(/\s+/), ...info.tags.map((t) => t.toLowerCase())])],
        author: authorsOf(info), license: 'CC0', url: `https://polyhaven.com/a/${id}`,
      };
      progress(++done, models.length, id, `${entry.size.map((v) => v.toFixed(2)).join('×')} m · ${entry.tris} tris · ${mb(entry.bytes)}`);
      return entry;
    } catch (err) {
      progress(++done, models.length, red(id), err.message);
      return previous.get(id) ?? null;
    }
  });
  // Keep entries of other ids when only some were rebuilt (--ids).
  const byId = new Map(previous);
  for (const entry of entries) if (entry) byId.set(entry.id, entry);
  const order = new Map(MODELS.map(([id], i) => [id, i]));
  const manifest = [...byId.values()].filter((e) => order.has(e.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  // One entry per line: compact, and diffs stay readable.
  fs.writeFileSync(manifestFile, `[\n${manifest.map((e) => JSON.stringify(e)).join(',\n')}\n]\n`);
  // Files of models no longer in the list are removed so the installer carries no dead weight.
  const keep = new Set(manifest.flatMap((e) => [e.file, e.thumb]));
  for (const rel of [...fs.readdirSync(dir).filter((f) => f.endsWith('.glb')), ...fs.readdirSync(path.join(dir, 'thumbs')).map((f) => `thumbs/${f}`)]) {
    if (!keep.has(rel) && !order.has(path.basename(rel).replace(/\.(glb|webp)$/, ''))) { fs.rmSync(path.join(dir, rel)); console.log(dim(`  removed unused ${rel}`)); }
  }
  return manifest;
}

/** Downloads the 1k glTF of a model, packs it into one GLB and normalises it. */
async function buildModel(io, id, glbFile, info, options = {}) {
  const files = await request(`${API}/files/${id}`);
  const gltf = files.gltf?.['1k']?.gltf ?? files.gltf?.['2k']?.gltf;
  if (!gltf) throw new Error('no glTF variant');
  const cacheDir = path.join(CACHE, 'models', id);
  const main = path.join(cacheDir, path.basename(new URL(gltf.url).pathname));
  await download(gltf.url, main, gltf.size);
  // Includes keep their relative paths (textures/…, <id>.bin) so the .gltf resolves them.
  for (const [rel, f] of Object.entries(gltf.include ?? {})) await download(f.url, path.join(cacheDir, rel), f.size);

  const doc = await io.read(main);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  // Some Poly Haven assets lay several variants side by side; keep only the picked ones (one object per item):
  // `pick` keeps the top-level objects whose name contains one of the parts, `drop` removes those that do.
  if (options.pick || options.drop) {
    let level = scene.listChildren();
    while (level.length === 1 && level[0].listChildren().length > 1) level = level[0].listChildren();
    for (const node of level) {
      const name = node.getName();
      if ((options.pick && !options.pick.some((part) => name.includes(part))) || options.drop?.some((part) => name.includes(part))) node.dispose();
    }
  }
  await doc.transform(dedup(), prune());
  // Cap textures at MAX_TEX (the 1k variant already is; this guards sets that ship larger maps).
  const big = doc.getRoot().listTextures().some((t) => { const s = t.getSize(); return s && Math.max(s[0], s[1]) > MAX_TEX; });
  if (big) await doc.transform(textureCompress({ encoder: sharp, resize: [MAX_TEX, MAX_TEX] }));

  // Normalise: bottom centre of the bounding box at the origin (Poly Haven is metres, Y up, front +Z).
  let { min, max } = getBounds(scene);
  let size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  // Unit sanity: Poly Haven lists the real dimensions (mm); a file that is 10× or 100× off is rescaled to them.
  const real = Math.max(...(info.dimensions ?? [0])) / 1000;
  const ratio = real > 0 && !options.pick && !options.drop ? real / Math.max(...size) : 1;
  let scale = ratio > 1.5 || ratio < 1 / 1.5 ? 10 ** Math.round(Math.log10(ratio)) : 1;
  // `height` (metres) overrides a listing that is plainly off by a non-decimal factor.
  if (options.height) scale = options.height / size[1];
  const wrapper = doc.createNode(id).setScale([scale, scale, scale])
    .setTranslation([-(min[0] + max[0]) / 2 * scale, -min[1] * scale, -(min[2] + max[2]) / 2 * scale]);
  for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
  scene.addChild(wrapper);
  size = size.map((v) => Math.round(v * scale * 1000) / 1000);

  // Triangles as drawn: per node, so an instanced mesh counts each time it appears.
  let tris = 0;
  for (const node of doc.getRoot().listNodes()) for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
    if (prim.getMode() === 4) tris += count / 3;
  }
  if (tris > MAX_TRIS) throw new Error(`too heavy: ${Math.round(tris)} triangles (budget ${MAX_TRIS}) — pick a variant or leave it out`);
  const bytes = await io.writeBinary(doc);
  if (bytes.byteLength > MAX_BYTES) throw new Error(`too big: ${mb(bytes.byteLength)} (budget ${mb(MAX_BYTES)})`);
  fs.writeFileSync(`${glbFile}.part`, bytes);
  fs.renameSync(`${glbFile}.part`, glbFile);
  return { size, tris: Math.round(tris) };
}

// ───────────────────────── textures

async function fetchTextures() {
  const sets = [...new Set(MATERIAL_PRESETS.map((p) => p.textures).filter(Boolean))];
  const catalog = await request(`${API}/assets?t=textures`);
  const indexFile = path.join(OUT, 'textures', 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  let done = 0;
  await pool(sets, 4, async (set) => {
    try {
      const info = catalog[set];
      if (!info) throw new Error('not on Poly Haven');
      const files = await request(`${API}/files/${set}`);
      const dir = path.join(OUT, 'textures', set);
      const maps = {};
      for (const [name, key] of [['diff', 'Diffuse'], ['nor', 'nor_gl'], ['rough', 'Rough'], ['ao', 'AO']]) {
        const f = files[key]?.['1k']?.jpg;
        if (!f) continue;
        await download(f.url, path.join(dir, `${name}.jpg`), f.size);
        maps[name] = `${name}.jpg`;
      }
      // Average colour of the diffuse map: the runtime divides the preset colour by it, so a texture keeps its
      // grain but takes the preset's (or the user's) colour.
      const stats = await sharp(path.join(dir, 'diff.jpg')).stats();
      const hex = stats.channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
      const dims = info.dimensions?.length ? info.dimensions.map((v) => Math.round(v) / 1000) : [1, 1];
      const roughAvg = maps.rough ? Math.round((await sharp(path.join(dir, 'rough.jpg')).stats()).channels[0].mean / 255 * 1000) / 1000 : null;
      index[set] = { name: info.name, size: dims, avg: `#${hex}`, roughAvg, maps: Object.keys(maps), author: authorsOf(info), url: `https://polyhaven.com/a/${set}` };
      progress(++done, sets.length, set, `${dims.join('×')} m · avg #${hex}`);
    } catch (err) { progress(++done, sets.length, red(set), err.message); }
  });
  // Sets no preset uses any more are removed (folder + index entry) so the installer carries no dead weight.
  for (const set of Object.keys(index)) if (!sets.includes(set)) delete index[set];
  for (const entry of fs.readdirSync(path.join(OUT, 'textures'), { withFileTypes: true })) {
    if (entry.isDirectory() && !sets.includes(entry.name)) { fs.rmSync(path.join(OUT, 'textures', entry.name), { recursive: true }); console.log(dim(`  removed unused set ${entry.name}`)); }
  }
  const sorted = Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]]));
  fs.writeFileSync(indexFile, `${JSON.stringify(sorted, null, 1)}\n`);
  return sorted;
}

// ───────────────────────── HDRIs

async function fetchHdris() {
  const catalog = await request(`${API}/assets?t=hdris`);
  const dir = path.join(OUT, 'hdri');
  fs.mkdirSync(path.join(dir, 'thumbs'), { recursive: true });
  let done = 0;
  const out = {};
  await pool(ENVIRONMENTS, 4, async (env) => {
    try {
      const files = await request(`${API}/files/${env.polyhaven}`);
      const one = files.hdri['1k'].hdr;
      await download(one.url, path.join(OUT, env.file), one.size);
      if (env.file2k) { const two = files.hdri['2k'].hdr; await download(two.url, path.join(OUT, env.file2k), two.size); }
      await download(`https://cdn.polyhaven.com/asset_img/thumbs/${env.polyhaven}.png?width=256&height=128&format=webp`, path.join(OUT, env.thumb));
      out[env.id] = { name: catalog[env.polyhaven]?.name ?? env.en, author: authorsOf(catalog[env.polyhaven]), url: `https://polyhaven.com/a/${env.polyhaven}` };
      progress(++done, ENVIRONMENTS.length, env.id, env.file2k ? '1k + 2k' : '1k');
    } catch (err) { progress(++done, ENVIRONMENTS.length, red(env.id), err.message); }
  });
  return out;
}

// ───────────────────────── licences

function writeLicenses(models, textures, hdris) {
  const lines = [
    '# Asset licences',
    '',
    'Every 3D model, texture and HDRI in this folder comes from [Poly Haven](https://polyhaven.com) and is released under',
    '**CC0 1.0 Universal (public domain dedication)** — <https://creativecommons.org/publicdomain/zero/1.0/>.',
    'They may be used, modified and redistributed for any purpose, commercial or not, without attribution.',
    'We credit the authors anyway, with thanks. Models were converted to GLB, normalised (bottom centre at the origin) and',
    'their textures capped at 1024 px; nothing else was changed. Generated by `npm run assets` (scripts/fetch-assets.mjs).',
    '',
    `## 3D models (${models.length})`,
    '',
    '| File | Name | Author(s) | Source |',
    '|---|---|---|---|',
    ...models.map((m) => `| models/${m.file} | ${m.en} (${m.ko}) | ${m.author} | <${m.url}> |`),
    '',
    `## Textures (${Object.keys(textures).length})`,
    '',
    '| Folder | Name | Author(s) | Source |',
    '|---|---|---|---|',
    ...Object.entries(textures).map(([id, t]) => `| textures/${id}/ | ${t.name} | ${t.author} | <${t.url}> |`),
    '',
    `## HDRIs (${Object.keys(hdris).length})`,
    '',
    '| File | Name | Author(s) | Source |',
    '|---|---|---|---|',
    ...ENVIRONMENTS.filter((e) => hdris[e.id]).map((e) => `| ${e.file}${e.file2k ? `, ${e.file2k}` : ''} | ${hdris[e.id].name} | ${hdris[e.id].author} | <${hdris[e.id].url}> |`),
    '',
  ];
  fs.writeFileSync(path.join(OUT, 'LICENSES.md'), lines.join('\n'));
}

function folderSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? folderSize(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
}

// ───────────────────────── main

const want = (part) => !ONLY || ONLY.has(part);
const started = Date.now();
fs.mkdirSync(OUT, { recursive: true });
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

let models = readJson(path.join(OUT, 'models', 'manifest.json'), []);
let textures = readJson(path.join(OUT, 'textures', 'index.json'), {});
let hdris = readJson(path.join(OUT, 'hdri', 'index.json'), {});
if (want('models')) { console.log(green(`\nModels (${IDS ? IDS.size : MODELS.length})`)); models = await fetchModels(); }
if (want('textures')) { console.log(green('\nTextures')); textures = await fetchTextures(); }
if (want('hdri')) {
  console.log(green('\nHDRIs'));
  hdris = { ...hdris, ...(await fetchHdris()) };
  fs.writeFileSync(path.join(OUT, 'hdri', 'index.json'), `${JSON.stringify(hdris, null, 1)}\n`);
}
writeLicenses(models, textures, hdris);

console.log(green('\nDone'), dim(`in ${Math.round((Date.now() - started) / 1000)} s · downloaded ${mb(downloadedBytes)} · reused ${reusedFiles} cached files`));
for (const part of ['models', 'textures', 'hdri']) console.log(`  ${part.padEnd(9)} ${mb(folderSize(path.join(OUT, part))).padStart(9)}`);
console.log(`  ${'total'.padEnd(9)} ${yellow(mb(folderSize(OUT)).padStart(9))}`);
