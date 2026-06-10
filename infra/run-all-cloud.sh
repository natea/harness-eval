#!/usr/bin/env bash
# Cloud orchestrator entrypoint: builds the remaining 3 candidates (n=1),
# grades each with the subscription CC driver, and writes the combined
# report. Runs detached inside the harness-eval-orchestrator Daytona
# sandbox; progress lands in orchestrator.log.
set -uo pipefail
cd /home/ubuntu/harness-eval
set -a; source .env; set +a

echo "=== [$(date -u +%FT%TZ)] BUILD PHASE ==="
bun run src/cli.ts run \
  --candidates superpowers,compound-engineering,agent-skills \
  --trials 1 --provider daytona --concurrency 1

D=$(ls -dt runs/run-* | head -1)
echo "=== [$(date -u +%FT%TZ)] GRADE PHASE ($D) ==="
for t in superpowers-t1 compound-engineering-t1 agent-skills-t1; do
  if [ -d "$D/trials/$t/workspace" ]; then
    echo "--- grading $t ---"
    bun scripts/grade-trial.ts "$D" "$t" --driver cc
  else
    echo "--- $t: no workspace archived; skipping grade ---"
  fi
done

echo "=== [$(date -u +%FT%TZ)] REPORT ==="
bun run src/cli.ts report "$D"
echo "=== ALL-DONE ==="
