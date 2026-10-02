// Compile every Solidity file under src/, test/ and script/ with solc-js and
// print diagnostics. Exit code 1 on any error. Warnings are reported but allowed.
//
//   bun compile-check.mjs            # all directories
//   bun compile-check.mjs src        # only src/
//
// Imports:
//   @openzeppelin/...  -> node_modules/@openzeppelin/...
//   anything else      -> resolved relative to contracts/ (src/, test/, script/)
import solc from "solc";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

const root = dirname(new URL(import.meta.url).pathname);
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["src", "test", "script"];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".sol")) acc.push(p);
  }
  return acc;
}

const sources = {};
for (const d of dirs) {
  for (const file of walk(join(root, d))) {
    sources[relative(root, file)] = { content: readFileSync(file, "utf8") };
  }
}

function findImports(path) {
  const candidates = [];
  if (path.startsWith("@openzeppelin/")) candidates.push(join(root, "node_modules", path));
  else candidates.push(resolve(root, path));
  for (const c of candidates) {
    if (existsSync(c)) return { contents: readFileSync(c, "utf8") };
  }
  return { error: `File not found: ${path}` };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log(`solc ${solc.version()} — compiling ${Object.keys(sources).length} files from [${dirs.join(", ")}]`);
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
const warnings = (out.errors ?? []).filter((e) => e.severity !== "error");

for (const w of warnings) console.log(`[warning] ${w.formattedMessage.trim()}`);
for (const e of errors) console.error(`[error] ${e.formattedMessage.trim()}`);

let contracts = 0;
let oversized = [];
const sizes = [];
for (const [file, cs] of Object.entries(out.contracts ?? {})) {
  for (const [name, c] of Object.entries(cs)) {
    contracts++;
    const bytes = (c.evm?.bytecode?.object?.length ?? 0) / 2;
    if (file.startsWith("src/") && bytes > 0 && !file.includes("interfaces/")) sizes.push([name, bytes]);
    if (bytes > 24576 && file.startsWith("src/")) oversized.push(`${file}:${name} (${bytes} bytes)`);
  }
}
if (sizes.length) {
  console.log("deployable contracts (creation bytecode, EIP-170 runtime limit is 24576 bytes):");
  for (const [name, bytes] of sizes.sort((a, b) => b[1] - a[1])) console.log(`  ${name.padEnd(20)} ${bytes}`);
}
if (oversized.length) console.log(`[note] contracts over the 24576-byte EIP-170 limit: ${oversized.join(", ")}`);

console.log(`${contracts} contracts, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
