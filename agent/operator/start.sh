#!/bin/sh
# PROCESS=rounds (default) runs the round operator, PROCESS=prices runs the price relay,
# PROCESS=rewards runs the reward fulfilment loop (needs a key that holds TREASURER_ROLE; state on the volume).
set -e
case "${PROCESS:-rounds}" in
  rounds) exec bun run src/run-rounds.ts ;;
  prices) exec bun run src/post-prices.ts ;;
  rewards) exec bun run src/convert-inventory.ts --execute --loop ;;
  *) echo "PROCESS must be 'rounds', 'prices' or 'rewards' (got '${PROCESS}')" >&2; exit 1 ;;
esac
