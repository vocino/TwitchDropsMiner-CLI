# TwitchDropsMiner-CLI

Headless, npm-installable CLI rewrite of TwitchDropsMiner for Linux server operation.

## Install

```bash
npm install -g twitchdropsminer-cli
tdm doctor
```

## Headless authentication

```bash
tdm auth login --no-open
tdm auth validate
```

Alternative imports:

```bash
tdm auth import --token-file /secure/path/token.txt
tdm auth import-cookie --cookie-file /secure/path/cookies.txt
```

## Run miner

```bash
tdm run
```

## Service mode

```bash
tdm service install --user --autostart
tdm service start
tdm service status
tdm logs --follow
```

More ops docs:

- `docs/ops/linux-install.md`
- `docs/ops/authentication.md`
- `docs/ops/service-management.md`
- `docs/ops/systemd-hardening.md`

