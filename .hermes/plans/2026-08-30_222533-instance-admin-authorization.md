# Instance-admin authorization implementation plan

> **For Hermes:** Implement the slices below with test-first behavior and an independent security review before committing.

**Goal:** Make privileged passalong capabilities available through normal, publicly reachable server actions that authorize only the authenticated instance administrator; make the existing CLI reset utility an explicit break-glass fallback rather than the routine administration path.

**Architecture:** Keep tenant/owner authorization unchanged for normal collection operations. Resolve instance-admin authorization server-side from the active session scope against `instance_roles`; no client-supplied role is trusted. Add one narrow privileged action now—issuing a one-time password-reset secret—to establish and prove the reusable guard. The existing public reset action remains responsible only for consuming a secret.

**Tech stack:** SvelteKit server actions, TypeScript, better-sqlite3, Vitest, Playwright, Docker Compose.

---

### Task 1: Add a reusable repository-level instance-admin authorization query

**Objective:** Let server actions prove that an active `{ userId, tenantId }` scope belongs to the singleton `instance_admin` role.

**Files:**
- Modify: `src/lib/server/collection-repository.ts`
- Modify: `src/lib/server/collection-repository.test.ts`

**Steps:**
1. Add a failing test proving the bootstrap admin is an instance admin and a separately created tenant user is not.
2. Run the targeted test and verify it fails because no repository authorization method exists.
3. Add `isInstanceAdmin(scope): boolean` to the repository interface and a parameterized `EXISTS` query on `instance_roles` scoped by the authenticated user ID.
4. Re-run the targeted test, then the repository suite.

### Task 2: Issue reset secrets via a protected server action

**Objective:** Let only an authenticated instance admin issue a one-time reset secret through the application.

**Files:**
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/server/collection-repository.test.ts` as needed
- Create or modify: focused route/action tests only if the project’s test harness supports it without brittle mocks

**Steps:**
1. Add a failing end-to-end test: a regular account cannot access the privileged reset issuance UI/action; the instance admin can create a code that a target account can consume.
2. Add a server-action guard that requires Same-Origin, an active session, and `repository.isInstanceAdmin(scope)`, returning 403 for an authenticated non-admin.
3. Generate a high-entropy reset secret in the server action, persist only its SHA-256 hash through the existing atomic `createPasswordResetForUsername` repository operation, and return the raw secret only in that immediate form response.
4. Add an instance-admin-only UI section that accepts an account username and presents the issued secret once. Do not log or persist the raw value client-side.
5. Re-run the focused E2E test and ensure the existing reset-consumption path revokes the target’s sessions.

### Task 3: Reclassify the CLI helper as break-glass recovery

**Objective:** Preserve a recovery route only for loss of all admin access, without presenting it as normal account administration.

**Files:**
- Modify: `README.md`
- Modify: `scripts/create-password-reset.ts` only if wording/usage needs alignment

**Steps:**
1. Update documentation to state that normal reset issuance happens through the authenticated instance-admin area.
2. Label the container helper as break-glass recovery for the sole/locked-out instance admin, and retain the one-time/hash-only/no-logs safeguards.
3. Run the compiled helper against an isolated temporary SQLite fixture and verify it persists only a hash and forces a reset.

### Task 4: Verify and review

**Objective:** Prove normal and privileged paths, isolation, and runtime delivery.

**Steps:**
1. Run `npm test`, `npm run check`, `npm run build`, `npm run test:e2e`, `docker compose config --quiet`, `git diff --check`, the release-flow suite, and `pnpm audit`.
2. Build the Docker image and invoke the compiled break-glass helper in its runtime image.
3. Obtain an independent read-only security review focused on role enforcement, tenant isolation, reset-secret exposure, CSRF, session revocation, and privilege bypasses.
4. Commit and push only after all gates pass; update PR #33 with the concrete privileged-action behavior and evidence.

### Task 5: Persist the accepted architecture

**Objective:** Let Marie maintain the confirmed role model in Hermes Gehirn.

**Files:**
- Create/update: child page under `Hermes Gehirn`

**Steps:**
1. Record the verified role model: singleton instance admin, server-side DB authorization, normal tenant/owner boundaries, privileged action guard, public-but-authorized admin routes, and break-glass scope.
2. Read back the exact AFFiNE page after the external write.

## Risks and boundaries

- A role must be checked server-side on every privileged route; never encode it as a client claim.
- The new action intentionally establishes the reusable guard but does not prematurely build unrelated account-management, backup, or restore UIs.
- The raw reset secret can only appear in the immediate authenticated admin response. It must not be logged, stored in SQLite, put in URLs, or added to tests/screenshots.
- The CLI remains solely for a true lockout scenario; removing it would leave the singleton admin unable to recover.
