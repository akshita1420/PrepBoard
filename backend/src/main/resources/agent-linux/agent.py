#!/usr/bin/env python3
"""prepboard desktop helper for Linux: runs in the background and asks the server once a minute
whether to show the pixel car. The server decides (your nudge time, 9 pm, contest reminders)."""
import fcntl
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.expanduser("~/.config/prepboard-helper/config.json")
LOG = os.path.join(HERE, "helper.log")
CAR = os.path.join(HERE, "nudge-car.py")


def log(text):
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 200_000:
            os.remove(LOG)
        with open(LOG, "a") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S  ") + text + "\n")
    except OSError:
        pass


def main():
    # Only one helper at a time.
    lock = open(os.path.join(HERE, ".lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return

    try:
        with open(CONFIG) as f:
            config = json.load(f)
    except (OSError, ValueError) as e:
        log(f"cannot read {CONFIG} - run the installer again ({e})")
        return
    server, token = config["server"].rstrip("/"), config["token"]
    log(f"helper started for {config.get('user')} -> {server}")

    while True:
        try:
            req = urllib.request.Request(f"{server}/api/agent/poll", headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=20) as res:
                r = json.load(res)
            if r.get("show"):
                log(f"showing car: {r.get('title')} / {r.get('subtitle')}")
                subprocess.Popen([sys.executable, CAR, "--title", r.get("title", ""), "--subtitle", r.get("subtitle", ""), "--url", server],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                log("this laptop was unlinked from prepboard; run the installer again to relink")
                time.sleep(600)
                continue
        except Exception:
            pass  # offline or server restarting: try again next minute
        # Check a few seconds after each minute starts, so nudges land on time.
        wait = 65 - time.localtime().tm_sec
        time.sleep(wait - 60 if wait > 60 else wait)


if __name__ == "__main__":
    main()
