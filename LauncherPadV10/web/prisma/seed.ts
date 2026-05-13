import { PrismaClient } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"

dotenv.config()

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  const categories = [
    // Physical
    { name: "전자기기", slug: "electronics", type: "PHYSICAL" as const, icon: "💻", description: "스마트폰, 노트북, 태블릿 등" },
    { name: "패션/의류", slug: "fashion", type: "PHYSICAL" as const, icon: "👕", description: "옷, 신발, 액세서리 등" },
    { name: "가전/생활", slug: "home-living", type: "PHYSICAL" as const, icon: "🏠", description: "가전제품, 가구, 생활용품" },
    { name: "스포츠/레저", slug: "sports", type: "PHYSICAL" as const, icon: "⚽", description: "운동용품, 아웃도어 장비" },
    { name: "도서/음반", slug: "books", type: "PHYSICAL" as const, icon: "📚", description: "책, CD, DVD 등" },
    // Digital
    { name: "소프트웨어", slug: "software", type: "DIGITAL" as const, icon: "💾", description: "앱, 프로그램, 라이선스" },
    { name: "디자인 에셋", slug: "design", type: "DIGITAL" as const, icon: "🎨", description: "템플릿, 아이콘, 폰트 등" },
    { name: "온라인 강의", slug: "courses", type: "DIGITAL" as const, icon: "🎓", description: "동영상 강의, 튜토리얼" },
    { name: "음악/사운드", slug: "music", type: "DIGITAL" as const, icon: "🎵", description: "음원, 효과음, 비트 등" },
    // Service
    { name: "개발/IT", slug: "development", type: "SERVICE" as const, icon: "⌨️", description: "웹/앱 개발, 기술 지원" },
    { name: "디자인 서비스", slug: "design-service", type: "SERVICE" as const, icon: "✏️", description: "로고, UI/UX, 그래픽 디자인" },
    { name: "번역/외국어", slug: "translation", type: "SERVICE" as const, icon: "🌍", description: "번역, 통역, 언어 교육" },
    { name: "사진/영상", slug: "photography", type: "SERVICE" as const, icon: "📷", description: "촬영, 편집, 영상 제작" },
    { name: "레슨/과외", slug: "tutoring", type: "SERVICE" as const, icon: "📝", description: "학습 지도, 취미 레슨" },
    // Community
    { name: "자유게시판", slug: "general", type: "COMMUNITY" as const, icon: "💬", description: "자유롭게 소통하세요" },
    { name: "정보공유", slug: "info", type: "COMMUNITY" as const, icon: "ℹ️", description: "유용한 정보를 공유해요" },
    { name: "질문/답변", slug: "qna", type: "COMMUNITY" as const, icon: "❓", description: "궁금한 것을 물어보세요" },
  ]

  console.log("🌱 카테고리 시드 데이터 생성 중...")
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    })
  }

  console.log(`✅ ${categories.length}개 카테고리 생성 완료`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
