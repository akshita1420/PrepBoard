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

### If the VPS already runs a web server

`docker compose up` fails with "port is already allocated" when nginx/Apache/another Caddy already uses 80/443
(check with `ss -ltnp | grep -E ':80 |:443 '`). Then let that server keep the ports and pass prepboard through it:

1. In `.env` set `HTTP_PORT=8088`, `HTTPS_PORT=8443` and `DOMAIN=:80` (prepboard's Caddy then serves plain HTTP inside).
2. `docker compose up -d --build`
3. Add a site for your domain to the existing server, e.g. for nginx (`/etc/nginx/sites-available/prepboard`):

   ```nginx
   server {
       server_name prepboard.aravindc.dev;
       location / {
           proxy_pass http://127.0.0.1:8088;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   then `ln -s /etc/nginx/sites-available/prepboard /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx`
   and get HTTPS with `certbot --nginx -d prepboard.aravindc.dev`.

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

## Sharing with friends

Send them `https://<your domain>`. Each person clicks **sign up** (name, email, LeetCode username, password).
Accounts are separate: nobody can see or change anyone else's data, and one LeetCode username can belong to
only one account.
