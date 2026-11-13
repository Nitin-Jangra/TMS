#!/usr/bin/env bash
# Verifies role-based dashboard behaviour over the live API:
#  1. Support agent sees branch-wide tickets (incl. other agents' + unassigned)
#    but never tickets from other branches.
#  2. mine=true narrows to the agent's own work queue.
#  3. Branch manager sees branch-wide tickets.
#  4. Root admin sees the whole tenant.
#  5. Customer pages expose the Complaint entry point.
set -u
BASE="http://localhost:3000"
J=/tmp/fcms-jars
rm -rf "$J" && mkdir -p "$J"

login() { # email password jarfile
  curl -s -c "$J/$3" -X POST "$BASE/api/v1/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['user']['role'], d['data']['user']['roleHome'], d['data']['user'].get('branchName'))"
}

tickets_total() { # jarfile extra-query
  curl -s -b "$J/$1" "$BASE/api/v1/support/tickets?$2" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['total'])"
}

ticket_branches() { # jarfile extra-query
  curl -s -b "$J/$1" "$BASE/api/v1/support/tickets?$2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
seen={}
for t in d['data']['tickets']:
    seen[t['branch']['name']]=seen.get(t['branch']['name'],0)+1
print(dict(sorted(seen.items())))"
}

summary() { # jarfile
  curl -s -b "$J/$1" "$BASE/api/v1/support/dashboard/summary" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('scope:',d['scope'],'| branch:',d.get('branchName'),'| counts:',{k:v for k,v in d['counts'].items() if k in ('NEW_COMPLAINT','IN_PROGRESS','ON_HOLD','RESOLVED','CLOSED','total','unassigned','overdue')})
if 'mine' in d: print('mine:',d['mine'])"
}

echo "== 1. Support agent (Sector 48) =="
login support.b001.a@fitclass.dev Support@123 sup1
echo -n "tickets in scope: "; tickets_total sup1 ""
echo -n "branch mix:       "; ticket_branches sup1 ""
echo -n "mine=true:        "; tickets_total sup1 "mine=true"
echo -n "branch mix mine:  "; ticket_branches sup1 "mine=true"
summary sup1

echo; echo "== 2. Support agent (Gurugram Central) cross-check =="
login support.b003.a@fitclass.dev Support@123 sup3
echo -n "tickets in scope: "; tickets_total sup3 ""
echo -n "branch mix:       "; ticket_branches sup3 ""

echo; echo "== 3. Branch manager (Sector 49) =="
login manager.b002@fitclass.dev Manager@123 mgr2
echo -n "tickets in scope: "; tickets_total mgr2 ""
echo -n "branch mix:       "; ticket_branches mgr2 ""

echo; echo "== 4. Root admin =="
login admin@fitclass.dev Admin@123 root
echo -n "tickets in scope: "; tickets_total root ""
echo -n "branch mix:       "; ticket_branches root ""
curl -s -b "$J/root" "$BASE/api/v1/admin/overview" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('overview branches:', {b['branchName']: b['total'] for b in d['branches']}, '| grand total:', d['totals']['total'])"

echo; echo "== 5. Central support admin =="
login central.admin@fitclass.dev Central@123 cadm
echo -n "tickets in scope: "; tickets_total cadm ""

echo; echo "== 6. Customer pages =="
for p in / /complaint /track; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$p"); echo "GET $p -> $code"
done
curl -s "$BASE/" | rg -o 'Complaint|Register a complaint|Track a complaint' | sort | uniq -c

echo; echo "== 7. Unauthenticated access is denied =="
curl -s -o /dev/null -w "support tickets no-auth -> %{http_code}\n" "$BASE/api/v1/support/tickets"
curl -s -o /dev/null -w "admin overview no-auth  -> %{http_code}\n" "$BASE/api/v1/admin/overview"
