# Datart Release Workflow

Use this same process for every update.

## Quick automated flow (recommended)

1. Prepare release locally (version bump + commit + tag + push):
- `npm run release:prepare -- X.Y.Z`

2. GitHub Actions builds and uploads desktop installers automatically:
- Workflow: `.github/workflows/release-desktop.yml`
- Triggered by tag push `v*`.
- Assets are attached to the GitHub Release for that tag.

3. Share this permanent download URL:
- `https://github.com/bastiendelmare2/Datart/releases/latest`

## Manual fallback

If GitHub Actions is unavailable, use the previous manual process:

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
