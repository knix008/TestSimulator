import Link from "next/link"
import { formatPrice, formatRelativeDate } from "@/lib/utils"
import { Package, FileText, Briefcase, Tag } from "lucide-react"

type Listing = {
  id: string
  title: string
  description: string
  price: number | null
  currency: string
  type: "PHYSICAL" | "DIGITAL" | "SERVICE"
  status: "ACTIVE" | "SOLD" | "INACTIVE"
  tags: string[]
  createdAt: Date | string
  user: { name: string | null; image: string | null }
  category: { name: string; slug: string }
}

const typeConfig = {
  PHYSICAL: { label: "중고 상품", icon: Package, color: "bg-blue-100 text-blue-700" },
  DIGITAL: { label: "디지털", icon: FileText, color: "bg-purple-100 text-purple-700" },
  SERVICE: { label: "서비스", icon: Briefcase, color: "bg-green-100 text-green-700" },
}

export function ListingCard({ listing }: { listing: Listing }) {
  const typeInfo = typeConfig[listing.type]
  const TypeIcon = typeInfo.icon

  return (
    <Link href={`/marketplace/listing/${listing.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all duration-200 h-full flex flex-col">
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeInfo.color}`}>
              <TypeIcon className="w-3 h-3" />
              {typeInfo.label}
            </span>
            {listing.status === "SOLD" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                거래완료
              </span>
            )}
          </div>

          <h3 className="font-semibold text-gray-900 line-clamp-2 leading-snug">
            {listing.title}
          </h3>

          <p className="text-sm text-gray-500 line-clamp-2 flex-1">
            {listing.description}
          </p>

          {listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {listing.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="font-bold text-indigo-600 text-lg">
              {formatPrice(listing.price, listing.currency)}
            </span>
            <div className="text-right">
              <p className="text-xs text-gray-500">{listing.category.name}</p>
              <p className="text-xs text-gray-400">{formatRelativeDate(listing.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
