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

## 3. Auto-deploy (once)

The VPS pulls updates itself: a systemd timer checks GitHub every 2 minutes and rebuilds when `main`
has new commits. (GitHub's servers can't reach this VPS over SSH, so GitHub doesn't push.)

```bash
cp /opt/prepboard/deploy/prepboard-autodeploy.service /opt/prepboard/deploy/prepboard-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now prepboard-autodeploy.timer
```

Check it: `systemctl list-timers prepboard-autodeploy.timer` and `journalctl -u prepboard-autodeploy -n 20`.
GitHub Actions still builds every push, so a broken commit shows up red in the **Actions** tab.
If the repo is private, the VPS needs read access to pull it (a GitHub deploy key on the VPS).

## 4. The pixel car on someone's laptop

Each person, once: open the dashboard → **overview → nudge → desktop helper → set up**,
download the helper, double-click `install.cmd`, paste the code. From then on the car appears at their
nudge time and at 9 pm (their own time zone) and before contests, with the website closed.
Their laptop just needs to be on, signed in to Windows, and online.

## Email (needed for sign-up)

Sign-up emails a 6-digit code, so the server needs a mailbox to send from. With Gmail:

1. Turn on 2-Step Verification for the Gmail account.
2. Create an **App Password**: https://myaccount.google.com/apppasswords (name it "prepboard").
3. On the VPS, edit `/opt/prepboard/.env`:
   ```
   MAIL_USERNAME=youraddress@gmail.com
   MAIL_PASSWORD=the 16-letter app password (no spaces)
   ```
4. `cd /opt/prepboard && docker compose up -d`

Until this is set, codes are written to the backend log instead (`docker compose logs backend | grep "Sign-up code"`).

## Sharing with friends

Send them `https://<your domain>`. Each person clicks **sign up** (name, email, LeetCode username, password).
Accounts are separate: nobody can see or change anyone else's data, and one LeetCode username can belong to
only one account.
