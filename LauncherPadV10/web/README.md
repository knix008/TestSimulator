# 마켓플레이스 & 커뮤니티

다양한 카테고리의 상품·디지털 콘텐츠·서비스를 한 곳에서 거래하고, 커뮤니티와 소통할 수 있는 풀스택 웹 플랫폼입니다.

## 기술 스택

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Prisma 7** + PostgreSQL
- **NextAuth v5** (Google / GitHub OAuth + 이메일·비밀번호)

---

## 시작하기

### 1. 환경 변수 설정

`.env` 파일을 열고 아래 항목을 채워주세요:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/marketplace_db"
AUTH_SECRET="랜덤_시크릿_키"   # openssl rand -base64 32

# 소셜 로그인 (선택)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
```

### 2. 데이터베이스 준비

PostgreSQL이 필요합니다. 아래 세 가지 방법 중 하나를 선택하세요.

#### 옵션 A — Supabase (추천 · 클라우드 · 설치 없음)

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **Settings → Database → Connection string (URI)** 복사
3. `.env`의 `DATABASE_URL`에 붙여넣기

#### 옵션 B — Docker (로컬 · 빠름)

Docker Desktop이 설치되어 있다면:

```bash
docker run -d --name postgres-marketplace \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=marketplace_db \
  -p 5432:5432 \
  postgres:16
```

`.env` 설정:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/marketplace_db"
```

#### 옵션 C — PostgreSQL 직접 설치 (로컬)

1. [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) 에서 설치
2. pgAdmin 또는 psql로 데이터베이스 생성:
   ```sql
   CREATE DATABASE marketplace_db;
   ```

### 3. DB 마이그레이션 및 초기 데이터 삽입

```bash
npm run db:push    # 스키마를 DB에 적용
npm run db:seed    # 카테고리 17개 초기 데이터 삽입
```

### 4. 개발 서버 실행

```bash
npm run dev
```

→ [http://localhost:3000](http://localhost:3000) 에서 확인

---

## 소셜 로그인 설정 (선택)

### Google OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. 새 프로젝트 → OAuth 2.0 클라이언트 ID 생성
3. 승인된 리다이렉트 URI: `http://localhost:3000/api/auth/callback/google`
4. `.env`에 `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 설정

### GitHub OAuth

1. [github.com/settings/developers](https://github.com/settings/developers) 접속
2. New OAuth App 클릭
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. `.env`에 `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` 설정

---

## 주요 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:generate` | Prisma 클라이언트 재생성 |
| `npm run db:push` | 스키마를 DB에 즉시 적용 (개발용) |
| `npm run db:migrate` | 마이그레이션 파일 생성 및 적용 |
| `npm run db:seed` | 초기 카테고리 데이터 삽입 |
| `npm run db:studio` | Prisma Studio (DB GUI) 실행 |

---

## 주요 페이지

| URL | 설명 |
|-----|------|
| `/` | 홈 (피처드 상품 + 커뮤니티 글) |
| `/marketplace` | 마켓플레이스 (유형·카테고리·검색 필터) |
| `/marketplace?type=PHYSICAL` | 중고 상품 |
| `/marketplace?type=DIGITAL` | 디지털 콘텐츠 |
| `/marketplace?type=SERVICE` | 서비스/재능 |
| `/marketplace/listing/new` | 상품 등록 *(로그인 필요)* |
| `/community` | 커뮤니티 게시판 |
| `/community/post/new` | 글 작성 *(로그인 필요)* |
| `/signin` | 로그인 |
| `/signup` | 회원가입 |
| `/profile/[userId]` | 사용자 프로필 |
