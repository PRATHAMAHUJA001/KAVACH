#!/usr/bin/env bash
# Verify the KAVACH Snowflake-managed MCP server end to end.
#
# Lists the tools, then invokes both of them, over plain JSON-RPC against the
# Snowflake REST endpoint -- no MCP client or SDK needed.
#
# Usage:
#   KAVACH_MCP_PAT=<token> scripts/mcp_smoke_test.sh
#   scripts/mcp_smoke_test.sh            # reads the token from ~/.kavach_mcp_pat
#
# Mint the token with (see sql/14_mcp_server.sql):
#   ALTER USER <user> ADD PROGRAMMATIC ACCESS TOKEN KAVACH_MCP_PAT
#     ROLE_RESTRICTION = 'KAVACH_MCP_ROLE' DAYS_TO_EXPIRY = 90;
#
# Never commit the token. This script only ever reads it from the environment or
# from a file outside the repository.
set -uo pipefail

ACCOUNT="${KAVACH_ACCOUNT:-onfhcci-tv84204}"
URL="https://${ACCOUNT}.snowflakecomputing.com/api/v2/databases/KAVACH_DB/schemas/AI/mcp-servers/KAVACH_MCP"
TOKEN_FILE="${KAVACH_MCP_PAT_FILE:-$HOME/.kavach_mcp_pat}"

PAT="${KAVACH_MCP_PAT:-}"
if [[ -z "$PAT" && -r "$TOKEN_FILE" ]]; then
  PAT="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi
if [[ -z "$PAT" ]]; then
  echo "No token. Set KAVACH_MCP_PAT, or put one in $TOKEN_FILE" >&2
  exit 2
fi

call() {
  curl -s --max-time 300 -X POST "$URL" \
    -H "Authorization: Bearer $PAT" \
    -H "X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$1"
}

# tools/call responses are Server-Sent Events; take the last data: frame and
# unwrap the JSON-RPC envelope.
python_unwrap() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
frames = [l[6:] for l in raw.splitlines()
          if l.startswith("data: ") and l[6:].strip() not in ("[DONE]", "")]
body = json.loads(frames[-1]) if frames else json.loads(raw)
if "error" in body:
    print("ERROR:", json.dumps(body["error"])[:400]); sys.exit(1)
res = body.get("result", {})
if "tools" in res:
    for t in res["tools"]:
        print("  %-18s %s" % (t["name"], t["title"]))
    sys.exit(0)
print("  isError:", res.get("isError"))
text = res.get("content", [{}])[0].get("text", "")
try:
    inner = json.loads(text)
except json.JSONDecodeError:
    print("  " + text[:600]); sys.exit(0)
if isinstance(inner, list):                      # search hits
    for hit in inner[:2]:
        print("  hit:", str(hit.get("TEXT", hit))[:220])
    sys.exit(0)
blocks = [b for b in inner.get("content", []) if b.get("type") == "text"]
print("  status:", inner.get("status"), "| blocks:", len(inner.get("content", [])))
for b in blocks[-2:]:
    print("  answer:", " ".join(b["text"].split())[:400])
'
}

fail=0
step() {
  echo
  echo "== $1"
  shift
  if ! call "$1" | python_unwrap; then fail=1; fi
}

echo "MCP server: $URL"

step "tools/list" \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

step "tools/call kavach_reg_search -- what the circulars say" \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"kavach_reg_search","arguments":{"query":"cash transaction reporting threshold","limit":2}}}'

step "tools/call kavach_agent -- a question about the bank's own data (~1 min)" \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kavach_agent","arguments":{"text":"How many alerts are there in total, broken down by typology?"}}}'

echo
if [[ $fail -eq 0 ]]; then
  echo "MCP smoke test: PASS"
else
  echo "MCP smoke test: FAIL"
fi
exit $fail
