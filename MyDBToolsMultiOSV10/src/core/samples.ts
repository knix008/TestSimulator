// The 20 example schemas offered on the start screen and in File > Examples.
//
// The first is the long-standing OnlineShop sample (sampleSchema.ts). The rest
// are written in a compact notation so the catalogue stays readable:
//
//   table "comment": column type flags, column type flags, ...
//
//   types  int bigint str(n) text money dec(p,s) float date time ts bool uuid json vec(n)
//   flags  pk (primary key, auto-increment for integers)  nn (not null)  uq (unique)
//          fk>table (many rows here point at one row of table)
//          fk1>table (one row here per row of table)
//          =value (default)
//
// Abstract types are mapped to each sample's database, so every example uses
// types its own dialect offers. Ids are derived from the sample and the names,
// so a sample opened twice is the same document.
import type { DbColumn, DbSchema, DbTable, DbTargetType } from '../types';
import { newColumn, newRelationship, newTable } from './schema';
import { autoArrange } from './layout';
import { createOnlineShopSchema } from './sampleSchema';

export interface SampleInfo {
  id: string;
  nameKo: string;
  nameEn: string;
  descKo: string;
  descEn: string;
  db: DbTargetType;
}

interface SampleDef extends SampleInfo {
  /** Schema name (the document's name). */
  schema: string;
  tables: string;
}

// ─── Type mapping ──────────────────────────────────────────────────────────

interface MappedType {
  DataType: string;
  Length?: number | null;
  Precision?: number | null;
  Scale?: number | null;
}

export function mapType(abstract: string, db: DbTargetType, primaryKey = false): MappedType {
  const m = /^([a-z]+)(?:\((\d+)(?:,(\d+))?\))?$/.exec(abstract.trim());
  if (!m) throw new Error(`unknown type ${abstract}`);
  const [, base, a, b] = m;
  const n = a ? Number(a) : null;
  const pg = db === 'PostgreSQL';
  const my = db === 'MySQL' || db === 'MariaDB';
  const lite = db === 'SQLite';
  const ms = db === 'SqlServer';
  const vec = db === 'VectorDb';
  switch (base) {
    case 'int':
      if (pg && primaryKey) return { DataType: 'SERIAL' };
      return { DataType: pg || lite ? 'INTEGER' : 'INT' };
    case 'bigint':
      if (pg && primaryKey) return { DataType: 'BIGSERIAL' };
      return { DataType: lite ? 'INTEGER' : 'BIGINT' };
    case 'str':
      if (vec) return { DataType: 'TEXT' };
      return { DataType: ms ? 'NVARCHAR' : 'VARCHAR', Length: n ?? 100 };
    case 'text':
      if (ms) return { DataType: 'NVARCHAR', Length: 4000 };
      return { DataType: 'TEXT' };
    case 'money':
      if (ms) return { DataType: 'MONEY' };
      if (vec) return { DataType: 'DOUBLE' };
      return { DataType: 'DECIMAL', Precision: 12, Scale: 2 };
    case 'dec':
      if (vec) return { DataType: 'DOUBLE' };
      return { DataType: 'DECIMAL', Precision: n ?? 10, Scale: b ? Number(b) : 2 };
    case 'float':
      if (pg) return { DataType: 'DOUBLE PRECISION' };
      if (lite) return { DataType: 'REAL' };
      if (ms) return { DataType: 'FLOAT' };
      return { DataType: 'DOUBLE' };
    case 'date':
      return { DataType: vec ? 'BIGINT' : 'DATE' };
    case 'time':
      return { DataType: vec ? 'TEXT' : lite ? 'TEXT' : 'TIME' };
    case 'ts':
      if (pg) return { DataType: 'TIMESTAMP' };
      if (ms) return { DataType: 'DATETIME2' };
      if (vec) return { DataType: 'BIGINT' };
      return { DataType: 'DATETIME' };
    case 'bool':
      if (pg || lite) return { DataType: 'BOOLEAN' };
      if (ms) return { DataType: 'BIT' };
      if (vec) return { DataType: 'INT' };
      return { DataType: 'TINYINT' };
    case 'uuid':
      if (pg || db === 'MariaDB') return { DataType: 'UUID' };
      if (ms) return { DataType: 'UNIQUEIDENTIFIER' };
      if (my) return { DataType: 'CHAR', Length: 36 };
      return { DataType: 'TEXT' };
    case 'json':
      if (pg) return { DataType: 'JSONB' };
      if (my || ms) return { DataType: 'JSON' };
      return { DataType: 'TEXT' };
    case 'vec':
      if (vec) return { DataType: 'VECTOR', Length: n ?? 768 };
      return { DataType: pg ? 'BYTEA' : lite ? 'BLOB' : ms ? 'VARBINARY' : 'BLOB' };
    default:
      throw new Error(`unknown type ${abstract}`);
  }
}

