# Datart Release Workflow

Use this same process for every update.

1. Bump versions consistently:
- package.json
- src-tauri/Cargo.toml
- src-tauri/tauri.conf.json

2. Commit release changes:
- git add .
- git commit -m "release: vX.Y.Z"

3. Push code and tag:
- git push origin main
- git tag vX.Y.Z
- git push origin vX.Y.Z

4. Build desktop artifacts:
- node scripts/desktop-build.mjs

5. Publish GitHub Release:
- Create release for tag vX.Y.Z
- Upload installer assets from src-tauri/target/release/bundle
- Mark as latest stable release

Notes:
- Auto-update is not enabled by default. Users manually install the new release.
- If something fails, verify Rust/Cargo and rebuild desktop before publishing.
