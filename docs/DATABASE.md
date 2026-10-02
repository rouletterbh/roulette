# Database (PostgreSQL + Prisma)

The database holds **offchain indexed data only**: profiles, display names, avatars, social graph, chat, leaderboards, analytics, notifications. The chain remains authoritative for custody, deposits, withdrawals, wagers, settlements, claims and chip supply.

## Setup

```bash
bun add -d prisma && bun add @prisma/client
export DATABASE_URL=postgresql://user:pass@localhost:5432/roulette   # or a Supabase connection string
bunx prisma migrate dev --name init
bunx prisma generate
```

Schema: `prisma/schema.prisma`. The `IndexedRound` / `IndexedBet` tables are a mirror of `RoundSettled` / `BetPlaced` events filled by an indexer; never write them from the app.

## Supabase

Works unchanged: use the pooled connection string for `DATABASE_URL` and the direct one for migrations (`directUrl`). Enable RLS on `Profile`, `Follow`, `ChatMessage`, `Report` if exposing them via PostgREST.
