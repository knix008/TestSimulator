# 마켓플레이스 & 커뮤니티 - 설정 가이드

## 사전 요구사항

- Node.js 18+
- PostgreSQL 14+

## 1. 환경 변수 설정

`.env` 파일을 열고 설정을 완료하세요:

```env
# PostgreSQL 연결 문자열
DATABASE_URL="postgresql://username:password@localhost:5432/marketplace_db"

# NextAuth 시크릿 (랜덤 문자열)
AUTH_SECRET="your-secret-key-change-this"

# (선택) Google OAuth
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# (선택) GitHub OAuth
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
```

### AUTH_SECRET 생성

```bash
openssl rand -base64 32
```

## 2. PostgreSQL 데이터베이스 생성

```sql
CREATE DATABASE marketplace_db;
```

## 3. 데이터베이스 마이그레이션

```bash
npm run db:migrate
```

> 개발 환경에서 스키마를 빠르게 반영하려면:
> ```bash
> npm run db:push
> ```

## 4. 초기 카테고리 데이터 생성

```bash
npm run db:seed
```

## 5. 개발 서버 실행

```bash
npm run dev
```

→ http://localhost:3000 에서 확인

## 소셜 로그인 설정 (선택)

### Google OAuth
1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성
3. OAuth 2.0 클라이언트 ID 생성
4. 리다이렉트 URI: `http://localhost:3000/api/auth/callback/google`
5. `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 설정

### GitHub OAuth
1. https://github.com/settings/developers 접속
2. New OAuth App 클릭
3. Callback URL: `http://localhost:3000/api/auth/callback/github`
4. `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` 설정

## 주요 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:generate` | Prisma 클라이언트 생성 |
| `npm run db:migrate` | DB 마이그레이션 실행 |
| `npm run db:push` | 스키마를 DB에 즉시 적용 (개발용) |
| `npm run db:seed` | 초기 카테고리 데이터 삽입 |
| `npm run db:studio` | Prisma Studio (DB GUI) 실행 |

## 주요 페이지

| URL | 설명 |
|-----|------|
| `/` | 홈 (피처드 상품, 커뮤니티 글) |
| `/marketplace` | 마켓플레이스 전체 |
| `/marketplace?type=PHYSICAL` | 중고 상품 |
| `/marketplace?type=DIGITAL` | 디지털 콘텐츠 |
| `/marketplace?type=SERVICE` | 서비스/재능 |
| `/marketplace/listing/new` | 상품 등록 (로그인 필요) |
| `/community` | 커뮤니티 게시판 |
| `/community/post/new` | 글 작성 (로그인 필요) |
| `/signin` | 로그인 |
| `/signup` | 회원가입 |

## 기술 스택

- **Frontend/Backend**: Next.js 16 (App Router)
- **Database**: PostgreSQL + Prisma ORM 7
- **Auth**: NextAuth.js v5 (Google, GitHub, Email/Password)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
