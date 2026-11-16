// The sample knowledge base made on the first start, so the Docs Q&A and support templates answer at once.
// Deleting it is fine: it is not made again (settings.sampleKbSeeded).
import { SAMPLE_KB } from './templates.js';

const DOCS = [
  ['refund-policy.md', `# 환불 정책 / Refund policy

구매 후 14일 이내에는 사용하지 않은 제품을 전액 환불합니다. 제품이 고장 난 경우 30일 이내 무상 교환 또는 환불이 가능합니다.
환불은 영업일 기준 3~5일 안에 원래 결제 수단으로 돌아갑니다. 환불을 원하면 주문 번호와 사진을 support@example.com 으로 보내 주세요.

Unused products are fully refunded within 14 days of purchase. Broken products can be exchanged or refunded free of charge within 30 days.
Refunds reach the original payment method in 3–5 business days. Send the order number and a photo to support@example.com.`],
  ['shipping.md', `# 배송 안내 / Shipping

국내 배송은 결제 후 1~2일, 제주·도서 지역은 3일이 걸립니다. 5만 원 이상 주문은 배송비가 무료이며, 그 아래는 3,000원입니다.
해외 배송은 7~14일이 걸리고 관세는 받는 사람이 냅니다.

Domestic delivery takes 1–2 days after payment (islands: 3 days). Orders over 50,000 KRW ship free; otherwise shipping is 3,000 KRW.
International delivery takes 7–14 days; customs duties are paid by the recipient.`],
  ['support-hours.md', `# 상담 시간 / Support hours

상담 시간은 평일 오전 9시부터 오후 6시까지입니다(점심 12~1시). 주말과 공휴일에는 채팅 상담만 운영합니다. 전화: 02-123-4567.

Support is open on weekdays from 9 am to 6 pm (lunch 12–1). On weekends and holidays only chat support is available. Phone: +82-2-123-4567.`],
  ['api-guide.md', `# 개발자 API 안내 / Developer API

API 기본 주소는 https://api.example.com/v2 입니다. 모든 요청에는 Authorization: Bearer <키> 헤더가 필요합니다. 요청 한도는 분당 600회이며 넘으면 429를 돌려줍니다.
주문 조회: GET /orders/{id}. 주문 취소: POST /orders/{id}/cancel. 웹훅은 서명 헤더 X-Signature(HMAC-SHA256)로 확인하세요.

The API base URL is https://api.example.com/v2. Every request needs an Authorization: Bearer <key> header. The rate limit is 600 requests per minute; over it you get 429.
Get an order: GET /orders/{id}. Cancel: POST /orders/{id}/cancel. Verify webhooks with the X-Signature header (HMAC-SHA256).`],
];

export function seedSamples(core) {
  const s = core.store.settings.read();
  if (s.sampleKbSeeded) return;
  if (!core.store.kbs.get(SAMPLE_KB)) {
    const now = Date.now();
    core.store.kbs.put({ id: SAMPLE_KB, name: '샘플 지식 · Sample knowledge', description: 'Refunds, shipping, support hours, API (sample company)', icon: 'b:book', chunkSize: 900, overlap: 150, createdAt: now, updatedAt: now, rev: 0, docs: [], chunks: [] });
    for (const [name, text] of DOCS) core.knowledge.addDocument(SAMPLE_KB, { name, text });
  }
  core.store.settings.write({ ...core.store.settings.read(), sampleKbSeeded: true });
}
