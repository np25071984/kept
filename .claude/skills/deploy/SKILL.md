---
name: deploy
description: Deploy Kept to production (kept-ledger.com) with deploy/deploy.sh. Use when the user asks to deploy, ship or release, or to put a change live.
---

# Deploy Kept

Production is one droplet reached as `ssh kept`; `docs/DEVELOPMENT.md` ("Deploying") describes the host. What runs there is always the pushed `main`.

1. Check the tree: `git status --short` must be empty and the branch `main`. If there are uncommitted changes, ask whether to commit them; never deploy around them.
2. If `main` is ahead of `origin/main`, push it: deploying means the pushed `main` is what runs.
3. Run `npm run typecheck` and `npm test`. On a failure, stop and report it with the output; an MCP test that fails once and passes on a rerun is a known flake, so rerun once before treating it as real.
4. Run `deploy/deploy.sh` (timeout 10 minutes). It refuses a dirty or unpushed tree, copies the checkout, rebuilds, applies pending migrations as the server starts, and checks `/health`, `/`, `/app/` and `/app/site.css` from the server itself.
5. Report in a few lines: the commit deployed, the newest migration the server reports, the checks, and anything a visitor would now see. When the change touched sign-in or authentication, say that a real sign-in has not been checked and ask the user to try one.

If a check fails, the script prints the last 30 log lines: read them, report what failed, and don't redeploy blindly. Rolling back is checking out the previous commit and deploying it, which needs the user's go-ahead; a migration that already ran is not undone.