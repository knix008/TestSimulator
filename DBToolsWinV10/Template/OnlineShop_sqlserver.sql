-- OnlineShop sample (SQL Server)
CREATE TABLE [users] (
    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [username] NVARCHAR(50) NOT NULL,
    [email] NVARCHAR(255) NOT NULL UNIQUE,
    [created_at] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE TABLE [categories] (
    [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(MAX) NULL
);

CREATE TABLE [products] (
    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [name] NVARCHAR(200) NOT NULL,
    [price] DECIMAL(12,2) NOT NULL,
    [category_id] INT NOT NULL,
    [is_active] BIT NOT NULL DEFAULT 1
);

CREATE TABLE [orders] (
    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [user_id] BIGINT NOT NULL,
    [order_date] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [status] NVARCHAR(20) NOT NULL DEFAULT N'PENDING'
);

CREATE TABLE [order_items] (
    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [order_id] BIGINT NOT NULL,
    [product_id] BIGINT NOT NULL,
    [quantity] INT NOT NULL DEFAULT 1,
    [unit_price] DECIMAL(12,2) NOT NULL
);

ALTER TABLE [products] ADD CONSTRAINT [fk_products_category]
    FOREIGN KEY ([category_id]) REFERENCES [categories]([id]);

ALTER TABLE [orders] ADD CONSTRAINT [fk_orders_user]
    FOREIGN KEY ([user_id]) REFERENCES [users]([id]);

ALTER TABLE [order_items] ADD CONSTRAINT [fk_order_items_order]
    FOREIGN KEY ([order_id]) REFERENCES [orders]([id]);

ALTER TABLE [order_items] ADD CONSTRAINT [fk_order_items_product]
    FOREIGN KEY ([product_id]) REFERENCES [products]([id]);