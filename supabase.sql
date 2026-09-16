-- ============================================================
-- مهرشاپ — ساختار دیتابیس Supabase
-- این فایل را در SQL Editor پروژه Supabase اجرا کنید
-- ============================================================

-- جدول محصولات
create table if not exists products (
  id bigint primary key,
  name text not null,
  price integer not null,
  stock integer default 0,
  cat text not null,
  emoji text default '📦',
  desc text default '',
  views integer default 0,
  sold integer default 0,
  created_at timestamp default now()
);

-- جدول سفارش‌ها
create table if not exists orders (
  id bigint primary key,
  date text,
  user_name text,
  items jsonb,
  total integer,
  discount integer default 0,
  created_at timestamp default now()
);

-- جدول کدهای تخفیف
create table if not exists coupons (
  id serial primary key,
  code text unique not null,
  percent integer not null,
  active boolean default true,
  created_at timestamp default now()
);

-- جدول نظرات
create table if not exists reviews (
  id serial primary key,
  product_id bigint references products(id) on delete cascade,
  user_name text,
  stars integer check (stars between 1 and 5),
  text text,
  date text,
  created_at timestamp default now()
);

-- جدول علاقه‌مندی‌ها
create table if not exists wishlist (
  id serial primary key,
  user_email text,
  product_id bigint references products(id) on delete cascade,
  created_at timestamp default now(),
  unique(user_email, product_id)
);

-- ============================================================
-- دسترسی عمومی (Row Level Security)
-- ============================================================
alter table products  enable row level security;
alter table orders    enable row level security;
alter table coupons   enable row level security;
alter table reviews   enable row level security;
alter table wishlist  enable row level security;

-- محصولات: همه بخوانند، فقط لاگین‌شده‌ها بنویسند
create policy "products_read"  on products for select using (true);
create policy "products_write" on products for all    using (true);

-- سفارش‌ها: همه بخوانند و بنویسند (برای نسخه ساده)
create policy "orders_read"  on orders for select using (true);
create policy "orders_write" on orders for insert with check (true);

-- نظرات
create policy "reviews_read"  on reviews for select using (true);
create policy "reviews_write" on reviews for insert with check (true);

-- علاقه‌مندی
create policy "wish_read"  on wishlist for select using (true);
create policy "wish_write" on wishlist for all    using (true);

-- کدهای تخفیف
create policy "coupons_read"  on coupons for select using (true);
create policy "coupons_write" on coupons for all    using (true);
