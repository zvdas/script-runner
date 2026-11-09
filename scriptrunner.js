const fs = require('fs');
const path = require('path');

const { initializeApp, cert } = require('firebase-admin/app');

const { getFirestore } = require('firebase-admin/firestore');

const { getStorage } = require('firebase-admin/storage');

const projectsList = fs.readdirSync(path.join(__dirname, 'service-accounts'))
    .map(file => file.split('.json')[0])
    .sort();

/**
 * Enter the name of the script you want to run and store it in the "current" subfolder of "scripts" folder
 * Once you have the script in the "current" folder, you can run it by executing this file (scriptrunner.js)
 * After successful execution, you can move the script to the "archive" folder for future reference
 * 
 * The project name is automatically detected from the service account files in the "service-accounts" folder
 * If you want to run the script for a different project, you can change the project name in the "projectName" variable below
 */
const scriptFileName = 'helloWorld';
const projectName = projectsList[1] ?? 'aia-finance';

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