#!/usr/bin/env bash
# Consistent backup of the player database (safe while the game is running), keeping the newest 14.
#
#   ./scripts/backup.sh            # run from the folder with docker-compose.yml; add to cron (see DEPLOY.md)
#
# Backups are written inside the data volume (/data/backups). Copy them off the server too (DEPLOY.md, "Backups").
set -euo pipefail

SERVICE="${1:-cyberstation}"
docker compose exec -T "$SERVICE" node -e "
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs');
  const dir = '/data/backups';
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const db = new DatabaseSync('/data/cyberstation.db');
  db.exec(\"VACUUM INTO '\" + dir + '/cyberstation-' + stamp + \".db'\");
  db.close();
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().slice(0, -14);
  for (const f of old) fs.unlinkSync(dir + '/' + f);
  console.log('backed up to ' + dir + '/cyberstation-' + stamp + '.db (' + old.length + ' old removed)');
"
