// Port of Sample/SampleSchemaFactory.cs — the OnlineShop example schema.
// Ids are fixed so regenerated sample files stay byte-comparable.
import type { DbSchema } from '../types';
import { newColumn, newRelationship, newTable } from './schema';

const T_USERS = '11111111-1111-1111-1111-111111111101';
const T_CATEGORIES = '11111111-1111-1111-1111-111111111102';
const T_PRODUCTS = '11111111-1111-1111-1111-111111111103';
const T_ORDERS = '11111111-1111-1111-1111-111111111104';
const T_ORDER_ITEMS = '11111111-1111-1111-1111-111111111105';

const C_USERS_ID = '22222222-2222-2222-2222-222222222201';
const C_CATEGORIES_ID = '22222222-2222-2222-2222-222222222211';
const C_PRODUCTS_ID = '22222222-2222-2222-2222-222222222221';
const C_PRODUCTS_CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const C_ORDERS_ID = '22222222-2222-2222-2222-222222222231';
const C_ORDERS_USER_ID = '22222222-2222-2222-2222-222222222232';
const C_ORDER_ITEMS_ID = '22222222-2222-2222-2222-222222222241';
const C_ORDER_ITEMS_ORDER_ID = '22222222-2222-2222-2222-222222222242';
const C_ORDER_ITEMS_PRODUCT_ID = '22222222-2222-2222-2222-222222222243';

