#!/usr/bin/env bash
#
# KAVACH — redeploy the web app to Snowpark Container Services.
#
#   ./deploy/redeploy.sh            build -> push -> ALTER SERVICE -> wait -> print URL
#   ./deploy/redeploy.sh build      build the image locally only
#   ./deploy/redeploy.sh push       docker login + push only (assumes image exists)
#   ./deploy/redeploy.sh spec       ALTER SERVICE from deploy/spec.yaml only (no image work)
#   ./deploy/redeploy.sh status     service + pool + endpoint status (cheap)
#   ./deploy/redeploy.sh logs [n]   tail container logs
#   ./deploy/redeploy.sh url        print the public ingress URL
#   ./deploy/redeploy.sh suspend    suspend service AND compute pool (stops credit burn)
#   ./deploy/redeploy.sh resume     resume pool then service
#   ./deploy/redeploy.sh create     FIRST DEPLOY ONLY — creates the service
#
# Credits: this account is nearly exhausted. A full redeploy costs roughly one
# XS-node hour of compute pool time plus the warehouse seconds for the polling
# queries. `spec` is far cheaper than a full run when only spec.yaml changed, and
# `suspend` takes the pool to zero when you are done for the day.
#
# Read DEPLOY.md before your first run.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

# --- configuration -----------------------------------------------------------
# Overridable so a new operator on a different Snowflake account does not have to
# edit this file — export these and everything downstream follows.
REGISTRY="${KAVACH_REGISTRY:-zjxsmhi-bu67728.registry.snowflakecomputing.com}"
IMAGE_PATH="${KAVACH_IMAGE_PATH:-kavach_db/app/kavach_repo/kavach-web}"
IMAGE="$REGISTRY/$IMAGE_PATH:latest"
# The interpreter that actually has snowflake-snowpark-python installed. The
# system python3 on this machine does not.
PY="${KAVACH_PY:-/Library/Frameworks/Python.framework/Versions/3.12/bin/python3}"
SNOWCTL="$PY $REPO/deploy/snowctl.py"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
need_env() {
  [[ -f "$REPO/backend/.env" ]] || die "backend/.env not found — see DEPLOY.md §Credentials"
  # shellcheck disable=SC1091
  set -a; source "$REPO/backend/.env"; set +a
  [[ -n "${SNOWFLAKE_USER:-}" && -n "${SNOWFLAKE_PASSWORD:-}" ]] \
    || die "backend/.env must define SNOWFLAKE_USER and SNOWFLAKE_PASSWORD"
}

need_python() {
  [[ -x "$PY" ]] || die "python not found at $PY — export KAVACH_PY=/path/to/python3"
  "$PY" -c 'import snowflake.snowpark, dotenv' 2>/dev/null \
    || die "$PY lacks deps — run: $PY -m pip install snowflake-snowpark-python python-dotenv"
}

need_docker() {
  # Docker Desktop is not installed here; the daemon is colima, and brew is not
  # on a non-interactive PATH by default.
  [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
  command -v docker >/dev/null || die "docker not on PATH"
  docker info >/dev/null 2>&1 || die "docker daemon unreachable — run: colima start"
}

# --- steps -------------------------------------------------------------------
do_build() {
  need_docker
  bold "==> building $IMAGE"
  # SPCS nodes are x86_64. Building on Apple silicon without --platform produces
  # an arm64 image that pushes fine and then crash-loops on the node.
  docker build --platform linux/amd64 -t "$IMAGE" "$REPO"
}

do_push() {
  need_docker; need_env
  bold "==> pushing to $REGISTRY"
  # `snow spcs image-registry login` is the documented path but the snow CLI is
  # absent, so authenticate to the registry with the service user directly.
  printf '%s' "$SNOWFLAKE_PASSWORD" | docker login "$REGISTRY" -u "$SNOWFLAKE_USER" --password-stdin
  docker push "$IMAGE"
}

do_spec() {
  need_python; need_env
  bold "==> ALTER SERVICE from deploy/spec.yaml"
  # Always ALTER. Never DROP + CREATE: the ingress URL is allocated at creation
  # time, so recreating the service breaks the live link published in README.md.
  $SNOWCTL alter
}

do_wait() { need_python; need_env; bold "==> waiting for rollout"; $SNOWCTL wait "${1:-600}"; }
do_url()  { need_python; need_env; $SNOWCTL url; }

# --- entrypoint --------------------------------------------------------------
case "${1:-all}" in
  all)
    do_build; do_push; do_spec; do_wait
    bold "==> live at $($SNOWCTL url)"
    echo "Sign in with a Snowflake user on this account, then the app persona (see DEPLOY.md)."
    ;;
  build)   do_build ;;
  push)    do_push ;;
  spec)    do_spec; do_wait ;;
  create)  need_python; need_env; $SNOWCTL create; do_wait; do_url ;;
  wait)    do_wait "${2:-600}" ;;
  url)     do_url ;;
  status)  need_python; need_env; $SNOWCTL status ;;
  logs)    need_python; need_env; $SNOWCTL logs "${2:-200}" ;;
  suspend) need_python; need_env; $SNOWCTL suspend ;;
  resume)  need_python; need_env; $SNOWCTL resume; do_wait ;;
  -h|--help|help) sed -n '2,30p' "$0" ;;
  *) die "unknown command '$1' — run: ./deploy/redeploy.sh --help" ;;
esac
