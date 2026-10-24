# Rakazo, plus our improvements

This is [Rakazo](https://github.com/elie222/rakazo) (open source, Apache 2.0) with the full source, web and mobile apps, API, worker and
sandbox supervisor, **plus a few improvements we made**. It contains no bots, routines or company configuration: plain Rakazo
starts empty, and so does this. Create your own bots in your own style.

## What is different from upstream
Commits on top of upstream commit `faed3f73` (see `git log faed3f73..HEAD`):

| Change | What you get |
|---|---|
| Plus menu in the chat box | One "+" menu: add files or photos, **Add folder** (zipped in your browser, skipping `.git`, `node_modules`, `.env` and other secret-looking files), slash commands, connectors |
| Composio fixes | A clear message when a toolkit has no shared sign-in (for example Snowflake); `COMPOSIO_AUTH_CONFIGS` lets you give a toolkit your own Composio auth config; the override is only sent to sessions that use that toolkit |
| Own OAuth app sign-in | For providers without one-click sign-in, a form to register your own OAuth app (also keeps it across disconnect) |
| Health endpoint | `composio` shows true when a Composio key is actually active |
| Backup-model failover | A configured backup model now takes over when a ChatGPT-style proxy reports every seat out of credits (HTTP 400 "no provider lists model"), not only on native errors |
| Local backup script | `infra/compose/backup-local.sh`: a verified Postgres dump plus appdata archive for the image-based local stack |
| Per-bot connector tool policy | Each bot has a rule for connector tools that change data: **block** (the default for new bots), **ask every time**, or **allow**, plus per-tool allow and block lists. It judges the real tool inside Composio's wrapper, so a blocked tool stays blocked |
| Tool browser | Integrations and bot settings list every tool of an app, labelled "Read only" or "Changes data", with per-tool switches |
| Shared vault | Settings > Vault: save a website login once, choose which bots may use it. A bot types it only into the saved HTTPS site and never sees the password |
| Bot templates gallery | **+ > Browse bot templates**: about 35 generic, ready-made bots in 8 categories with a Featured row, per-category "View all", a detail view with the full instructions, and a "needs these apps" line. Every template starts with changes to connected apps blocked. Add your own in `apps/web/src/lib/bot-templates-catalog.ts` |
| Run bots on your own Mac | **Settings > Where bots run**: switch every bot's computer between the Docker computer and this Mac. Commands run natively (much faster), and bots browse with a separate Chrome window you sign in to once. A sandboxed [Mac host agent](../infra/host-agent/README.md) keeps bots out of your home folder. Includes fixes so large saved workspaces restore and runs no longer copy the workspace back each time |
| Translations | The new strings are in all locale catalogs (English text for locales without a translation yet) |

## Build and run
```bash
docker build -f infra/compose/Dockerfile --build-arg GIT_SHA=local-$(git rev-parse --short=8 HEAD) -t rakazo-fork/app:local .
mkdir -p ~/rakazo-stack && cp infra/compose/docker-compose.images.yml infra/compose/.env.images.example infra/compose/install-images.sh ~/rakazo-stack/
cd ~/rakazo-stack && bash install-images.sh --local --prepare-only      # writes .env with random secrets
# in .env set: RAKAZO_IMAGE=rakazo-fork/app and RAKAZO_IMAGE_TAG=local
docker compose --env-file .env -f docker-compose.images.yml up -d --wait
```
Then open http://127.0.0.1:5173 and create your account. Keep `.env` private. The rest of Rakazo (connecting tools, models, bots,
routines) works exactly as in upstream's documentation.

## Staying current
`git remote add upstream https://github.com/elie222/rakazo && git fetch upstream && git rebase upstream/main`, then rebuild.
