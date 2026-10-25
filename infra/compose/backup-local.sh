#!/usr/bin/env bash
# Backup for a Rakazo stack started from docker-compose.images.yml (the local, install-images.sh setup).
# backup-prod.sh covers the production compose file under /srv/rakazo; this is the same idea for a laptop:
# a Postgres dump plus the appdata volume (bot homes, receipts, taught skills), verified before it is trusted.
#
#   RAKAZO_DIR   folder holding docker-compose.images.yml and .env (default: current directory)
#   BACKUP_ROOT  where snapshots go (default: $RAKAZO_DIR/backups)
#   KEEP         how many snapshots to keep (default 7)
#
# Restore (stack stopped except postgres), by hand, so nothing is overwritten by accident:
#   docker compose --env-file .env -f docker-compose.images.yml up -d postgres
#   docker compose ... exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < SNAPSHOT/rakazo.dump
#   docker run --rm -v "$(docker volume ls -q | grep appdata)":/data -v SNAPSHOT:/b:ro busybox:1 sh -c 'cd /data && tar -xzf /b/appdata.tgz'
set -euo pipefail

DIR="${RAKAZO_DIR:-$PWD}"
[[ "${DIR}" == /* ]] || { echo "RAKAZO_DIR must be an absolute path" >&2; exit 1; }
COMPOSE_FILE="${DIR}/docker-compose.images.yml"
ENV_FILE="${DIR}/.env"
[[ -f "${COMPOSE_FILE}" && -f "${ENV_FILE}" ]] || { echo "no docker-compose.images.yml and .env in ${DIR}" >&2; exit 1; }
BACKUP_ROOT="${BACKUP_ROOT:-${DIR}/backups}"
KEEP="${KEEP:-7}"
# Keeping fewer than one would let the pruning step delete the snapshot just made.
[[ "${KEEP}" =~ ^[0-9]+$ && "${KEEP}" -ge 1 ]] || { echo "KEEP must be a whole number of at least 1" >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_DIR="${BACKUP_ROOT}/${STAMP}"
umask 077
install -d -m 700 "${BACKUP_ROOT}" "${SNAPSHOT_DIR}"
# A snapshot that did not finish must not stay behind: it would count toward KEEP and push out good ones.
finished=0
cleanup() { [[ "${finished}" == 1 ]] || rm -rf -- "${SNAPSHOT_DIR}"; }
trap cleanup EXIT

compose=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

"${compose[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${SNAPSHOT_DIR}/rakazo.dump"
[[ -s "${SNAPSHOT_DIR}/rakazo.dump" ]] || { echo "the database dump is empty" >&2; exit 1; }

# Read the volume from a throwaway root container: bot homes are root-owned mode 600 and the api container cannot read them.
api="$("${compose[@]}" ps -q api)"
[[ -n "${api}" ]] || { echo "the api service is not running; cannot locate /data" >&2; exit 1; }
volume="$(docker inspect "${api}" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
[[ -n "${volume}" ]] || { echo "the api container has no named /data volume" >&2; exit 1; }
rc=0
# The archive is written by root inside the container, so its permissions are set there too.
docker run --rm -v "${volume}":/data:ro -v "${SNAPSHOT_DIR}":/out busybox:1 \
  sh -c 'umask 077; tar -czf /out/appdata.tgz -C /data .; rc=$?; chmod 600 /out/appdata.tgz; exit $rc' || rc=$?
if [[ "${rc}" -gt 1 ]]; then      # 1 = "file changed as we read it", normal on a live system
  echo "appdata archive failed with tar exit ${rc}" >&2
  exit "${rc}"
fi

"${compose[@]}" exec -T postgres pg_restore --list < "${SNAPSHOT_DIR}/rakazo.dump" >/dev/null
tar -tzf "${SNAPSHOT_DIR}/appdata.tgz" >/dev/null
(cd "${SNAPSHOT_DIR}" && shasum -a 256 rakazo.dump appdata.tgz > SHA256SUMS)
chmod 600 "${SNAPSHOT_DIR}/rakazo.dump" "${SNAPSHOT_DIR}/SHA256SUMS" 2>/dev/null || true
finished=1

# Prune only finished snapshots (they have SHA256SUMS) named like a timestamp, never anything else
# under BACKUP_ROOT, and only the ones beyond KEEP.
complete=()
while read -r candidate; do
  [[ -f "${candidate}/SHA256SUMS" ]] && complete+=("${candidate}")
done < <(ls -1d "${BACKUP_ROOT}"/20*T*Z 2>/dev/null | sort -r)
if (( ${#complete[@]} > KEEP )); then
  for old in "${complete[@]:KEEP}"; do rm -rf -- "${old}"; done
fi

echo "Verified Rakazo backup written to ${SNAPSHOT_DIR}"
