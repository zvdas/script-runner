# ScriptRunner — Journey Log

A build-in-public log of rebuilding ScriptRunner, a Node.js CLI for running operations scripts (starting with Firestore seeding) against Firebase projects.

The work is mine; the guidance is from AI. Each gotcha is written as assumed → actual → rule, so the mistakes stay visible alongside the fixes.

Jira epic: KAN-38 · Sprint 0 · 16–20 Nov 2026

---

## Day 1 · Mon 16 Nov · KAN-39 (scaffold)

**Goal:** Scaffold the CLI and connect it to Firestore.

**What I built**
- `scriptrunner.js`: initialises the Firebase Admin app, creates `db` and `storage`, loads a script from `scripts/current/` by name, and runs it.
- A script contract: every script exports `script({ db, storage, projectId })`.
- `helloWorld.js`: the first real Firestore read, listing collection names.
- An `npm start` script.

**Bugs**
- **A rename missed one reference.** I renamed `projectName` to `projectId` but missed one line, which crashed with `ReferenceError: projectName is not defined`.
  *Rule:* after a rename, search the whole repo for the old name before committing.
- **A fresh clone crashed.** The runner read the `service-accounts/` folder on startup, but that folder is gitignored, so a fresh clone failed with `ENOENT`.
  *Rule:* "works on my machine" doesn't count. Test on a fresh clone with `npm ci`.

**Gotchas**
1. **`require` loads a module; it doesn't run its functions.**
   - *Assumed:* importing `helloWorld.js` executes it, and control then returns to `scriptrunner.js`.
   - *Actual:* `require` runs the file's top-level code once and returns its `module.exports`. helloWorld's top level only defines a function, so nothing inside it runs until `scriptrunner.js` calls `script(...)`. Control never leaves the runner.
   - *Rule:* scripts define and export; the runner owns execution and injects `db` and `storage` (dependency injection).
   - *Proof:* 
        ```
        const script = async ({ db, storage, projectId }) => {
            console.log(`Hello World! This is a test script for project: ${projectId}`);
            const collections = await db.listCollections();
            console.log({ collections: collections.map(c => c.id) });
        };
        ```
        Console
        ```
        Hello World! This is a test script for project: eventfinderapp-2d94f
        { collections: [ 'events' ] }
        ```

2. **projectId is not a credential.**
   - *Assumed:* a service account isn't needed; the projectId is enough.
   - *Actual:* initialising with only a `projectId` succeeds, but the first real call (`listCollections()`) fails with `NO_ADC_FOUND`. The projectId only says *which* project; credentials say *who you are*. There are three routes:
     | Where it runs | Credentials |
     |---|---|
     | Firestore emulator | none |
     | My machine | Application Default Credentials (`gcloud auth application-default login`) |
     | CI or a remote machine | service account key |
   - *Rule:* a real project always needs some credential. A key file is just one way to provide it.
   - Also: every Firestore and Storage call returns a Promise, so scripts are `async` and `await` each call.

3. **Service account keys are a one-time download.**
   - *Assumed:* the app's config key from the app configuration in firebase console is interchangeable with service account keys.
   - *Actual:* a service account private key can only be downloaded once. If it's lost, generate a new one in firebase or gcp and delete the old one. Service account keys allow applications to edit the database and sorage.
   - *Rule:* treat key files as secrets (gitignored, never shared), and prefer ADC on my own machine.

4. **`main` is not what `npm start` runs.**
   - *Assumed:* the entry file has to be renamed `index.js` so npm can run it.
   - *Actual:* `"main"` is used by `require('script-runner')` and `node .`. `npm start` runs whatever `"scripts.start"` says. `index.js` is a convention, not a requirement.
   - *Rule:* `scripts` for running, `main` for importing, `bin` for running it as a command (later).

5. **Not every warning comes from my code.**
   - *Seen:* `The credentials option is deprecated. Please use the auth object constructor instead.`
   - *Actual:* I traced it into `node_modules`. When `cert()` is passed, firebase-admin 14.5 hands a `credentials` object to the Firestore client internally, and google-auth-library v11 warns about it. My `initializeApp` call is fine.
   - *Rule:* before changing my code for a warning, find out which package prints it.
   - *To check:* does the warning go away with ADC?

