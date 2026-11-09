const fs = require('fs');
const path = require('path');

const { initializeApp, cert } = require('firebase-admin/app');

const { getFirestore } = require('firebase-admin/firestore');

const { getStorage } = require('firebase-admin/storage');

const projectsList = fs.readdirSync(path.join(__dirname, 'service-accounts'))
    .map(file => file.split('.json')[0])
    .sort();

const scriptFileName = 'helloWorld';
const projectName = projectsList[1]; // Replace with the desired project name

const storageBucket = `${projectName}.firebasestorage.app`;

const projectCredentials = require(`./service-accounts/${projectName}.json`);

const app = initializeApp({
    // credential: cert(projectCredentials),
    projectId: projectCredentials.project_id,
    storageBucket: storageBucket,
});

const db = getFirestore(app);
const storage = getStorage(app).bucket();

const { script } = require(`./scripts/current/${scriptFileName}`);

script({ db, storage, projectName });