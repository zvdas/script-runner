import type { Firestore } from "firebase-admin/firestore";

export interface ScriptContext {
    db: Firestore;
    projectId: string;
}
