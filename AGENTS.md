## Local Guidance

- Machine-specific workflows and host-specific runbooks belong in local skills under `~/.codex/skills/`, not in this repo-level `AGENTS.md`.
- Keep this file limited to durable guidance that should apply across machines and projects.
- Use the local `vm-handover` skill when a task involves handing work off to the private Linux VM.

## Dev Server

- Run the local dev server through `scripts/dev-server.sh`; do not leave ad hoc `npm run dev` processes running outside tmux.
- Main checkout uses `http://localhost:8091/`.
- Codex worktrees under `~/.codex/worktrees/` auto-select ports `8092` through `8097`; Spark keeps the `8081` through `8087` range.
- Commands:
  - `scripts/dev-server.sh start` starts or reports the tmux-managed server for the current checkout.
  - `scripts/dev-server.sh restart [port]` restarts it, reclaiming port `8091` for the main checkout when needed.
  - `scripts/dev-server.sh stop [port]` stops the managed server for the checkout or port.
  - `scripts/dev-server.sh logs [port]` tails `/tmp/family-spark-dev-<port>.log`.
  - `scripts/dev-server.sh status` lists managed `family-spark-dev-*` tmux sessions.

## Local Test Accounts

- Use `/login-with-email` for deterministic local auth checks.
- Adult test account: read `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from local `.env.local`; do not copy the adult password into tracked files.
- Primary child login is `/child-login`: parent creates a learner profile, sets a PIN, then the learner uses family code + profile name + PIN on an approved browser/device.
- Local fallback family code for older in-memory test families is `SPARK-1000`; new families get a generated code shown in the parent dashboard.
- Suggested local learner profiles: `Maya`, age `10`, PIN `4821`; `Leo`, age `14`, PIN `7394`.
- Optional Firebase email/password child accounts still exist for compatibility checks, not as the primary child model:
  - Child learner, 8-12 mode: `family-spark-child-8-12@example.com` / `FamilySpark-child-8-12!`.
  - Young teen learner, 13-15 mode: `family-spark-teen-13-15@example.com` / `FamilySpark-teen-13-15!`.