**Decisions / deferred**
- Keep `scriptrunner.js` as the entry file for now. It becomes `src/index.ts` in the TypeScript move rather than being renamed twice.
- TypeScript, `--help` and the emulator connection (KAN-39 items 1–3) carry over to Day 2.

---

## Day 2 · Tue 17 Nov · KAN-39 (TypeScript + emulator)

**Goal**: Move to TypeScript (ESM), make the build run cleanly from a fresh clone, connect to the Firestore emulator.

**What I built**
- The TypeScript + ES modules setup: `src/index.ts`, `src/interfaces/ScriptContext.ts`, `src/scripts/current/helloWorld.ts`, compiling to `dist/`.
- Scripts: `build` (tsc), `dev` (tsx), `start` (node dist).
- The Firebase CLI as a dev dependency, plus `firebase.json` and `.firebaserc`, with the Firestore emulator running under `demo-scriptrunner`.
- A round trip against the emulator: `[]` → add a doc in the UI → `[ 'events' ]`.
- `.gitignore` cleanup: `dist`, `.DS_Store`, `*-debug.log`.

#### TypeScript migration
1. **Types come from the Admin SDK, as named imports.**
   - *Assumed:* default imports work, and client SDK types (`firebase/firestore`) work with Admin SDK objects.
   - *Actual:* the Admin SDK uses named exports (`import { getFirestore, type Firestore }`). Client and Admin types don't mix. `getStorage(app).bucket()` returns a `Bucket` (from `@google-cloud/storage`), not `Storage`.
   - *Rule:* import types from the same package that creates the object.

2. **Static imports can't load by name.**
   - *Assumed:* string literals do not work with `import` statements directly, not the same way as `require`.
   - *Actual:* static `import`s are hoisted, and Node resolves the whole module graph before any code runs, so the path must be a fixed string. The script name is only known at runtime, so it needs `await import()`. The key file is read with `readFile` + `JSON.parse`.
   - *Rule:* static import for fixed dependencies; dynamic `import()` for anything chosen at runtime.

3. **`verbatimModuleSyntax` means type-only imports.**
   - *Error:* `TS1484: 'ScriptContext' is a type and must be imported using a type-only import`.
   - *Rule:* use `import type` for interfaces and types, so TypeScript removes them completely from the compiled JS.

4. **`TypeError: script is not a function`.**
   - *Actual:* the runner used ESM `import()`, but `helloWorld` still used `module.exports`, so `{ script }` came back undefined.
   - *Rule:* every script uses `export const script = …`. Never mix the two module systems.
   - *Note:* verify the exact `.default` explanation with a tiny test file before publishing it.

5. **tsc vs tsx** (correcting my own understanding)
   - *Assumed:* TypeScript compiles at runtime, via `tsc <file>`.
   - *Actual:* `tsc` compiles **ahead of time** into `dist/` and reads `tsconfig.json`. `tsc <file>` ignores the config. `tsx` strips types on the fly during dev and **doesn't type-check**.
   - *Rule:* `dev` for speed, `build` to check types, and always run the built output before calling it done.

**Bugs**
- **`npm start` failed with `MODULE_NOT_FOUND`:** the start script pointed at `dist/index.ts`, but `tsc` emits `.js`.
- **The compiled build failed with `ERR_MODULE_NOT_FOUND`:** the dynamic import had no `.js` extension. In ES modules Node won't guess extensions, and `tsx` hid the problem in dev.
  *Rule:* test the built output, not just dev. Relative imports in `.ts` files end in `.js`.
- **A leftover from `tsc --init`:** `"jsx": "react-jsx"` (removed).

**Gotchas**

6. **What “server” means.** 
   ScriptRunner is a local Node program (“server-side” = not in a browser). The emulator is also local. Cloud Functions are the only part deployed to Google. So the `firebase` client SDK was removed.

7. **Cloud Storage needs Blaze.**
   - Actual: since 3 Feb 2026, Cloud Storage needs the Blaze plan; Spark projects get 402/403 errors. Firestore and the emulators work on Spark.
   - Decision: `storage` is optional in `ScriptContext`, and storage is deferred. If required later, can switch to Blaze plan with budget-alerts set up.

