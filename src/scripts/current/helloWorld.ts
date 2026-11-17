import type { ScriptContext } from '../../interfaces/ScriptContext.js';

export const script = async ({ db, projectId }: ScriptContext) => {
    console.log(`Hello World! This is a test script for project: ${projectId}`);
    const collections = await db.listCollections();
    console.log({ collections: collections.map(c => c.id) });
};