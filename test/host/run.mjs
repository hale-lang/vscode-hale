// Launches the installed VS Code with the extension under development
// on the claims demo and runs test/host/suite.js inside it.
import path from "node:path";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(".");
const workspace = process.argv[2] || path.resolve("../hale/iris/examples/claims-demo/app");
import fs from "node:fs";
const macos = "/Applications/Visual Studio Code.app/Contents/MacOS";
const vscodeExecutablePath = process.env.VSCODE_BIN
  || ["Electron", "Code", ...(fs.existsSync(macos) ? fs.readdirSync(macos) : [])].map((n) => path.join(macos, n)).find((p) => fs.existsSync(p));
if (!vscodeExecutablePath) { console.error("no VS Code executable found; set VSCODE_BIN"); process.exit(1); }
console.log("using", vscodeExecutablePath);
const userDir = path.join(root, ".vscode-test-user");
fs.mkdirSync(path.join(userDir, "User"), { recursive: true });
fs.writeFileSync(path.join(userDir, "User", "settings.json"), JSON.stringify({
  "hale.path": process.env.HALE_BIN || ["../hale-main/target/release/hale", "../hale/target/release/hale"].map((p) => path.resolve(p)).find((p) => fs.existsSync(p)),
  "hale.env": { DEVELOPER_DIR: process.env.DEVELOPER_DIR || "/Library/Developer/CommandLineTools" },
  "workbench.startupEditor": "none",
}, null, 2));
try {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, "test", "host", process.env.HALE_HOST_SUITE || "suite.js"),
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--user-data-dir", userDir],
    extensionTestsEnv: { HALE_HOST_DUMP: process.env.HALE_HOST_DUMP || "", HALE_HOST_TEST_FILE: process.env.HALE_HOST_TEST_FILE || path.join(workspace, "main.hl"), HALE_HOST_EXPECT: process.env.HALE_HOST_EXPECT || "" },
  });
  console.log("host test passed");
} catch (e) {
  console.error("host test failed:", e);
  process.exit(1);
}