8. **`demo-` projects are never created.**
   - Assumed: `firebase init` → “Create a new project” with `demo-scriptrunner`.
   - Actual: refused with “Project ID cannot start with `demo-`”. Demo IDs are only names passed to the emulator. Nothing exists in the cloud, so they can’t reach production.
   - Rule: “Don’t set up a default project”, then set the ID in `.firebaserc`.

9. **The CLI login isn’t ADC.**
   - `firebase login` was needed for `init`, but it gives `firebase-admin` no credentials. ADC needs gcloud auth `application-default login` (or a key file).

10. **Init’s Space vs Enter.**
   - Pressing Enter without Space selected zero emulators, so `emulators:start` said “No emulators to start”.
   - Rule: read the generated config (`cat firebase.json .firebaserc`) instead of trusting “✔ complete”.

11. **`demo-no-project`: data that seemed to be missing.**
   - Assumed: the emulator runs under the project ID in my code.
   - Actual: with no default in `.firebaserc`, it ran as `demo-no-project`. The UI showed events, but the script (as demo-scriptrunner) saw `[]`. Emulator data is kept per project ID.
   - Fix: set .firebaserc default to demo-scriptrunner, restart.
   - Rule: pin the project ID, and have the runner print its target so a mismatch shows up immediately.

12. **The env var overrides the project ID.**
   - With `FIRESTORE_EMULATOR_HOST` set, even `eventfinderapp-2d94f` went to the emulator (and got an empty area). The reverse is the danger: forget the env var and a real ID goes to production.
   - Rule (KAN-42): emulator ⇒ `demo-` ID only; live ⇒ explicit opt-in.

13. **How I knew it was the emulator.**
   - The first `[]` was proof: `demo-scriptrunner` has no credentials and no cloud project, so a live call would have errored.

**Decisions / deferred**
- Storage is deferred (optional in `ScriptContext`).
- Open: the key-file lines are commented out, so the live path is broken. A fresh clone’s `npm start` fails with `NO_ADC_FOUND`.
- Open: the EMULATOR/LIVE target line, the conditional key/ADC fallback, `--help`.
- Open: the deprecation warning does not disappear with ADC

**Next:** the guard + target line, the credential fallback, `--help` → close KAN-39.

---

## Day 3 · Thu 19 Nov · KAN-39 (CLI, guards, credentials)
 
**Goal**: Replace the hard-coded script and project with CLI flags, guard against hitting the wrong target, support key file or ADC for live mode, and close KAN-39.
 
**What I built**
- CLI flags with Node's built-in `util.parseArgs` (no dependency): `--script`/`-s` (default `helloWorld`), `--project`/`-p` (no default), `--help`/`-h`.
- Target detection from `FIRESTORE_EMULATOR_HOST`, with guard rules and a target line printed before connecting.
- Live-mode credentials: the key file if `service-accounts/<projectId>.json` exists, otherwise ADC. The emulator uses no credentials at all.
- PR #1 (`feat/kan-39-cli`), squash-merged. KAN-39 closed.
#### CLI
1. **npm swallows flags without `--`.**
   - *Assumed:* `npm run dev --script helloWorld` passes `--script` to my program.
   - *Actual:* npm treats it as its own flag. Printing `process.argv` showed it never arrived. Everything after `--` is forwarded: `npm run dev -- --script helloWorld`.
   - *Rule:* always use `npm run <name> -- <flags>`, and write the usage text that way.
2. **`strict: true` throws on unknown flags.**
   - *Actual:* `--foo` throws inside `parseArgs`, so the user gets a stack trace.
   - *Rule:* wrap the call in `try/catch`, print the error and the usage text, and exit with code 1.
3. **Exit codes are part of the interface.**
   - `--help` exits 0, every failure exits 1 (checked with `echo $?`). The KAN-42 tests and any future CI depend on this.
#### Safety
4. **I made production the default.**
   - *Assumed:* defaulting `--project` to `eventfinderapp-2d94f` saves typing.
   - *Actual:* a bare `npm run dev` would go straight to a live project. It's harmless while helloWorld only reads, but once `--reset` exists (KAN-41) the same habit wipes real data.
   - *Rule:* the safe target is the default. The dangerous one takes effort to reach. The emulator defaults to `demo-scriptrunner`, and live mode requires `--project`.
