// Packs the extension into a .vsix without vsce (which needs a newer
// Node than this machine has). A vsix is a zip: the manifest, the
// content types, and the extension's files under extension/.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const out = `${pkg.name}-${pkg.version}.vsix`;
const stage = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "vsix-"));
const ext = path.join(stage, "extension");
fs.mkdirSync(ext);
const include = ["package.json", "README.md", "CHANGELOG.md", "LICENSE.md", "language-configuration.json", "dist/extension.js", "syntaxes/hale.tmLanguage.json", "media/hale.svg", "media/hale.png"];
for (const f of include) {
  const dst = path.join(ext, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(f, dst);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
fs.writeFileSync(path.join(stage, "extension.vsixmanifest"), `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${esc(pkg.name)}" Version="${esc(pkg.version)}" Publisher="${esc(pkg.publisher)}"/>
    <DisplayName>${esc(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${esc(pkg.description)}</Description>
    <Tags>hale</Tags>
    <Categories>${esc(pkg.categories.join(","))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${esc(pkg.engines.vscode)}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
    </Properties>
    <License>extension/LICENSE.md</License>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.md" Addressable="true"/>
  </Assets>
</PackageManifest>
`);
fs.writeFileSync(path.join(stage, "[Content_Types].xml"), `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".svg" ContentType="image/svg+xml"/>
  <Default Extension=".png" ContentType="image/png"/>
</Types>
`);
fs.rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", path.resolve(out), "extension.vsixmanifest", "[Content_Types].xml", "extension"], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`packed ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
