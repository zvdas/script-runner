import path from "node:path";
import { parseArgs } from "node:util";
import { access, readFile } from "node:fs/promises";


import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { ScriptContext } from "./interfaces/ScriptContext.js";

const usage = `Usage: npm run dev -- --script <scriptName> --project <projectId>`;

// arguments definitions for cli
function parseCliArgs() {
    try {
        return parseArgs({
            options: {
                script: {
                    type: 'string',
                    short: 's',
                    default: 'helloWorld',
                },
                project: {
                    type: 'string',
                    short: 'p',
                },
                help: {
                    type: 'boolean',
                    short: 'h',
                }
            },
            strict: true,
        });
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        console.error(usage);
        process.exit(1);
    }
}

const args = parseCliArgs();

// usage triggered by the help argument
if (args.values.help) {
    console.log(usage);
    process.exit(0);
}

const scriptFileName = args.values.script;

// to start emulator, run in terminal : npx firebase emulators:start --only firestore

// firebase emulator check
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const isEmulator = Boolean(emulatorHost);

const projectId = isEmulator ? (args.values.project ?? 'demo-scriptrunner') : args.values.project;

// no projectId error handling
if (!projectId) {
    console.log('Error: live mode needs --project. To use the emulator, set FIRESTORE_EMULATOR_HOST.');
    console.log(usage);
    process.exit(1);
}

// incorrect projectId error handling for emulator
if (isEmulator && !projectId.startsWith('demo-')) {
    console.error(`Error: the emulator only runs demo- projects (got "${projectId}").`);
    process.exit(1);
}

// incorrect projectId error handling for live
if (!isEmulator && projectId.startsWith('demo-')) {
    console.error(`Error: the live project doesn't run demo- projects (got "${projectId}")`);
    process.exit(1);
}

// status check
console.log(isEmulator ? `EMULATOR : ${emulatorHost} | ${projectId}` : `LIVE : ${projectId}`);

const serviceAccountPath = path.resolve(`./service-accounts/${projectId}.json`);

let credential;
if (!isEmulator) {
    try {
        await access(serviceAccountPath);
        credential = cert(JSON.parse(await readFile(serviceAccountPath, 'utf-8')));
        console.log('credentials: service account file');
    } catch (error) {
        console.error(`Error: No service account files found for ${projectId}`);
    }
}

const app = initializeApp(credential ? { credential, projectId } : { projectId });

const db = getFirestore(app);

const { script }: { script: (ctx: ScriptContext) => Promise<void> | void } = await import(`./scripts/current/${scriptFileName}.js`);

await script({ db, projectId });