5. **Guard order: decide → announce → connect.**
   - Work out emulator vs live, then refuse bad combinations before touching anything:
     - emulator + an ID that doesn't start with `demo-` → refused
     - live + a `demo-` ID → refused (this turns the fresh-clone `NO_ADC_FOUND` crash into a readable error)
     - live + no `--project` → refused
   - Then print the target (`EMULATOR : 127.0.0.1:8080 | demo-scriptrunner` / `LIVE : eventfinderapp-2d94f`) and only then initialise the app.
6. **`as string` hides `undefined`.**
   - *Assumed:* the cast was just to keep TypeScript quiet.
   - *Actual:* it tells TypeScript to trust me, so a missing `--project` would slip through. I fell for it twice.
   - *Rule:* narrow instead of casting. After `if (!projectId) { …exit }`, TypeScript knows it's a `string` without a cast.
#### Credentials
7. **Key file or ADC, and what each failure means.**
   - With the key file: `cert(...)`, and it works.
   - Without it: no credential is passed, so the SDK looks for ADC. On my Mac ADC isn't set up, so `NO_ADC_FOUND` is the correct result, not a bug.
8. **The deprecation warning is tied to the key-file path.**
   - It appears whenever `cert()` is used. It comes from inside firebase-admin, not from my code.
   - Not yet checked against a working ADC setup (`gcloud auth application-default login`).
9. **A message that looked like a failure.**
   - A missing key file printed `Error: No service account files found`, even though falling back to ADC is the expected behaviour. Anyone reading it would think the tool broke before it tried ADC.
   - *Rule:* say what happens next (`credentials: ADC (no key file at …)`). Use `Error` only for real failures.
#### Environment
10. **Emulator data is wiped when it stops.**
   - After a restart the `events` doc was gone, so I got `[]` instead of `[ 'events' ]`. I also had to look up how to start the emulator again. Both commands are going into npm scripts.
#### The near-miss
11. **A screenshot is a way for a key to leak.**
   - *What happened:* I shared a screenshot while the service account key file was open in the editor. The `private_key_id`, `client_email` and the start of the `private_key` were visible.
   - *What saved me:* `.gitignore`. Source Control showed nothing staged, so the key never reached git. But `.gitignore` doesn't protect a screenshot.
   - *Assumed:* deleting the screenshot fixes it.
   - *Actual:* you can't reliably delete every copy. Rotating the key is the fix, because it makes every copy useless.
   - *Fix:* created a new JSON key, deleted the old one (`649d9f19…`), and re-ran the live command to confirm.
   - *Rule:* close `service-accounts/` files before any screenshot or recording. If a key is shown anywhere, rotate it. Don't just delete the image.
12. **The project wasn't in the Google Cloud picker.**
   - The picker was filtered to my organisation. Projects created from the Firebase console sit under "No organisation".
   - *Shortcut:* Firebase console → Project settings → Service accounts → "Manage service account permissions" opens Google Cloud with the right project selected.

**Test matrix (PR #1)**
| # | Command | Result |
|---|---|---|
| 1 | `npm run dev -- --help` | usage, exit 0 |
| 2 | `npm run dev -- --foo` | error + usage, exit 1 |
| 3 | emulator, no flags | EMULATOR · demo-scriptrunner |
| 4 | emulator + `-p eventfinderapp-2d94f` | refused |
| 5 | live, no flags | refused (needs `--project`) |
| 6 | live + `-p demo-scriptrunner` | refused |
| 7 | live + `-p eventfinderapp-2d94f` | LIVE · key file → `[ 'events' ]` |
| 8 | `npm run build && npm start -- --help` | compiled build works |
 
**Decisions / deferred**
- Open: `projectId` still has an `as string` cast (gotcha 6 isn't fully applied).
- Open: the "live mode needs --project" error uses `console.log` instead of `console.error`.
- Open: the ADC fallback message still says `Error:` (gotcha 9).
- Open (KAN-42): a corrupted key file is silently treated as missing. Credentials should be checked before the script runs.
- Open: confirm the deprecation warning with ADC (gotcha 8).

**Next:** `emulators` / `dev:emu` npm scripts, a "Resume here" note, then KAN-40 (seed one collection) after the break.