export function createOnlineShopSchema(): DbSchema {
  return {
    Name: 'OnlineShop',
    TargetDb: 'PostgreSQL',
    Tables: [
      newTable({
        Id: T_USERS,
        Name: 'users',
        Comment: '회원 정보',
        X: 40,
        Y: 60,
        Columns: [
          newColumn({
            Id: C_USERS_ID,
            Name: 'id',
            DataType: 'BIGSERIAL',
            IsPrimaryKey: true,
            IsAutoIncrement: true,
            IsNullable: false,
            Comment: '회원 ID',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222203',
            Name: 'username',
            DataType: 'VARCHAR',
            Length: 50,
            IsNullable: false,
            Comment: '로그인 이름',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222202',
            Name: 'email',
            DataType: 'VARCHAR',
            Length: 255,
            IsNullable: false,
            IsUnique: true,
            Comment: '이메일',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222204',
            Name: 'created_at',
            DataType: 'TIMESTAMPTZ',
            IsNullable: false,
            DefaultValue: 'NOW()',
          }),
        ],
      }),
      newTable({
        Id: T_CATEGORIES,
        Name: 'categories',
        Comment: '상품 카테고리',
        X: 40,
        Y: 320,
        Columns: [
          newColumn({
            Id: C_CATEGORIES_ID,
            Name: 'id',
            DataType: 'SERIAL',
            IsPrimaryKey: true,
            IsAutoIncrement: true,
            IsNullable: false,
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222212',
            Name: 'name',
            DataType: 'VARCHAR',
            Length: 100,
            IsNullable: false,
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222213',
            Name: 'description',
            DataType: 'TEXT',
            IsNullable: true,
          }),
        ],
      }),
      newTable({
        Id: T_PRODUCTS,
        Name: 'products',
        Comment: '판매 상품',
        X: 320,
        Y: 320,
        Columns: [
          newColumn({
            Id: C_PRODUCTS_ID,
            Name: 'id',
            DataType: 'BIGSERIAL',
            IsPrimaryKey: true,
            IsAutoIncrement: true,
            IsNullable: false,
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222223',
            Name: 'name',
            DataType: 'VARCHAR',
            Length: 200,
            IsNullable: false,
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222224',
            Name: 'price',
            DataType: 'DECIMAL',
            Precision: 12,
            Scale: 2,
            IsNullable: false,
          }),
          newColumn({
            Id: C_PRODUCTS_CATEGORY_ID,
            Name: 'category_id',
            DataType: 'INTEGER',
            IsNullable: false,
            Comment: '카테고리 FK',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222225',
            Name: 'is_active',
            DataType: 'BOOLEAN',
            IsNullable: false,
            DefaultValue: 'TRUE',
          }),
        ],
      }),
      newTable({
        Id: T_ORDERS,
        Name: 'orders',
        Comment: '주문 헤더',
        X: 320,
        Y: 60,
        Columns: [
          newColumn({
            Id: C_ORDERS_ID,
            Name: 'id',
            DataType: 'BIGSERIAL',
            IsPrimaryKey: true,
            IsAutoIncrement: true,
            IsNullable: false,
          }),
          newColumn({
            Id: C_ORDERS_USER_ID,
            Name: 'user_id',
            DataType: 'BIGINT',
            IsNullable: false,
            Comment: '주문 회원 FK',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222233',
            Name: 'order_date',
            DataType: 'TIMESTAMPTZ',
            IsNullable: false,
            DefaultValue: 'NOW()',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222234',
            Name: 'status',
            DataType: 'VARCHAR',
            Length: 20,
            IsNullable: false,
            DefaultValue: "'PENDING'",
          }),
        ],
      }),
      newTable({
        Id: T_ORDER_ITEMS,
        Name: 'order_items',
        Comment: '주문 상세',
        X: 600,
        Y: 180,
        Columns: [
          newColumn({
            Id: C_ORDER_ITEMS_ID,
            Name: 'id',
            DataType: 'BIGSERIAL',
            IsPrimaryKey: true,
            IsAutoIncrement: true,
            IsNullable: false,
          }),
          newColumn({
            Id: C_ORDER_ITEMS_ORDER_ID,
            Name: 'order_id',
            DataType: 'BIGINT',
            IsNullable: false,
          }),
          newColumn({
            Id: C_ORDER_ITEMS_PRODUCT_ID,
            Name: 'product_id',
            DataType: 'BIGINT',
            IsNullable: false,
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222244',
            Name: 'quantity',
            DataType: 'INTEGER',
            IsNullable: false,
            DefaultValue: '1',
          }),
          newColumn({
            Id: '22222222-2222-2222-2222-222222222245',
            Name: 'unit_price',
            DataType: 'DECIMAL',
            Precision: 12,
            Scale: 2,
            IsNullable: false,
          }),
        ],
      }),
    ],
    Relationships: [
      newRelationship({
        Id: '33333333-3333-3333-3333-333333333301',
        Name: 'fk_products_category',
        Type: 'OneToMany',
        SourceTableId: T_CATEGORIES,
        SourceColumnId: C_CATEGORIES_ID,
        TargetTableId: T_PRODUCTS,
        TargetColumnId: C_PRODUCTS_CATEGORY_ID,
      }),
      newRelationship({
        Id: '33333333-3333-3333-3333-333333333302',
        Name: 'fk_orders_user',
        Type: 'OneToMany',
        SourceTableId: T_USERS,
        SourceColumnId: C_USERS_ID,
        TargetTableId: T_ORDERS,
        TargetColumnId: C_ORDERS_USER_ID,
      }),
      newRelationship({
        Id: '33333333-3333-3333-3333-333333333303',
        Name: 'fk_order_items_order',
        Type: 'OneToMany',
        SourceTableId: T_ORDERS,
        SourceColumnId: C_ORDERS_ID,
        TargetTableId: T_ORDER_ITEMS,
        TargetColumnId: C_ORDER_ITEMS_ORDER_ID,
      }),
      newRelationship({
        Id: '33333333-3333-3333-3333-333333333304',
        Name: 'fk_order_items_product',
        Type: 'OneToMany',
        SourceTableId: T_PRODUCTS,
        SourceColumnId: C_PRODUCTS_ID,
        TargetTableId: T_ORDER_ITEMS,
        TargetColumnId: C_ORDER_ITEMS_PRODUCT_ID,
      }),
    ],
  };
}
