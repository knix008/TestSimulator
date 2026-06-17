using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Sample;

internal static class SampleSchemaFactory
{
	public static DbSchema CreateOnlineShop()
	{
		Guid guid = Guid.Parse("11111111-1111-1111-1111-111111111101");
		Guid guid2 = Guid.Parse("11111111-1111-1111-1111-111111111102");
		Guid guid3 = Guid.Parse("11111111-1111-1111-1111-111111111103");
		Guid guid4 = Guid.Parse("11111111-1111-1111-1111-111111111104");
		Guid guid5 = Guid.Parse("11111111-1111-1111-1111-111111111105");
		Guid guid6 = Guid.Parse("22222222-2222-2222-2222-222222222201");
		Guid id = Guid.Parse("22222222-2222-2222-2222-222222222202");
		Guid guid7 = Guid.Parse("22222222-2222-2222-2222-222222222211");
		Guid guid8 = Guid.Parse("22222222-2222-2222-2222-222222222221");
		Guid guid9 = Guid.Parse("22222222-2222-2222-2222-222222222222");
		Guid guid10 = Guid.Parse("22222222-2222-2222-2222-222222222231");
		Guid guid11 = Guid.Parse("22222222-2222-2222-2222-222222222232");
		Guid id2 = Guid.Parse("22222222-2222-2222-2222-222222222241");
		Guid guid12 = Guid.Parse("22222222-2222-2222-2222-222222222242");
		Guid guid13 = Guid.Parse("22222222-2222-2222-2222-222222222243");
		DbSchema obj = new DbSchema
		{
			Name = "OnlineShop",
			TargetDb = DbTargetType.PostgreSQL
		};
		int num = 5;
		List<DbTable> list = new List<DbTable>(num);
		CollectionsMarshal.SetCount(list, num);
		Span<DbTable> span = CollectionsMarshal.AsSpan(list);
		ref DbTable reference = ref span[0];
		DbTable obj2 = new DbTable
		{
			Id = guid,
			Name = "users",
			Comment = "회원 정보",
			X = 40f,
			Y = 60f
		};
		int num2 = 4;
		List<DbColumn> list2 = new List<DbColumn>(num2);
		CollectionsMarshal.SetCount(list2, num2);
		Span<DbColumn> span2 = CollectionsMarshal.AsSpan(list2);
		span2[0] = new DbColumn
		{
			Id = guid6,
			Name = "id",
			DataType = "BIGSERIAL",
			IsPrimaryKey = true,
			IsAutoIncrement = true,
			IsNullable = false,
			Comment = "회원 ID"
		};
		span2[1] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222203"),
			Name = "username",
			DataType = "VARCHAR",
			Length = 50,
			IsNullable = false,
			Comment = "로그인 이름"
		};
		span2[2] = new DbColumn
		{
			Id = id,
			Name = "email",
			DataType = "VARCHAR",
			Length = 255,
			IsNullable = false,
			IsUnique = true,
			Comment = "이메일"
		};
		span2[3] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222204"),
			Name = "created_at",
			DataType = "TIMESTAMPTZ",
			IsNullable = false,
			DefaultValue = "NOW()"
		};
		obj2.Columns = list2;
		reference = obj2;
		ref DbTable reference2 = ref span[1];
		DbTable obj3 = new DbTable
		{
			Id = guid2,
			Name = "categories",
			Comment = "상품 카테고리",
			X = 40f,
			Y = 320f
		};
		num2 = 3;
		List<DbColumn> list3 = new List<DbColumn>(num2);
		CollectionsMarshal.SetCount(list3, num2);
		Span<DbColumn> span3 = CollectionsMarshal.AsSpan(list3);
		span3[0] = new DbColumn
		{
			Id = guid7,
			Name = "id",
			DataType = "SERIAL",
			IsPrimaryKey = true,
			IsAutoIncrement = true,
			IsNullable = false
		};
		span3[1] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222212"),
			Name = "name",
			DataType = "VARCHAR",
			Length = 100,
			IsNullable = false
		};
		span3[2] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222213"),
			Name = "description",
			DataType = "TEXT",
			IsNullable = true
		};
		obj3.Columns = list3;
		reference2 = obj3;
		ref DbTable reference3 = ref span[2];
		DbTable obj4 = new DbTable
		{
			Id = guid3,
			Name = "products",
			Comment = "판매 상품",
			X = 320f,
			Y = 320f
		};
		num2 = 5;
		List<DbColumn> list4 = new List<DbColumn>(num2);
		CollectionsMarshal.SetCount(list4, num2);
		Span<DbColumn> span4 = CollectionsMarshal.AsSpan(list4);
		span4[0] = new DbColumn
		{
			Id = guid8,
			Name = "id",
			DataType = "BIGSERIAL",
			IsPrimaryKey = true,
			IsAutoIncrement = true,
			IsNullable = false
		};
		span4[1] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222223"),
			Name = "name",
			DataType = "VARCHAR",
			Length = 200,
			IsNullable = false
		};
		span4[2] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222224"),
			Name = "price",
			DataType = "DECIMAL",
			Precision = 12,
			Scale = 2,
			IsNullable = false
		};
		span4[3] = new DbColumn
		{
			Id = guid9,
			Name = "category_id",
			DataType = "INTEGER",
			IsNullable = false,
			Comment = "카테고리 FK"
		};
		span4[4] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222225"),
			Name = "is_active",
			DataType = "BOOLEAN",
			IsNullable = false,
			DefaultValue = "TRUE"
		};
		obj4.Columns = list4;
		reference3 = obj4;
		ref DbTable reference4 = ref span[3];
		DbTable obj5 = new DbTable
		{
			Id = guid4,
			Name = "orders",
			Comment = "주문 헤더",
			X = 320f,
			Y = 60f
		};
		num2 = 4;
		List<DbColumn> list5 = new List<DbColumn>(num2);
		CollectionsMarshal.SetCount(list5, num2);
		Span<DbColumn> span5 = CollectionsMarshal.AsSpan(list5);
		span5[0] = new DbColumn
		{
			Id = guid10,
			Name = "id",
			DataType = "BIGSERIAL",
			IsPrimaryKey = true,
			IsAutoIncrement = true,
			IsNullable = false
		};
		span5[1] = new DbColumn
		{
			Id = guid11,
			Name = "user_id",
			DataType = "BIGINT",
			IsNullable = false,
			Comment = "주문 회원 FK"
		};
		span5[2] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222233"),
			Name = "order_date",
			DataType = "TIMESTAMPTZ",
			IsNullable = false,
			DefaultValue = "NOW()"
		};
		span5[3] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222234"),
			Name = "status",
			DataType = "VARCHAR",
			Length = 20,
			IsNullable = false,
			DefaultValue = "'PENDING'"
		};
		obj5.Columns = list5;
		reference4 = obj5;
		ref DbTable reference5 = ref span[4];
		DbTable obj6 = new DbTable
		{
			Id = guid5,
			Name = "order_items",
			Comment = "주문 상세",
			X = 600f,
			Y = 180f
		};
		num2 = 5;
		List<DbColumn> list6 = new List<DbColumn>(num2);
		CollectionsMarshal.SetCount(list6, num2);
		Span<DbColumn> span6 = CollectionsMarshal.AsSpan(list6);
		span6[0] = new DbColumn
		{
			Id = id2,
			Name = "id",
			DataType = "BIGSERIAL",
			IsPrimaryKey = true,
			IsAutoIncrement = true,
			IsNullable = false
		};
		span6[1] = new DbColumn
		{
			Id = guid12,
			Name = "order_id",
			DataType = "BIGINT",
			IsNullable = false
		};
		span6[2] = new DbColumn
		{
			Id = guid13,
			Name = "product_id",
			DataType = "BIGINT",
			IsNullable = false
		};
		span6[3] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222244"),
			Name = "quantity",
			DataType = "INTEGER",
			IsNullable = false,
			DefaultValue = "1"
		};
		span6[4] = new DbColumn
		{
			Id = Guid.Parse("22222222-2222-2222-2222-222222222245"),
			Name = "unit_price",
			DataType = "DECIMAL",
			Precision = 12,
			Scale = 2,
			IsNullable = false
		};
		obj6.Columns = list6;
		reference5 = obj6;
		obj.Tables = list;
		num = 4;
		List<DbRelationship> list7 = new List<DbRelationship>(num);
		CollectionsMarshal.SetCount(list7, num);
		Span<DbRelationship> span7 = CollectionsMarshal.AsSpan(list7);
		span7[0] = new DbRelationship
		{
			Id = Guid.Parse("33333333-3333-3333-3333-333333333301"),
			Name = "fk_products_category",
			Type = RelationshipType.OneToMany,
			SourceTableId = guid2,
			SourceColumnId = guid7,
			TargetTableId = guid3,
			TargetColumnId = guid9
		};
		span7[1] = new DbRelationship
		{
			Id = Guid.Parse("33333333-3333-3333-3333-333333333302"),
			Name = "fk_orders_user",
			Type = RelationshipType.OneToMany,
			SourceTableId = guid,
			SourceColumnId = guid6,
			TargetTableId = guid4,
			TargetColumnId = guid11
		};
		span7[2] = new DbRelationship
		{
			Id = Guid.Parse("33333333-3333-3333-3333-333333333303"),
			Name = "fk_order_items_order",
			Type = RelationshipType.OneToMany,
			SourceTableId = guid4,
			SourceColumnId = guid10,
			TargetTableId = guid5,
			TargetColumnId = guid12
		};
		span7[3] = new DbRelationship
		{
			Id = Guid.Parse("33333333-3333-3333-3333-333333333304"),
			Name = "fk_order_items_product",
			Type = RelationshipType.OneToMany,
			SourceTableId = guid3,
			SourceColumnId = guid8,
			TargetTableId = guid5,
			TargetColumnId = guid13
		};
		obj.Relationships = list7;
		return obj;
	}
}
