// Diagnóstico temporário: confere perfis e testa as regras com um usuário de teste.
import admin from 'firebase-admin';
const SA = JSON.parse(process.env.FIREBASE_SA);
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore(), K = 'AIzaSyArHABRbjIZi4XfnXoz94JMLbn6wP5SaSQ', P = SA.project_id;
const out = { quando: new Date().toISOString() };
const users = await db.collection('users').get();
out.perfis = await Promise.all(users.docs.map(async d => ({ uid: d.id.slice(0, 6), campos: Object.keys(d.data()), username: d.data().username, subcols: (await d.ref.listCollections()).map(c => c.id) })));
const authUsers = (await admin.auth().listUsers(50)).users.map(u => ({ uid: u.uid.slice(0, 6), email: u.email, temPerfil: users.docs.some(d => d.id === u.uid), criado: u.metadata.creationTime }));
out.contas = authUsers;
try {
  const r = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'diag-rules@plantonista.app', password: 'diag123456', returnSecureToken: true }) })).json();
  const conv = (await db.collection('config').doc('app').get()).data().convite;
  await db.collection('users').doc(r.localId).set({ username: 'diag', convite: conv, criado: Date.now() });
  const w = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/users/${r.localId}/locais/teste`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.idToken }, body: JSON.stringify({ fields: { nome: { stringValue: 'x' } } }) });
  out.testeGravacao = w.status + ' ' + (await w.text()).slice(0, 200);
  await db.recursiveDelete(db.collection('users').doc(r.localId));
  await admin.auth().deleteUser(r.localId);
} catch (e) { out.testeErro = e.message; }
const rs = await admin.securityRules().getFirestoreRuleset();
out.regrasTemGet = rs.source[0].content.includes("get('bloqueado'");
await db.collection('public').doc('diag').set(JSON.parse(JSON.stringify(out)));
console.log(JSON.stringify(out, null, 1));
