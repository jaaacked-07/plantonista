// Envia os lembretes do Plantonista. Roda pelo GitHub Actions a cada 5 minutos.
// Precisa do segredo FIREBASE_SA (chave da conta de serviço do Firebase, em JSON).
import admin from 'firebase-admin';
import webpush from 'web-push';

const PROJECT = 'plantonista-87e46';
const SITE = 'https://jaaacked-07.github.io/plantonista/';

if (!process.env.FIREBASE_SA) { console.log('FIREBASE_SA não configurado; nada a fazer.'); process.exit(0); }
const SA = JSON.parse(process.env.FIREBASE_SA);
console.log('Projeto da chave secreta:', SA.project_id);
if (SA.project_id !== PROJECT) {
  console.log('ERRO: a chave FIREBASE_SA é de outro projeto (' + SA.project_id + '). Reiniciando o ciclo para ler a chave atualizada.');
  try { process.kill(process.ppid, 'SIGTERM'); } catch (e) {}
  process.exit(3);
}
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: PROJECT });
const db = admin.firestore();
const TZ = 'America/Sao_Paulo';
const WINDOW = 30; // minutos de tolerância

const DEF = { ativo: true, vespera: '20:00', antes: [120], pag: true, pagHora: '09:00', atrasados: 'seg' };

