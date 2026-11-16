const script = async ({ db, storage, projectId }) => {
    console.log(`Hello World! This is a test script for project: ${projectId}`);
    const collections = await db.listCollections();
    console.log({ collections: collections.map(c => c.id) });
};

module.exports = { script };