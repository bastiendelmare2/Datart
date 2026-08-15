import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const tauriCli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const cargoBin = join(process.env.USERPROFILE ?? "", ".cargo", "bin");
const env = { ...process.env, PATH: `${cargoBin};${process.env.PATH ?? ""}` };

const child = spawn(process.execPath, [tauriCli, "dev"], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
