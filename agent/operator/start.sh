#!/bin/sh
# PROCESS=rounds (default) runs the round operator, PROCESS=prices runs the price relay.
set -e
case "${PROCESS:-rounds}" in
  rounds) exec bun run src/run-rounds.ts ;;
  prices) exec bun run src/post-prices.ts ;;
  *) echo "PROCESS must be 'rounds' or 'prices' (got '${PROCESS}')" >&2; exit 1 ;;
esac
