#!/bin/sh
# Runs on the VPS every 2 minutes (prepboard-autodeploy.timer).
# If GitHub's main branch has new commits, pull them and rebuild. Otherwise do nothing.
set -eu
cd /opt/prepboard

# Never run two deploys at once (a rebuild can take a few minutes).
exec 9>/tmp/prepboard-autodeploy.lock
flock -n 9 || exit 0

git fetch -q origin main
local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse origin/main)
[ "$local_rev" = "$remote_rev" ] && exit 0

echo "$(date -Is) deploying ${remote_rev} (was ${local_rev})"
git pull --ff-only -q origin main
docker compose up -d --build
docker image prune -f --filter label=com.docker.compose.project=prepboard > /dev/null
echo "$(date -Is) deployed $(git log -1 --format='%h %s')"
