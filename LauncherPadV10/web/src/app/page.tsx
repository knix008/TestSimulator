import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { ListingCard } from "@/components/marketplace/ListingCard"
import { PostCard } from "@/components/community/PostCard"
import { Package, FileText, Briefcase, Users, ArrowRight, Search } from "lucide-react"

export default async function Home() {
  const [listings, posts, listingCount, userCount, postCount] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, image: true } }, category: true },
    }),
    prisma.post.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, image: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.listing.count(),
    prisma.user.count(),
    prisma.post.count(),
  ])

  const typeCategories = [
    {
      type: "PHYSICAL",
      label: "중고 상품",
      desc: "중고 물품을 사고 팔아보세요",
      icon: Package,
      color: "bg-blue-50 text-blue-600 border-blue-100",
      href: "/marketplace?type=PHYSICAL",
    },
    {
      type: "DIGITAL",
      label: "디지털 콘텐츠",
      desc: "파일, 강의, 소프트웨어 등",
      icon: FileText,
      color: "bg-purple-50 text-purple-600 border-purple-100",
      href: "/marketplace?type=DIGITAL",
    },
    {
      type: "SERVICE",
      label: "서비스/재능",
      desc: "전문 서비스와 재능을 거래하세요",
      icon: Briefcase,
      color: "bg-green-50 text-green-600 border-green-100",
      href: "/marketplace?type=SERVICE",
    },
    {
      type: "COMMUNITY",
      label: "커뮤니티",
      desc: "정보를 공유하고 소통하세요",
      icon: Users,
      color: "bg-orange-50 text-orange-600 border-orange-100",
      href: "/community",
    },
  ]

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            모든 것을 한 곳에서
          </h1>
          <p className="text-indigo-200 text-lg mb-8">
            중고 상품부터 디지털 콘텐츠, 서비스까지 — 원하는 것을 찾고 판매하세요
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
            <Link
              href="/marketplace"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-700 font-semibold rounded-xl hover:bg-indigo-50 transition-colors"
            >
              <Search className="w-4 h-4" />
              둘러보기
            </Link>
            <Link
              href="/marketplace/listing/new"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl border border-indigo-400 hover:bg-indigo-400 transition-colors"
            >
              판매 시작하기
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-indigo-600">{listingCount.toLocaleString()}</p>
            <p className="text-sm text-gray-500">등록된 상품</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">{userCount.toLocaleString()}</p>
            <p className="text-sm text-gray-500">회원</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">{postCount.toLocaleString()}</p>
            <p className="text-sm text-gray-500">커뮤니티 글</p>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Category Cards */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">카테고리</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {typeCategories.map((cat) => {
              const Icon = cat.icon
              return (
                <Link key={cat.type} href={cat.href}>
                  <div className={`border rounded-xl p-5 hover:shadow-md transition-all duration-200 h-full ${cat.color}`}>
                    <Icon className="w-8 h-8 mb-3" />
                    <h3 className="font-semibold text-gray-900 mb-1">{cat.label}</h3>
                    <p className="text-xs text-gray-500">{cat.desc}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Recent Listings */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">최근 등록</h2>
            <Link href="/marketplace" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {listings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-400 mb-3">아직 등록된 상품이 없습니다</p>
              <Link href="/marketplace/listing/new" className="text-sm text-indigo-600 hover:underline">
                첫 번째 상품을 등록해보세요
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>

        {/* Recent Posts */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">커뮤니티</h2>
            <Link href="/community" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {posts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-400 mb-3">아직 게시글이 없습니다</p>
              <Link href="/community/post/new" className="text-sm text-indigo-600 hover:underline">
                첫 번째 글을 작성해보세요
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
