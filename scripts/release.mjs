import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/release.mjs X.Y.Z");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version '${version}'. Expected semantic version like 0.2.0`);
  process.exit(1);
}

const root = process.cwd();
const packageJsonPath = join(root, "package.json");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = join(root, "src-tauri", "Cargo.toml");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function updatePackageJson() {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  pkg.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function updateTauriConf() {
  const tauri = JSON.parse(readFileSync(tauriConfPath, "utf8"));
  tauri.version = version;
  writeFileSync(tauriConfPath, `${JSON.stringify(tauri, null, 2)}\n`, "utf8");
}

function updateCargoToml() {
  const cargo = readFileSync(cargoTomlPath, "utf8");
  const updated = cargo.replace(/(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m, `$1${version}$3`);

  if (updated === cargo) {
    console.error("Could not update version in src-tauri/Cargo.toml");
    process.exit(1);
  }

  writeFileSync(cargoTomlPath, updated, "utf8");
}

updatePackageJson();
updateTauriConf();
updateCargoToml();

const tag = `v${version}`;

run("git", ["add", "package.json", "src-tauri/Cargo.toml", "src-tauri/tauri.conf.json"]);
run("git", ["commit", "-m", `release: ${tag}`]);
run("git", ["push", "origin", "main"]);
run("git", ["tag", tag]);
run("git", ["push", "origin", tag]);

console.log(`Release prepared and pushed: ${tag}`);
