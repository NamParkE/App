-- 테스트용: Supabase 가 미리 만들어 두는 것 중 마이그레이션이 기대는 부분만 흉내 낸다 (역할 · auth 스키마).
-- 실제 Supabase 에서는 실행하지 않는다 (scripts/db-test.sh 가 빈 테스트 DB 에만 쓴다).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
-- Supabase 의 auth.uid() 처럼 요청의 로그인 정보(request.jwt.claim.sub)를 읽는다
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- 테스트 도우미: 조건이 거짓이면 실패
create schema if not exists test;
grant usage on schema test to public;
create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'TEST FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function test.ok(boolean, text) to public;
