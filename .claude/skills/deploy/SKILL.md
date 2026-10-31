---
name: deploy
description: Deploy Kept to production (kept-ledger.com) with deploy/deploy.sh. Use when the user asks to deploy, ship or release, or to put a change live.
---

# Deploy Kept

Production is one droplet reached as `ssh kept`; `docs/DEVELOPMENT.md` ("Deploying") describes the host. What runs there is always the pushed `main`.

1. Deploy what is merged: switch to `main` and `git pull`. Changes reach `main` only through merged pull requests (`AGENTS.md`), so never push `main` directly. If the change the user means is still on a branch or in an open pull request, say so and stop until it is merged.
2. Check the tree: `git status --short --untracked-files=no` must be empty, so the tests in step 3 run on the code that deploys. If tracked files have changes, ask what to do with them. Untracked files don't matter: the server fetches the commit from GitHub, and nothing local reaches it.
3. Run `npm run typecheck` and `npm test`. On a failure, stop and report it with the output; an MCP test that fails once and passes on a rerun is a known flake, so rerun once before treating it as real.
4. Run `deploy/deploy.sh` (timeout 10 minutes). The server checks out `origin/main` from GitHub, rebuilds, applies pending migrations as it starts, and checks `/health`, `/`, `/app/` and `/app/site.css` from itself.
5. Report in a few lines: the commit deployed, the newest migration the server reports, the checks, and anything a visitor would now see. When the change touched sign-in or authentication, say that a real sign-in has not been checked and ask the user to try one.

If a check fails, the script prints the last 30 log lines: read them, report what failed, and don't redeploy blindly. Rolling back is `KEPT_REV=<earlier commit> deploy/deploy.sh`, which needs the user's go-ahead; a migration that already ran is not undone.