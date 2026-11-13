#!/usr/bin/env bash
# FC-CMS hosted-deployment verification (Cloudflare Workers + D1 or any /api/v1 host).
# Usage: BASE_URL=https://fitclass-complaints.<subdomain>.workers.dev bash scripts/verify-cloudflare.sh
#
# Checks: landing page, admin login, tenant-wide ticket list, branch scoping for a
# Sector 48 support agent, integration complaint creation (round-robin), tracking,
# status flow (IN_PROGRESS -> RESOLVED), and the sweep endpoint.

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:8799}"
API_KEY="${API_KEY:-fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8}"
PASS=0; FAIL=0

check() { # name, condition (0=ok)
  if [ "$2" -eq 0 ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi
}

jqget() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "FC-CMS hosted verification against $BASE_URL"

# 1. Landing page
code=$(curl -s -o /tmp/vfc-home.html -w "%{http_code}" "$BASE_URL/")
check "GET / -> 200 (got $code)" $([ "$code" = "200" ] && echo 0 || echo 1)

# 2. Root admin login
curl -s -c /tmp/vfc-admin.txt -o /tmp/vfc-login.json -X POST "$BASE_URL/api/v1/auth/login" \
  -H "content-type: application/json" -d '{"email":"admin@fitclass.dev","password":"Admin@123"}'
role=$(jqget "['data']['user']['role']" < /tmp/vfc-login.json)
check "admin login -> ROOT_ADMIN (got $role)" $([ "$role" = "ROOT_ADMIN" ] && echo 0 || echo 1)

# 3. Tenant-wide ticket list
total=$(curl -s -b /tmp/vfc-admin.txt "$BASE_URL/api/v1/support/tickets?pageSize=100" | jqget "['data']['total']")
check "admin sees all tenants' tickets (total=${total:-0})" $([ "${total:-0}" -ge 10 ] && echo 0 || echo 1)

# 4. Branch scoping: Sector 48 agent must see only their branch
curl -s -c /tmp/vfc-agent.txt -o /dev/null -X POST "$BASE_URL/api/v1/auth/login" \
  -H "content-type: application/json" -d '{"email":"support.b001.a@fitclass.dev","password":"Support@123"}'
br48=$(curl -s -b /tmp/vfc-admin.txt "$BASE_URL/api/v1/public/branches" | python3 -c "import json,sys; print([b['id'] for b in json.load(sys.stdin)['data']['branches'] if b['code']=='BR001'][0])")
bad=$(curl -s -b /tmp/vfc-agent.txt "$BASE_URL/api/v1/support/tickets?pageSize=100" | python3 -c "
import json,sys
ts=json.load(sys.stdin)['data']['tickets']
print(len([t for t in ts if t['branchId'] != '$br48']))")
check "Sector 48 agent sees 0 tickets outside own branch (got $bad)" $([ "$bad" = "0" ] && echo 0 || echo 1)

# 5. Integration complaint creation + round-robin assignment
create=$(curl -s -X POST "$BASE_URL/api/v1/integration/complaints" \
  -H "content-type: application/json" -H "x-api-key: $API_KEY" -d "{
    \"customerName\":\"Deploy Verify\",\"customerPhone\":\"9000000001\",\"customerEmail\":\"verify@example.com\",
    \"branchId\":\"$br48\",\"categoryId\":\"$(curl -s "$BASE_URL/api/v1/public/categories" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['categories'][0]['id'])")\",
    \"description\":\"Automated deployment verification ticket\",\"priority\":\"MEDIUM\"}")
ticket_number=$(echo "$create" | jqget "['data']['ticketNumber']")
assigned=$(echo "$create" | jqget "['data']['assigned']")
check "integration complaint created + assigned (${ticket_number:-none})" $([ -n "$ticket_number" ] && [ "$assigned" = "True" ] && echo 0 || echo 1)

# 6. Customer tracking
track=$(curl -s -X POST "$BASE_URL/api/v1/public/tickets/track" \
  -H "content-type: application/json" -d "{\"ticketNumber\":\"$ticket_number\",\"mobileNumber\":\"9000000001\"}")
check "track by ticket number + mobile" $([ "$(echo "$track" | jqget "['success']")" = "True" ] && echo 0 || echo 1)

# 7. Status flow: NEW_COMPLAINT -> IN_PROGRESS -> RESOLVED
tid=$(echo "$create" | jqget "['data']['ticketId']")
[ -n "$tid" ] || tid=$(curl -s -b /tmp/vfc-admin.txt "$BASE_URL/api/v1/support/tickets?pageSize=100" | python3 -c "import json,sys; print([t['id'] for t in json.load(sys.stdin)['data']['tickets'] if t['ticketNumber']=='$ticket_number'][0])")
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/api/v1/support/tickets/$tid/status" \
  -b /tmp/vfc-admin.txt -H "content-type: application/json" -d '{"toStatus":"IN_PROGRESS","note":"verify"}')
check "status -> IN_PROGRESS ($code)" $([ "$code" = "200" ] && echo 0 || echo 1)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/support/tickets/$tid/resolve" \
  -b /tmp/vfc-admin.txt -H "content-type: application/json" -d '{"resolution":"Verified on hosted deployment."}')
check "resolve with mandatory note ($code)" $([ "$code" = "200" ] && echo 0 || echo 1)

# 8. Sweep endpoint (replaces in-process background timers on Workers)
sweep=$(curl -s -X POST "$BASE_URL/api/v1/integration/workers/run" -H "x-api-key: $API_KEY")
check "workers/run sweep endpoint" $([ "$(echo "$sweep" | jqget "['success']")" = "True" ] && echo 0 || echo 1)

# 9. Unauthenticated rejection
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/support/tickets")
check "unauthenticated API -> 401 (got $code)" $([ "$code" = "401" ] && echo 0 || echo 1)

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
