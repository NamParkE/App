#!/usr/bin/env bash
# DB 테스트: 빈 테스트 DB 를 새로 만들어 마이그레이션 0001 부터 끝까지 적용하고, supabase/tests/ 의 테스트를 돌린다.
# 필요한 것: psql, 그리고 테스트용 Postgres 의 관리자 연결 문자열 TEST_DATABASE_URL (운영 DB 를 넣지 마세요)
#   예) TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres ./scripts/db-test.sh
# 테스트 파일은 각각 begin ... rollback 안에서 돌아 서로 영향을 주지 않는다.
set -euo pipefail
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL 이 없어요 (테스트용 Postgres)}"
cd "$(dirname "$0")/.."

DB=apptest_$$
ADMIN_URL="$TEST_DATABASE_URL"
TEST_URL="${TEST_DATABASE_URL%/*}/$DB"
psql "$ADMIN_URL" -qX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qX -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true' EXIT

run() { PGOPTIONS="-c client_min_messages=warning" psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 "$@"; }

echo "== Supabase 흉내 (역할 · auth)"
run -f supabase/tests/_stub.sql >/dev/null

echo "== 마이그레이션 적용"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  run -f "$f" >/dev/null
done
run -f supabase/tests/_fixtures.sql >/dev/null

failed=0
for t in supabase/tests/[0-9]*.sql; do
  echo "== $t"
  # NOTICE(ok - …)만 보여 주고, 실패하면 그 파일 이름과 오류를 남긴다
  if ! out=$( { echo "begin;"; cat "$t"; echo "rollback;"; } | psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f - 2>&1 ); then
    echo "$out" | grep -E "NOTICE|ERROR|TEST FAILED" | sed 's/^psql:[^ ]* //'
    echo "   ✗ 실패: $t"
    failed=1
  else
    echo "$out" | grep -E "NOTICE:  ok - " | sed 's/.*NOTICE:  /   /'
  fi
done

if [ "$failed" = 1 ]; then echo "DB 테스트 실패"; exit 1; fi
echo "DB 테스트 통과"
