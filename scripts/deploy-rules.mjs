// Publica firestore.rules no Firebase. Roda pelo GitHub Actions quando o arquivo muda.
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
const SA = JSON.parse(process.env.FIREBASE_SA);
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const src = readFileSync('firestore.rules', 'utf8');
const rs = await admin.securityRules().releaseFirestoreRulesetFromSource(src);
await admin.firestore().collection('public').doc('regras').set({ ruleset: rs.name, publicado: new Date().toISOString() });
console.log('Regras publicadas:', rs.name);