// ─── Deterministic ids ─────────────────────────────────────────────────────

/** FNV-1a, spread into a uuid-shaped string. */
export function stableId(key: string): string {
  const part = (salt: string) => {
    let h = 0x811c9dc5;
    for (const ch of salt + key) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  const hex = part('a') + part('b') + part('c') + part('d');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ─── Parsing the notation ──────────────────────────────────────────────────

interface PendingFk {
  table: DbTable;
  column: DbColumn;
  target: string;
  oneToOne: boolean;
}

export function buildSample(def: SampleDef): DbSchema {
  const schema: DbSchema = { Name: def.schema, TargetDb: def.db, Tables: [], Relationships: [] };
  const pending: PendingFk[] = [];

  const blocks = def.tables
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const block of blocks) {
    const m = /^([a-z_0-9]+)(?:\s+"([^"]*)")?\s*:\s*(.+)$/.exec(block);
    if (!m) throw new Error(`${def.id}: bad table line: ${block}`);
    const [, tableName, comment, columnList] = m;
    const table = newTable({
      Id: stableId(`${def.id}/${tableName}`),
      Name: tableName,
      Comment: comment ?? null,
      Columns: [],
    });
    for (const spec of columnList.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean)) {
      const [name, type, ...flags] = spec.split(/\s+/);
      if (!name || !type) throw new Error(`${def.id}: bad column: ${spec}`);
      const pk = flags.includes('pk');
      const mapped = mapType(type, def.db, pk);
      const def0 = flags.find((f) => f.startsWith('='));
      const column = newColumn({
        Id: stableId(`${def.id}/${tableName}/${name}`),
        Name: name,
        ...mapped,
        IsPrimaryKey: pk,
        IsAutoIncrement: pk && /^(int|bigint)$/.test(type),
        IsNullable: !(pk || flags.includes('nn')),
        IsUnique: flags.includes('uq'),
        DefaultValue: def0 ? def0.slice(1) : null,
      });
      table.Columns.push(column);
      const fk = flags.find((f) => f.startsWith('fk>') || f.startsWith('fk1>'));
      if (fk) {
        column.IsForeignKey = true;
        pending.push({ table, column, target: fk.slice(fk.indexOf('>') + 1), oneToOne: fk.startsWith('fk1') });
      }
    }
    schema.Tables.push(table);
  }

  for (const fk of pending) {
    const source = schema.Tables.find((t) => t.Name === fk.target);
    const sourcePk = source?.Columns.find((c) => c.IsPrimaryKey);
    if (!source || !sourcePk) throw new Error(`${def.id}: ${fk.table.Name}.${fk.column.Name} -> ${fk.target}?`);
    schema.Relationships.push(
      newRelationship({
        Id: stableId(`${def.id}/rel/${fk.table.Name}/${fk.column.Name}`),
        Name: `fk_${fk.table.Name}_${fk.column.Name}`,
        Type: fk.oneToOne ? 'OneToOne' : 'OneToMany',
        LineStyle: 'Orthogonal',
        SourceTableId: source.Id,
        SourceColumnId: sourcePk.Id,
        TargetTableId: fk.table.Id,
        TargetColumnId: fk.column.Id,
      }),
    );
  }
  autoArrange(schema);
  return schema;
}

