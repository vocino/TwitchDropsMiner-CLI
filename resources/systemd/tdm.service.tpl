[Unit]
Description=Twitch Drops Miner CLI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={{NODE_PATH}} {{TDM_BIN}} run
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
Environment=TDM_LOG_LEVEL=info

[Install]
WantedBy=default.target

