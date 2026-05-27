-- =============================================
-- LineHub Database Schema
-- =============================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- =============================================
-- FRIENDS (友だち管理)
-- =============================================
create table if not exists friends (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('line', 'instagram', 'email')),
  platform_user_id text not null,         -- LINE userId / Instagram userId etc.
  display_name text,
  picture_url text,
  email text,
  phone text,
  note text,
  status text default 'active' check (status in ('active', 'blocked', 'deleted')),
  followed_at timestamptz default now(),
  last_interacted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (platform, platform_user_id)
);

-- =============================================
-- TAGS (タグ管理)
-- =============================================
create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text default '#6366f1',
  created_at timestamptz default now()
);

create table if not exists friend_tags (
  friend_id uuid references friends(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (friend_id, tag_id)
);

-- =============================================
-- SCENARIOS (シナリオ配信)
-- =============================================
create table if not exists scenarios (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  platform text not null check (platform in ('line', 'instagram', 'email', 'all')),
  trigger_type text not null check (trigger_type in ('friend_added', 'keyword', 'tag_added', 'manual')),
  trigger_keyword text,                   -- keyword trigger の場合
  trigger_tag_id uuid references tags(id),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists scenario_steps (
  id uuid primary key default uuid_generate_v4(),
  scenario_id uuid references scenarios(id) on delete cascade,
  step_order int not null,
  delay_days int default 0,              -- 前ステップから何日後
  delay_hours int default 0,
  message_type text not null check (message_type in ('text', 'image', 'flex', 'template')),
  message_content jsonb not null,        -- メッセージ内容（LINE形式のJSON）
  created_at timestamptz default now()
);

-- 各友だちのシナリオ進行状況
create table if not exists scenario_subscribers (
  id uuid primary key default uuid_generate_v4(),
  scenario_id uuid references scenarios(id) on delete cascade,
  friend_id uuid references friends(id) on delete cascade,
  current_step int default 0,
  started_at timestamptz default now(),
  next_send_at timestamptz,
  status text default 'active' check (status in ('active', 'completed', 'stopped')),
  unique (scenario_id, friend_id)
);

-- =============================================
-- BROADCASTS (一斉配信)
-- =============================================
create table if not exists broadcasts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  platform text not null check (platform in ('line', 'instagram', 'email', 'all')),
  message_type text not null check (message_type in ('text', 'image', 'flex', 'template')),
  message_content jsonb not null,
  target_type text default 'all' check (target_type in ('all', 'tag', 'segment')),
  target_tag_ids uuid[],                 -- タグで絞り込む場合
  status text default 'draft' check (status in ('draft', 'scheduled', 'sending', 'done', 'error')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_targets int default 0,
  sent_count int default 0,
  error_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- RICH MENUS (リッチメニュー)
-- =============================================
create table if not exists rich_menus (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  line_rich_menu_id text,               -- LINE側のID（API登録後に設定）
  size_width int default 2500,
  size_height int default 1686,
  selected boolean default true,
  chat_bar_text text default 'メニュー',
  areas jsonb not null default '[]',    -- タップ領域の設定
  image_url text,                       -- アップロードされた画像URL
  is_default boolean default false,
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================
-- MESSAGE LOGS (送信履歴)
-- =============================================
create table if not exists message_logs (
  id uuid primary key default uuid_generate_v4(),
  friend_id uuid references friends(id) on delete set null,
  platform text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text,
  message_content jsonb,
  source_type text check (source_type in ('scenario', 'broadcast', 'manual', 'webhook')),
  source_id uuid,                        -- scenario_id or broadcast_id
  status text default 'sent',
  error_message text,
  sent_at timestamptz default now()
);

-- =============================================
-- ANALYTICS (統計用ビュー)
-- =============================================
create or replace view analytics_summary as
select
  date_trunc('day', sent_at) as date,
  platform,
  direction,
  count(*) as message_count,
  count(distinct friend_id) as unique_friends
from message_logs
group by 1, 2, 3;

-- =============================================
-- INDEXES
-- =============================================
create index if not exists idx_friends_platform on friends(platform);
create index if not exists idx_friends_status on friends(status);
create index if not exists idx_scenario_subscribers_next_send on scenario_subscribers(next_send_at) where status = 'active';
create index if not exists idx_message_logs_friend on message_logs(friend_id);
create index if not exists idx_message_logs_sent_at on message_logs(sent_at);

-- =============================================
-- FUNCTIONS
-- =============================================

-- 友だち数を返す関数
create or replace function get_friend_count(p_platform text default null)
returns bigint as $$
  select count(*) from friends
  where status = 'active'
    and (p_platform is null or platform = p_platform);
$$ language sql stable;

-- updated_at を自動更新するトリガー
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger friends_updated_at before update on friends for each row execute function update_updated_at();
create trigger scenarios_updated_at before update on scenarios for each row execute function update_updated_at();
create trigger broadcasts_updated_at before update on broadcasts for each row execute function update_updated_at();
create trigger rich_menus_updated_at before update on rich_menus for each row execute function update_updated_at();
