import Link from "next/link"
import { ShoppingBag } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg mb-3">
              <ShoppingBag className="w-5 h-5 text-indigo-400" />
              마켓플레이스
            </Link>
            <p className="text-sm leading-relaxed">
              다양한 카테고리의 상품과 서비스를 한 곳에서 거래하고 커뮤니티와 소통하세요.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">서비스</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/marketplace" className="hover:text-indigo-400 transition-colors">마켓플레이스</Link></li>
              <li><Link href="/marketplace?type=PHYSICAL" className="hover:text-indigo-400 transition-colors">중고 거래</Link></li>
              <li><Link href="/marketplace?type=DIGITAL" className="hover:text-indigo-400 transition-colors">디지털 콘텐츠</Link></li>
              <li><Link href="/marketplace?type=SERVICE" className="hover:text-indigo-400 transition-colors">서비스/재능</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">커뮤니티</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/community" className="hover:text-indigo-400 transition-colors">게시판</Link></li>
              <li><Link href="/community/post/new" className="hover:text-indigo-400 transition-colors">글 작성</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-6 text-center text-sm">
          © {new Date().getFullYear()} 마켓플레이스. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
