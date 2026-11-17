import { readFile } from "node:fs/promises";
import path from "node:path";

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { ScriptContext } from "./interfaces/ScriptContext.js";

/**
 * Enter the name of the script you want to run and store it in the "current" subfolder of "scripts" folder
 * Once you have the script in the "current" folder, you can run it by executing this file (scriptrunner.js)
 * After successful execution, you can move the script to the "archive" folder for future reference
 * 
 * The project name is automatically detected from the service account files in the "service-accounts" folder
 * If you want to run the script for a different project, you can change the project name in the "projectName" variable below
 */
const scriptFileName = 'helloWorld';

const projectId =
    'eventfinderapp-2d94f';
// 'foodblogapp-d6a7f';
// 'onlinetestapp-1e50c';
// 'pokemonsearchapp-a72a7';
// 'threedmodelapp';

const storageBucket = `${projectId}.firebasestorage.app`;

const filePath = path.resolve(`./service-accounts/${projectId}.json`);

const fileContent = await readFile(filePath, 'utf-8');

const projectCredentials = JSON.parse(fileContent);

const app = initializeApp({
    credential: cert(projectCredentials),
    // projectId,
    storageBucket,
});

const db = getFirestore(app);

const { script }: { script: (ctx: ScriptContext) => Promise<void> | void } = await import(`./scripts/current/${scriptFileName}`);

await script({ db, projectId });