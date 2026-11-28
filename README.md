# Plantonista

Agenda de plantões com controle financeiro. App web (PWA) em arquivo único, publicado pelo GitHub Pages.

- Site: https://jaaacked-07.github.io/plantonista/
- Firebase: projeto `plantonista-87e46` (login + dados de cada usuário)
- Lembretes: `.github/workflows/notificacoes.yml` + `scripts/notify.mjs` (GitHub Actions + Web Push), usam o segredo `FIREBASE_SA`
- Regras do Firestore: `firestore.rules` (colar no console do Firebase)
- Código de convite para novas contas: Firestore → coleção `config` → documento `app` → campo `convite`

## Publicar uma atualização (aviso automático nos apps instalados)
A cada mudança no app, aumente a versão em **três** lugares, com o mesmo número:
1. `index.html` → `const VERSAO = 'X.Y';`
2. `version.json` → `"versao": "X.Y"` e `"notas"` com uma frase do que mudou (aparece no aviso)
3. `sw.js` → `const VERSION = 'plantonista-vN';` (qualquer número novo)

Os apps abertos conferem `version.json` ao abrir, ao voltar para a tela e a cada 30 minutos; se a versão for maior que a deles, mostram o aviso "Nova versão" com o botão **Atualizar agora**.
