import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { ListingCard } from "@/components/marketplace/ListingCard"
import { Plus, Package, FileText, Briefcase, Filter } from "lucide-react"

type SearchParams = {
  type?: string
  category?: string
  q?: string
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { type, category, q } = params

  const [listings, categories] = await Promise.all([
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(type ? { type: type as "PHYSICAL" | "DIGITAL" | "SERVICE" } : {}),
        ...(category ? { category: { slug: category } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { tags: { has: q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, image: true } }, category: true },
    }),
    prisma.category.findMany({
      where: { type: { not: "COMMUNITY" } },
      include: { _count: { select: { listings: true } } },
      orderBy: { name: "asc" },
    }),
  ])

  const typeFilters = [
    { value: "", label: "전체", icon: null },
    { value: "PHYSICAL", label: "중고 상품", icon: Package },
    { value: "DIGITAL", label: "디지털", icon: FileText },
    { value: "SERVICE", label: "서비스", icon: Briefcase },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">마켓플레이스</h1>
          <p className="text-sm text-gray-500 mt-1">총 {listings.length}개의 상품</p>
        </div>
        <Link
          href="/marketplace/listing/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          등록하기
        </Link>
      </div>

      {/* Search */}
      <form className="mb-6">
        {type && <input type="hidden" name="type" value={type} />}
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="상품명, 태그로 검색..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
        />
      </form>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-56 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Filter className="w-4 h-4" />
              거래 유형
            </div>
            <div className="space-y-1">
              {typeFilters.map((filter) => {
                const Icon = filter.icon
                const isActive = (type || "") === filter.value
                const params = new URLSearchParams()
                if (filter.value) params.set("type", filter.value)
                if (q) params.set("q", q)
                return (
                  <Link
                    key={filter.value}
                    href={`/marketplace?${params.toString()}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {filter.label}
                  </Link>
                )
              })}
            </div>

            {categories.length > 0 && (
              <>
                <div className="border-t border-gray-100 my-3" />
                <div className="text-sm font-semibold text-gray-700 mb-3">카테고리</div>
                <div className="space-y-1">
                  <Link
                    href={`/marketplace${type ? `?type=${type}` : ""}${q ? `${type ? "&" : "?"}q=${q}` : ""}`}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      !category ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>전체</span>
                  </Link>
                  {categories.map((cat) => {
                    const p = new URLSearchParams()
                    p.set("category", cat.slug)
                    if (type) p.set("type", type)
                    if (q) p.set("q", q)
                    return (
                      <Link
                        key={cat.id}
                        href={`/marketplace?${p.toString()}`}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          category === cat.slug
                            ? "bg-indigo-50 text-indigo-700 font-medium"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{cat.name}</span>
                        <span className="text-xs text-gray-400">{cat._count.listings}</span>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Listings Grid */}
        <div className="flex-1">
          {listings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-400 mb-3">검색 결과가 없습니다</p>
              <Link href="/marketplace/listing/new" className="text-sm text-indigo-600 hover:underline">
                첫 번째 상품을 등록해보세요
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
