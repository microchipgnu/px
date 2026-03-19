# TODOs

## Add changesets for automated npm versioning

**What:** Install `@changesets/cli`, add `.changeset/` config, add `version` and `publish` scripts to root package.json.

**Why:** Manual version bumps across 5 published packages (`protocol`, `buyer-sdk`, `solver-sdk`, `buyer-agent`, `solver-agent`) will get painful fast — especially when protocol changes require coordinated version bumps in downstream packages.

**Where to start:** `bun add -D @changesets/cli && bunx changeset init`. Then add `"changeset": "changeset"`, `"version": "changeset version"`, `"release": "changeset publish"` to root scripts.

**Depends on:** Initial 0.0.1 publish landing first.

---

## Add GitHub Actions CI for npm publish

**What:** Workflow that runs tests, builds all packages, and publishes to npm on version tag or changeset release.

**Why:** Manual `npm publish` is error-prone — easy to forget building, publish in wrong order, or miss a workspace dependency resolution. Automation eliminates human error in the release process.

**Where to start:** Create `.github/workflows/release.yml`. Use changesets/action for automated PR creation and publishing. Needs NPM_TOKEN secret.

**Depends on:** Changesets TODO above.

---

## Add SDK integration tests against mock coordinator

**What:** Spin up a test coordinator instance, run `BuyerClient` and `SolverClient` against it, verify the full lifecycle (submit intent → match → fulfill → attest → settle).

**Why:** Current 184 tests cover protocol schemas and attestor logic but not the HTTP/WS client layer. A broken fetch URL or WebSocket handshake in the SDKs would only be caught by manual testing.

**Where to start:** Create `packages/buyer-sdk/src/client.test.ts` and `packages/solver-sdk/src/client.test.ts`. Use Bun's built-in server to mock coordinator endpoints.

**Depends on:** Nothing — can be done anytime.
