## Running as a service (systemd)

### Install user-level service

```bash
tdm service install --user --autostart
tdm service start
```

### Check status

```bash
tdm service status
```

### Logs (journalctl)

Use standard `journalctl` commands, e.g.:

```bash
journalctl --user -u tdm.service -f
```

