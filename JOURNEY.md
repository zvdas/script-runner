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