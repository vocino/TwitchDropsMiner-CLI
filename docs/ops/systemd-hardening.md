## systemd hardening notes

Recommended service-level settings:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `Restart=on-failure`
- `RestartSec=5`
- `After=network-online.target`
- `Wants=network-online.target`

Use user-level units for least privilege unless you explicitly need a system unit.

