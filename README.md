# Plantonista

Agenda de plantões com controle financeiro. App web (PWA) em arquivo único, publicado pelo GitHub Pages.

- Site: https://jaaacked-07.github.io/plantonista/
- Firebase: projeto `plantonista-87e46` (login + dados de cada usuário)
- Lembretes: `.github/workflows/notificacoes.yml` + `scripts/notify.mjs` (GitHub Actions + Web Push), usam o segredo `FIREBASE_SA`
- Regras do Firestore: `firestore.rules` (colar no console do Firebase)
- Código de convite para novas contas: Firestore → coleção `config` → documento `app` → campo `convite`
