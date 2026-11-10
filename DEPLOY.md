# Deploying prepboard to the VPS

After the one-time setup below, every `git push` to `main` builds and redeploys the site by itself
(GitHub Actions → SSH into the VPS → `docker compose up -d --build`).

## 1. Domain

Pick the address, for example `prepboard.aravindc.dev`, and add a DNS **A record** pointing it at the VPS's IP
(the same IP as `vps.aravindc.dev`). You can also use `vps.aravindc.dev` itself if nothing else on the VPS
uses ports 80/443.

## 2. VPS (once, as root)

```bash
ssh root@vps.aravindc.dev

# Docker
curl -fsSL https://get.docker.com | sh

# The code
git clone https://github.com/akshita1420/PrepBoard.git /opt/prepboard
cd /opt/prepboard
cp .env.example .env
nano .env          # set DOMAIN, DB_PASSWORD, VAPID keys, (optional) mail

docker compose up -d --build
```

Open `https://<your domain>`. Caddy gets the HTTPS certificate automatically on first visit.

VAPID keys for browser push: run `npx web-push generate-vapid-keys` anywhere and paste both into `.env`.

## 3. Auto-deploy from GitHub (once)

On your laptop, make a key just for deploys:

```bash
ssh-keygen -t ed25519 -f prepboard-deploy -N ""
```

- Put the **public** key on the VPS: append the contents of `prepboard-deploy.pub` to `/root/.ssh/authorized_keys`.
- In GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
  - `VPS_HOST` = `vps.aravindc.dev`
  - `VPS_USER` = `root`
  - `VPS_SSH_KEY` = the full contents of the **private** key file `prepboard-deploy`

Push anything to `main` and watch it under the repo's **Actions** tab.
If the repo is private, the VPS also needs read access to pull it (a GitHub deploy key on the VPS).

## 4. The pixel car on someone's laptop

Each person, once: open the dashboard → **overview → nudge → desktop helper → set up**,
download the helper, double-click `install.cmd`, paste the code. From then on the car appears at their
nudge time and at 9 pm (their own time zone) and before contests, with the website closed.
Their laptop just needs to be on, signed in to Windows, and online.

## Before inviting other people

There's no password yet: anyone who knows a user's email and LeetCode username can open that dashboard.
Add real sign-in before sharing the link widely.
