## Authentication (headless)

### Device-code login (recommended)

```bash
tdm auth login --no-open
```

Follow the printed `verification_uri` and `user_code` on another device.

### Import an existing token

```bash
tdm auth import --token "auth-token=XXXX"
# or
tdm auth import --token-file /secure/path/token.txt
```

### Import cookies

```bash
tdm auth import-cookie --cookie "auth-token=XXXX; other=YYY"
# or
tdm auth import-cookie --cookie-file /secure/path/cookies.txt
```

### Validate

```bash
tdm auth validate
```

