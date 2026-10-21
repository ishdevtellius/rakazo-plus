# Rakazo, plus our improvements

This is [Rakazo](https://github.com/elie222/rakazo) (open source, Apache 2.0) with the full source, web and mobile apps, API, worker and
sandbox supervisor, **plus a few improvements we made**. It contains no bots, routines or company configuration: plain Rakazo
starts empty, and so does this. Create your own bots in your own style.

## What is different from upstream
Eight commits on top of upstream commit `faed3f73` (see `git log faed3f73..HEAD`):

| Change | What you get |
|---|---|
| Plus menu in the chat box | One "+" menu: add files or photos, **Add folder** (zipped in your browser, skipping `.git`, `node_modules`, `.env` and other secret-looking files), slash commands, connectors |
| Composio fixes | A clear message when a toolkit has no shared sign-in (for example Snowflake); `COMPOSIO_AUTH_CONFIGS` lets you give a toolkit your own Composio auth config; the override is only sent to sessions that use that toolkit |
| Own OAuth app sign-in | For providers without one-click sign-in, a form to register your own OAuth app (also keeps it across disconnect) |
| Health endpoint | `composio` shows true when a Composio key is actually active |
| Backup-model failover | A configured backup model now takes over when a ChatGPT-style proxy reports every seat out of credits (HTTP 400 "no provider lists model"), not only on native errors |
| Local backup script | `infra/compose/backup-local.sh`: a verified Postgres dump plus appdata archive for the image-based local stack |
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
