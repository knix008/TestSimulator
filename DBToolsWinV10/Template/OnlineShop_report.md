# 데이터베이스 설계 보고서

- **스키마 이름**: OnlineShop
- **대상 DB**: PostgreSQL
- **작성 일시**: 2026-06-17 14:43:25
- **프로젝트 파일**: C:\Home\Projects\TestSimulator\DBToolsWinV10\Template\OnlineShop.mdprj
- **테이블 수**: 5
- **관계 수**: 4

## 테이블 목록

### users
_회원 정보_

| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
id | BIGSERIAL | ✓ | ✓ |  |  |  | 회원 ID |
username | VARCHAR(50) |  |  |  |  |  | 로그인 이름 |
email | VARCHAR(255) |  |  |  | ✓ |  | 이메일 |
created_at | TIMESTAMPTZ |  |  |  |  | NOW() |  |

### categories
_상품 카테고리_

| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
id | SERIAL | ✓ | ✓ |  |  |  |  |
name | VARCHAR(100) |  |  |  |  |  |  |
description | TEXT |  |  | ✓ |  |  |  |

### products
_판매 상품_

| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
id | BIGSERIAL | ✓ | ✓ |  |  |  |  |
name | VARCHAR(200) |  |  |  |  |  |  |
price | DECIMAL(12,2) |  |  |  |  |  |  |
category_id | INTEGER |  |  |  |  |  | 카테고리 FK |
is_active | BOOLEAN |  |  |  |  | TRUE |  |

### orders
_주문 헤더_

| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
id | BIGSERIAL | ✓ | ✓ |  |  |  |  |
user_id | BIGINT |  |  |  |  |  | 주문 회원 FK |
order_date | TIMESTAMPTZ |  |  |  |  | NOW() |  |
status | VARCHAR(20) |  |  |  |  | 'PENDING' |  |

### order_items
_주문 상세_

| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |
| --- | --- | :---: | :---: | :---: | :---: | --- | --- |
id | BIGSERIAL | ✓ | ✓ |  |  |  |  |
order_id | BIGINT |  |  |  |  |  |  |
product_id | BIGINT |  |  |  |  |  |  |
quantity | INTEGER |  |  |  |  | 1 |  |
unit_price | DECIMAL(12,2) |  |  |  |  |  |  |

## 관계 목록

| 이름 | 유형 | 소스 | 타겟 |
| --- | --- | --- | --- |
fk_products_category | 1:N | categories.id | products.category_id |
fk_orders_user | 1:N | users.id | orders.user_id |
fk_order_items_order | 1:N | orders.id | order_items.order_id |
fk_order_items_product | 1:N | products.id | order_items.product_id |

## 정규화 검사 결과

발견된 문제가 없습니다.
