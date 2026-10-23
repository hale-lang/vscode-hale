import { build } from "esbuild";
const common = { bundle: true, platform: "node", target: "node18", format: "cjs", sourcemap: true, logLevel: "info" };
await build({ ...common, entryPoints: ["src/extension.ts"], external: ["vscode"], outfile: "dist/extension.js" });
await build({ ...common, entryPoints: ["src/families/index.ts"], outfile: "dist/families.js" });
await build({ ...common, entryPoints: ["src/language.ts"], outfile: "dist/language.js" });
await build({ ...common, entryPoints: ["src/reports.ts"], external: ["vscode"], outfile: "dist/reports.js" });
await build({ ...common, entryPoints: ["src/contexts.ts"], external: ["vscode"], outfile: "dist/contexts.js" });

await build({ ...common, entryPoints: ["src/scaffold.ts"], outfile: "dist/scaffold.js" });