function nowSP() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, wd: p.weekday };
}
const toMin = hhmm => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ddmm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const money = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n, a, b) => n === 1 ? a : b;
const dur = p => { if (!p.inicio || !p.fim) return 0; let d = toMin(p.fim) - toMin(p.inicio); if (d <= 0) d += 1440; return d; };
const hh = m => { const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`; };
const total = p => (+p.valor || 0) + (+p.extra || 0);
const label = a => a >= 60 ? (a % 60 ? `${Math.floor(a / 60)}h${a % 60}` : `${a / 60}h`) : `${a} min`;

const now = nowSP();
const today = now.date, tomorrow = addDays(today, 1);

// Chaves do Web Push: criadas automaticamente na primeira execução.
const secretRef = db.collection('secrets').doc('vapid');
let keys = (await secretRef.get()).data();
if (!keys || !keys.privateKey) {
  keys = webpush.generateVAPIDKeys();
  await secretRef.set(keys);
  console.log('Chaves de notificação criadas.');
}
const pubRef = db.collection('public').doc('vapid');
const pub = (await pubRef.get()).data();
if (!pub || pub.publicKey !== keys.publicKey) await pubRef.set({ publicKey: keys.publicKey });
webpush.setVapidDetails(SITE, keys.publicKey, keys.privateKey);

async function processUser(U) {
  const subsSnap = await U.collection('subs').get();
  const tokens = subsSnap.docs.map(d => { try { return { ref: d.ref, sub: JSON.parse(d.data().sub) }; } catch (e) { return null; } }).filter(t => t && t.sub && t.sub.endpoint);
  if (!tokens.length) return;
  const cfgDoc = await U.collection('meta').doc('config').get();
  const cfgAll = cfgDoc.exists ? cfgDoc.data() : {};
  const cfg = Object.assign({}, DEF, cfgAll.lembretes || {});
  if (cfg.ativo === false) return;
  const priv = !!cfgAll.privacidade;

  let log = null;
  const getLog = async () => { if (!log) { const d = await U.collection('meta').doc('sentlog').get(); log = d.exists ? (d.data().sent || {}) : {}; } return log; };
  const inWin = hhmm => { const m = toMin(hhmm); return m !== null && now.min >= m && now.min - m <= WINDOW; };
  const out = [];
  let locais = null;
  const getLocais = async () => { if (!locais) { const s = await U.collection('locais').get(); locais = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); } return locais; };
  const nome = id => (locais && locais[id] && locais[id].nome) || 'Plantão';

  // Plantões de hoje e amanhã
  const antes = (cfg.antes || []).map(Number).filter(Boolean);
  const wantV = cfg.vespera && inWin(cfg.vespera);
  if (wantV || antes.length) {
    const ps = (await U.collection('plantoes').where('data', '>=', today).where('data', '<=', tomorrow).get()).docs.map(d => d.data()).filter(p => !p.semLembrete);
    if (ps.length) {
      await getLocais();
      const L = await getLog();
      const ord = (a, b) => (a.inicio || '').localeCompare(b.inicio || '');
      // 1. Véspera
      if (wantV && !L[`${today}|vespera`]) {
        const amanha = ps.filter(p => p.data === tomorrow).sort(ord);
        if (amanha.length) {
          const p = amanha[0], more = amanha.length - 1;
          out.push({ key: 'vespera', data: { title: `Amanhã: ${nome(p.localId)}`, body: `${p.inicio}–${p.fim} · ${hh(dur(p))}` + (more ? `\nMais ${more} ${plural(more, 'plantão', 'plantões')} amanhã` : ''), view: 'agenda' } });
        }
      }
      // 2. Antecedência antes do início
      for (const p of ps) {
        if (!p.inicio) continue;
        const start = (p.data === today ? 0 : 1440) + toMin(p.inicio);
        for (const a of antes) {
          const key = `antes|${p.id}|${a}`;
          if (now.min >= start - a && now.min < start - a + WINDOW && now.min < start && !L[`${today}|${key}`] && !L[`${p.data}|${key}`]) {
            out.push({ key, data: { title: `Em ${label(a)}: ${nome(p.localId)}`, body: `Começa às ${p.inicio} · termina às ${p.fim} (${hh(dur(p))})` + (p.nota ? `\n${p.nota}` : ''), view: 'agenda' } });
          }
        }
      }
    }
  }

  // 3. Pagamentos previstos para hoje
  if (cfg.pag && inWin(cfg.pagHora)) {
    const L = await getLog();
    if (!L[`${today}|pag`]) {
      const hoje = (await U.collection('plantoes').where('prev', '==', today).get()).docs.map(d => d.data()).filter(p => !p.pago);
      await getLocais();
      const porLocal = {};
      hoje.forEach(p => { porLocal[p.localId] = (porLocal[p.localId] || 0) + total(p); });
      const ym = today.slice(0, 7);
      Object.entries(locais).forEach(([id, l]) => {
        if (l.tipo !== 'salario' || !+l.salario || !l.inicioSal) return;
        const ref = l.pagaMes === 'mesmo' ? ym : (() => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); })();
        const last = new Date(Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7) + (l.pagaMes === 'mesmo' ? 0 : 1), 0)).getUTCDate();
        const dia = String(Math.min(+l.pagaDia || 5, last)).padStart(2, '0');
        if (today.slice(8) === dia && ref >= l.inicioSal && (!l.fimSal || ref <= l.fimSal) && !(l.pagos || {})[ref]) porLocal[id] = (porLocal[id] || 0) + (+l.salario);
      });
      const ids = Object.keys(porLocal);
      if (ids.length) {
        const soma = ids.reduce((s, id) => s + porLocal[id], 0);
        const body = ids.map(id => priv ? nome(id) : `${nome(id)}: ${money(porLocal[id])}`).join('\n');
        out.push({ key: 'pag', data: { title: priv ? 'Pagamento previsto para hoje' : `Pagamento previsto hoje: ${money(soma)}`, body, view: 'financeiro' } });
      }
    }
  }

  // 4. Pagamentos atrasados (segundas ou todo dia)
  const diaOk = cfg.atrasados === 'diario' || (cfg.atrasados === 'seg' && now.wd === 'Mon');
  if (diaOk && inWin(cfg.pagHora)) {
    const L = await getLog();
    if (!L[`${today}|atras`]) {
      const atr = (await U.collection('plantoes').where('pago', '==', false).get()).docs.map(d => d.data()).filter(p => p.prev && p.prev < today).sort((a, b) => a.prev.localeCompare(b.prev));
      if (atr.length) {
        await getLocais();
        const soma = atr.reduce((s, p) => s + total(p), 0), p0 = atr[0];
        out.push({ key: 'atras', data: { title: `${atr.length} ${plural(atr.length, 'pagamento atrasado', 'pagamentos atrasados')}`, body: (priv ? '' : `Total ${money(soma)} · `) + `mais antigo: ${nome(p0.localId)}, previsto para ${ddmm(p0.prev)}`, view: 'financeiro' } });
      }
    }
  }

  if (!out.length) return;
  const dead = new Set(), sentNow = {};
  for (const n of out.slice(0, 6)) {
    for (let i = 0; i < tokens.length; i++) {
      try { await webpush.sendNotification(tokens[i].sub, JSON.stringify({ ...n.data, tag: n.key }), { TTL: 7200, urgency: 'high' }); }
      catch (e) {
        console.log('Falha:', e.statusCode, (e.body || e.message || '').toString().slice(0, 160));
        if (e.statusCode === 404 || e.statusCode === 410) dead.add(i);
      }
    }
    sentNow[`${today}|${n.key}`] = Date.now();
    console.log(U.id.slice(0, 6), 'enviada:', n.data.title);
  }
  for (const i of dead) await tokens[i].ref.delete().catch(() => {});
  const keep = {}, cutoff = addDays(today, -7);
  for (const [k, v] of Object.entries({ ...(await getLog()), ...sentNow })) if (k.slice(0, 10) >= cutoff) keep[k] = v;
  await U.collection('meta').doc('sentlog').set({ sent: keep });
}

const users = await db.collection('users').get();
for (const u of users.docs) {
  if (u.data().bloqueado) continue;
  try { await processUser(u.ref); } catch (e) { console.log('Erro no usuário', u.id.slice(0, 6), e.message); }
}
console.log(`Hora SP ${today} ${Math.floor(now.min / 60)}:${String(now.min % 60).padStart(2, '0')} · ${users.size} usuário(s).`);
process.exit(0);
