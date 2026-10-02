// `bun test` only discovers *.test.ts / *.spec.ts; this shim makes the e2e suite part of a bare `bun test`.
// Run it directly with `bun test ./test/anvil.e2e.ts` as well.
import "./anvil.e2e";
