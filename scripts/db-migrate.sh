#!/usr/bin/env bash
# supabase/migrations/ 의 새 파일을 운영 DB에 적용한다 (GitHub Actions: .github/workflows/db-migrate.yml).
# 필요한 것: 환경 변수 SUPABASE_DB_URL (Supabase > Connect > Session pooler 연결 문자열, 비밀번호 포함)
# 적용한 파일은 운영 DB의 supabase_migrations.schema_migrations 에 기록되어, 같은 파일을 두 번 적용하지 않는다.
# 파일 하나가 실패하면 그 파일은 통째로 되돌아가고 작업이 실패로 끝난다 (다음 파일도 적용하지 않음).
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL 이 없어요 (GitHub 저장소 Settings > Secrets and variables > Actions)}"

CLI=(npx -y supabase@2.58.5)
q() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -tAc "$1"; }

# 처음 한 번만: 자동 적용 전에 SQL Editor 로 손으로 적용해 온 0001~0010 을 "적용됨"으로 표시한다.
# 기록이 하나도 없는데 0010 의 함수가 이미 있으면 = 손으로 0010 까지 적용한 운영 DB.
# (새로 만든 빈 DB 라면 기록도 함수도 없으니 0001 부터 차례로 적용된다.)
recorded=0
if [ "$(q "select to_regclass('supabase_migrations.schema_migrations') is not null")" = "t" ]; then
  recorded=$(q "select count(*) from supabase_migrations.schema_migrations")
fi
has_0010=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'replace_my_script'")
if [ "$recorded" = "0" ] && [ "$has_0010" != "0" ]; then
  echo "처음 실행: 손으로 적용해 둔 0001~0010 을 '적용됨'으로 표시합니다."
  "${CLI[@]}" migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 --db-url "$SUPABASE_DB_URL"
fi

"${CLI[@]}" db push --db-url "$SUPABASE_DB_URL" --yes
"${CLI[@]}" migration list --db-url "$SUPABASE_DB_URL"