// ─── The catalogue ─────────────────────────────────────────────────────────

const DEFS: SampleDef[] = [
  {
    id: 'library', schema: 'Library', db: 'SQLite',
    nameKo: '도서관', nameEn: 'Library',
    descKo: '도서·저자·회원·대출·예약', descEn: 'Books, authors, members, loans, holds',
    tables: `
      authors "저자": id int pk, name str(100) nn, birth_year int, country str(60)
      publishers "출판사": id int pk, name str(120) nn uq, city str(60)
      books "도서": id int pk, isbn str(13) nn uq, title str(200) nn, publisher_id int fk>publishers, published_on date, pages int
      book_authors "도서-저자": id int pk, book_id int nn fk>books, author_id int nn fk>authors
      members "회원": id int pk, card_no str(20) nn uq, name str(80) nn, email str(255), joined_on date nn
      loans "대출": id int pk, book_id int nn fk>books, member_id int nn fk>members, loaned_at ts nn, due_on date nn, returned_at ts
      holds "예약": id int pk, book_id int nn fk>books, member_id int nn fk>members, requested_at ts nn
    `,
  },
  {
    id: 'hospital', schema: 'Hospital', db: 'PostgreSQL',
    nameKo: '병원', nameEn: 'Hospital',
    descKo: '환자·의사·진료과·예약·처방', descEn: 'Patients, doctors, departments, visits, prescriptions',
    tables: `
      departments "진료과": id int pk, name str(80) nn uq, floor int
      doctors "의사": id int pk, department_id int nn fk>departments, name str(80) nn, license_no str(20) nn uq
      patients "환자": id bigint pk, chart_no str(20) nn uq, name str(80) nn, birth_date date nn, phone str(20)
      appointments "예약": id bigint pk, patient_id bigint nn fk>patients, doctor_id int nn fk>doctors, scheduled_at ts nn, status str(20) nn =booked
      visits "진료": id bigint pk, appointment_id bigint fk1>appointments, diagnosis text, visited_at ts nn
      medicines "약품": id int pk, code str(20) nn uq, name str(120) nn, unit str(20)
      prescriptions "처방": id bigint pk, visit_id bigint nn fk>visits, medicine_id int nn fk>medicines, dose str(40) nn, days int nn
    `,
  },
  {
    id: 'school', schema: 'School', db: 'MySQL',
    nameKo: '학사 관리', nameEn: 'School',
    descKo: '학생·교수·강좌·수강·성적', descEn: 'Students, professors, courses, enrolments, grades',
    tables: `
      majors "전공": id int pk, name str(80) nn uq
      students "학생": id int pk, student_no str(12) nn uq, name str(60) nn, major_id int fk>majors, admitted_on date
      professors "교수": id int pk, name str(60) nn, major_id int fk>majors, email str(255) uq
      courses "강좌": id int pk, code str(12) nn uq, title str(120) nn, credits int nn =3, professor_id int fk>professors
      semesters "학기": id int pk, year int nn, term int nn
      enrollments "수강": id int pk, student_id int nn fk>students, course_id int nn fk>courses, semester_id int nn fk>semesters, grade str(2)
    `,
  },
  {
    id: 'hr', schema: 'HumanResources', db: 'SqlServer',
    nameKo: '인사 관리', nameEn: 'Human Resources',
    descKo: '부서·직원·직급·급여·휴가', descEn: 'Departments, employees, positions, payroll, leave',
    tables: `
      departments "부서": id int pk, name str(80) nn uq, parent_id int
      positions "직급": id int pk, title str(60) nn uq, grade int nn
      employees "직원": id int pk, emp_no str(10) nn uq, name str(60) nn, department_id int fk>departments, position_id int fk>positions, hired_on date nn, active bool nn =1
      salaries "급여": id int pk, employee_id int nn fk>employees, pay_month date nn, base money nn, bonus money
      leave_requests "휴가 신청": id int pk, employee_id int nn fk>employees, starts_on date nn, ends_on date nn, kind str(20) nn, approved bool
      evaluations "평가": id int pk, employee_id int nn fk>employees, year int nn, score dec(4,1), note text
    `,
  },
  {
    id: 'blog', schema: 'Blog', db: 'MariaDB',
    nameKo: '블로그', nameEn: 'Blog',
    descKo: '사용자·글·댓글·태그·좋아요', descEn: 'Users, posts, comments, tags, likes',
    tables: `
      users "사용자": id bigint pk, handle str(40) nn uq, email str(255) nn uq, display_name str(80), joined_at ts nn
      posts "글": id bigint pk, author_id bigint nn fk>users, title str(200) nn, slug str(200) nn uq, body text nn, published_at ts
      comments "댓글": id bigint pk, post_id bigint nn fk>posts, user_id bigint nn fk>users, body text nn, created_at ts nn
      tags "태그": id int pk, name str(40) nn uq
      post_tags "글-태그": id bigint pk, post_id bigint nn fk>posts, tag_id int nn fk>tags
      likes "좋아요": id bigint pk, post_id bigint nn fk>posts, user_id bigint nn fk>users, created_at ts nn
    `,
  },
  {
    id: 'hotel', schema: 'Hotel', db: 'PostgreSQL',
    nameKo: '호텔 예약', nameEn: 'Hotel Booking',
    descKo: '호텔·객실·고객·예약·결제', descEn: 'Hotels, rooms, guests, bookings, payments',
    tables: `
      hotels "호텔": id int pk, name str(120) nn, city str(60) nn, stars int
      room_types "객실 유형": id int pk, name str(60) nn uq, capacity int nn, base_rate money nn
      rooms "객실": id int pk, hotel_id int nn fk>hotels, room_type_id int nn fk>room_types, number str(10) nn
      guests "고객": id bigint pk, name str(80) nn, email str(255) uq, phone str(20)
      bookings "예약": id bigint pk, room_id int nn fk>rooms, guest_id bigint nn fk>guests, check_in date nn, check_out date nn, status str(20) nn
      payments "결제": id bigint pk, booking_id bigint nn fk>bookings, amount money nn, paid_at ts nn, method str(20)
    `,
  },
  {
    id: 'airline', schema: 'Airline', db: 'SqlServer',
    nameKo: '항공 예약', nameEn: 'Airline',
    descKo: '공항·항공편·좌석·승객·탑승권', descEn: 'Airports, flights, seats, passengers, tickets',
    tables: `
      airports "공항": id int pk, iata str(3) nn uq, name str(120) nn, city str(60)
      aircraft "기체": id int pk, model str(60) nn, seats int nn
      flights "항공편": id int pk, flight_no str(8) nn, origin_id int nn fk>airports, destination_id int nn fk>airports, aircraft_id int fk>aircraft, departs_at ts nn, arrives_at ts nn
      passengers "승객": id bigint pk, name str(80) nn, passport_no str(20) uq, nationality str(2)
      tickets "탑승권": id bigint pk, flight_id int nn fk>flights, passenger_id bigint nn fk>passengers, seat str(4), fare money nn, class str(10) nn
    `,
  },
  {
    id: 'bank', schema: 'Bank', db: 'PostgreSQL',
    nameKo: '은행', nameEn: 'Bank',
    descKo: '고객·계좌·거래·카드·대출', descEn: 'Customers, accounts, transactions, cards, loans',
    tables: `
      branches "지점": id int pk, code str(6) nn uq, name str(80) nn
      customers "고객": id bigint pk, name str(80) nn, birth_date date, email str(255) uq
      accounts "계좌": id bigint pk, account_no str(20) nn uq, customer_id bigint nn fk>customers, branch_id int fk>branches, balance money nn =0, opened_on date nn
      transactions "거래": id bigint pk, account_id bigint nn fk>accounts, amount money nn, kind str(10) nn, occurred_at ts nn, memo str(200)
      cards "카드": id bigint pk, account_id bigint nn fk>accounts, card_no str(19) nn uq, expires_on date nn
      loans "대출": id bigint pk, customer_id bigint nn fk>customers, principal money nn, rate dec(5,3) nn, started_on date nn
    `,
  },
  {
    id: 'inventory', schema: 'Inventory', db: 'MySQL',
    nameKo: '재고 관리', nameEn: 'Inventory',
    descKo: '창고·품목·공급업체·입출고', descEn: 'Warehouses, items, suppliers, stock movements',
    tables: `
      warehouses "창고": id int pk, name str(80) nn uq, location str(120)
      suppliers "공급업체": id int pk, name str(120) nn, contact str(80), phone str(20)
      items "품목": id int pk, sku str(30) nn uq, name str(120) nn, unit str(10) nn, supplier_id int fk>suppliers
      stock "재고": id int pk, warehouse_id int nn fk>warehouses, item_id int nn fk>items, quantity int nn =0
      purchase_orders "발주": id int pk, supplier_id int nn fk>suppliers, ordered_on date nn, status str(20) nn
      movements "입출고": id bigint pk, item_id int nn fk>items, warehouse_id int nn fk>warehouses, quantity int nn, reason str(20) nn, moved_at ts nn
    `,
  },
  {
    id: 'restaurant', schema: 'Restaurant', db: 'SQLite',
    nameKo: '식당 주문', nameEn: 'Restaurant',
    descKo: '메뉴·테이블·주문·주문 항목', descEn: 'Menu, tables, orders, order lines',
    tables: `
      categories "메뉴 분류": id int pk, name str(40) nn uq
      menu_items "메뉴": id int pk, category_id int nn fk>categories, name str(80) nn, price money nn, available bool nn =1
      dining_tables "테이블": id int pk, label str(10) nn uq, seats int nn
      staff "직원": id int pk, name str(60) nn, role str(20) nn
      orders "주문": id int pk, table_id int fk>dining_tables, staff_id int fk>staff, ordered_at ts nn, paid bool nn =0
      order_items "주문 항목": id int pk, order_id int nn fk>orders, menu_item_id int nn fk>menu_items, quantity int nn =1, note str(120)
    `,
  },
  {
    id: 'social', schema: 'SocialNetwork', db: 'PostgreSQL',
    nameKo: '소셜 네트워크', nameEn: 'Social Network',
    descKo: '프로필·팔로우·게시물·메시지', descEn: 'Profiles, follows, posts, messages',
    tables: `
      users "사용자": id bigint pk, handle str(30) nn uq, email str(255) nn uq, created_at ts nn
      profiles "프로필": id bigint pk, user_id bigint nn uq fk1>users, bio text, avatar_url str(400), settings json
      follows "팔로우": id bigint pk, follower_id bigint nn fk>users, followee_id bigint nn fk>users, created_at ts nn
      posts "게시물": id bigint pk, user_id bigint nn fk>users, body text nn, created_at ts nn
      reactions "반응": id bigint pk, post_id bigint nn fk>posts, user_id bigint nn fk>users, kind str(10) nn
      messages "메시지": id bigint pk, sender_id bigint nn fk>users, recipient_id bigint nn fk>users, body text nn, sent_at ts nn, read_at ts
    `,
  },
  {
    id: 'streaming', schema: 'Streaming', db: 'MariaDB',
    nameKo: '영상 스트리밍', nameEn: 'Video Streaming',
    descKo: '구독·작품·에피소드·시청 기록', descEn: 'Plans, titles, episodes, watch history',
    tables: `
      plans "요금제": id int pk, name str(40) nn uq, monthly_fee money nn, max_screens int nn
      accounts "계정": id bigint pk, email str(255) nn uq, plan_id int fk>plans, renews_on date
      viewers "시청 프로필": id bigint pk, account_id bigint nn fk>accounts, name str(40) nn, kids bool nn =0
      titles "작품": id int pk, name str(200) nn, kind str(10) nn, released_on date, rating str(5)
      episodes "에피소드": id int pk, title_id int nn fk>titles, season int nn, number int nn, minutes int
      watch_history "시청 기록": id bigint pk, viewer_id bigint nn fk>viewers, episode_id int nn fk>episodes, position_sec int nn =0, watched_at ts nn
    `,
  },
  {
    id: 'real-estate', schema: 'RealEstate', db: 'MySQL',
    nameKo: '부동산', nameEn: 'Real Estate',
    descKo: '매물·중개사·방문·계약', descEn: 'Listings, agents, viewings, contracts',
    tables: `
      agencies "중개사무소": id int pk, name str(120) nn, phone str(20)
      agents "중개사": id int pk, agency_id int nn fk>agencies, name str(60) nn, license_no str(20) uq
      properties "매물": id int pk, address str(200) nn, kind str(20) nn, area_m2 dec(8,2) nn, rooms int, built_year int
      listings "등록": id int pk, property_id int nn fk>properties, agent_id int nn fk>agents, price money nn, listed_on date nn, deal str(10) nn
      clients "고객": id int pk, name str(60) nn, phone str(20)
      viewings "방문": id int pk, listing_id int nn fk>listings, client_id int nn fk>clients, visited_at ts nn
      contracts "계약": id int pk, listing_id int nn fk1>listings, client_id int nn fk>clients, signed_on date nn, amount money nn
    `,
  },
  {
    id: 'car-rental', schema: 'CarRental', db: 'SQLite',
    nameKo: '렌터카', nameEn: 'Car Rental',
    descKo: '지점·차량·고객·대여·정비', descEn: 'Branches, cars, customers, rentals, maintenance',
    tables: `
      branches "지점": id int pk, name str(60) nn uq, address str(200)
      models "차종": id int pk, maker str(40) nn, name str(60) nn, seats int nn, daily_rate money nn
      cars "차량": id int pk, plate str(12) nn uq, model_id int nn fk>models, branch_id int fk>branches, mileage int nn =0
      customers "고객": id int pk, name str(60) nn, license_no str(20) nn uq, phone str(20)
      rentals "대여": id int pk, car_id int nn fk>cars, customer_id int nn fk>customers, picked_up_at ts nn, returned_at ts, total money
      maintenance "정비": id int pk, car_id int nn fk>cars, serviced_on date nn, cost money, note text
    `,
  },
  {
    id: 'ticketing', schema: 'Ticketing', db: 'PostgreSQL',
    nameKo: '공연 예매', nameEn: 'Event Ticketing',
    descKo: '공연장·공연·회차·좌석·예매', descEn: 'Venues, shows, performances, seats, bookings',
    tables: `
      venues "공연장": id int pk, name str(120) nn, city str(60) nn, capacity int
      seats "좌석": id int pk, venue_id int nn fk>venues, section str(10) nn, row_label str(4) nn, number int nn
      shows "공연": id int pk, title str(200) nn, genre str(30), runtime_min int
      performances "회차": id int pk, show_id int nn fk>shows, venue_id int nn fk>venues, starts_at ts nn
      customers "고객": id bigint pk, name str(80) nn, email str(255) nn uq
      bookings "예매": id bigint pk, performance_id int nn fk>performances, seat_id int nn fk>seats, customer_id bigint nn fk>customers, price money nn, booked_at ts nn
    `,
  },
  {
    id: 'project', schema: 'ProjectManagement', db: 'SqlServer',
    nameKo: '프로젝트 관리', nameEn: 'Project Management',
    descKo: '프로젝트·작업·담당자·시간 기록', descEn: 'Projects, tasks, assignees, time logs',
    tables: `
      teams "팀": id int pk, name str(80) nn uq
      members "구성원": id int pk, team_id int fk>teams, name str(60) nn, email str(255) nn uq
      projects "프로젝트": id int pk, name str(120) nn, team_id int fk>teams, starts_on date, due_on date, budget money
      milestones "마일스톤": id int pk, project_id int nn fk>projects, title str(120) nn, due_on date
      tasks "작업": id int pk, project_id int nn fk>projects, milestone_id int fk>milestones, assignee_id int fk>members, title str(200) nn, status str(20) nn, priority int nn =3
      time_logs "시간 기록": id bigint pk, task_id int nn fk>tasks, member_id int nn fk>members, hours dec(5,2) nn, logged_on date nn
    `,
  },
  {
    id: 'gym', schema: 'Fitness', db: 'SQLite',
    nameKo: '피트니스', nameEn: 'Fitness Club',
    descKo: '회원권·회원·수업·출석', descEn: 'Memberships, members, classes, attendance',
    tables: `
      membership_types "회원권": id int pk, name str(40) nn uq, months int nn, price money nn
      members "회원": id int pk, name str(60) nn, phone str(20) uq, membership_type_id int fk>membership_types, expires_on date
      trainers "트레이너": id int pk, name str(60) nn, specialty str(40)
      classes "수업": id int pk, trainer_id int fk>trainers, name str(60) nn, weekday int nn, starts_at time nn, capacity int nn
      attendance "출석": id int pk, member_id int nn fk>members, class_id int fk>classes, checked_in_at ts nn
    `,
  },
  {
    id: 'iot', schema: 'IoTSensors', db: 'MariaDB',
    nameKo: 'IoT 센서', nameEn: 'IoT Sensors',
    descKo: '장소·장치·센서·측정값·경보', descEn: 'Sites, devices, sensors, readings, alerts',
    tables: `
      sites "장소": id int pk, name str(80) nn, latitude dec(9,6), longitude dec(9,6)
      devices "장치": id int pk, site_id int nn fk>sites, serial str(40) nn uq, firmware str(20), installed_on date
      sensors "센서": id int pk, device_id int nn fk>devices, kind str(20) nn, unit str(10) nn
      readings "측정값": id bigint pk, sensor_id int nn fk>sensors, value float nn, measured_at ts nn
      alert_rules "경보 규칙": id int pk, sensor_id int nn fk>sensors, threshold float nn, direction str(4) nn
      alerts "경보": id bigint pk, rule_id int nn fk>alert_rules, reading_id bigint fk>readings, raised_at ts nn, cleared_at ts
    `,
  },
  {
    id: 'rag', schema: 'RagVectorStore', db: 'VectorDb',
    nameKo: '벡터 검색 (RAG)', nameEn: 'Vector Search (RAG)',
    descKo: '문서·청크·임베딩·검색 로그', descEn: 'Documents, chunks, embeddings, query log',
    tables: `
      collections "컬렉션": id bigint pk, name str(80) nn uq, dimension int nn
      documents "문서": id bigint pk, collection_id bigint nn fk>collections, source str(400) nn, title str(200)
      chunks "청크": id bigint pk, document_id bigint nn fk>documents, ordinal int nn, content text nn
      embeddings "임베딩": id bigint pk, chunk_id bigint nn fk1>chunks, vector vec(768) nn, model str(60) nn
      queries "검색 기록": id bigint pk, collection_id bigint nn fk>collections, text text nn, vector vec(768), asked_at ts nn
    `,
  },
];

const ONLINE_SHOP: SampleInfo = {
  id: 'online-shop',
  nameKo: '온라인 쇼핑몰',
  nameEn: 'Online Shop',
  descKo: '회원·분류·상품·주문·주문 항목',
  descEn: 'Users, categories, products, orders, order items',
  db: 'PostgreSQL',
};

/** Every example, in the order the start screen shows them. */
export const SAMPLES: SampleInfo[] = [ONLINE_SHOP, ...DEFS.map(({ schema: _s, tables: _t, ...info }) => info)];

/** A fresh copy of the example (each call builds it anew). */
export function createSample(id: string): DbSchema {
  if (id === ONLINE_SHOP.id) return createOnlineShopSchema();
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`unknown sample ${id}`);
  return buildSample(def);
}

export function sampleName(info: SampleInfo, language: 'ko' | 'en'): string {
  return language === 'en' ? info.nameEn : info.nameKo;
}

export function sampleDescription(info: SampleInfo, language: 'ko' | 'en'): string {
  return language === 'en' ? info.descEn : info.descKo;
}
