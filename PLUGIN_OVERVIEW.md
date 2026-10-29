## What you get

Use Kimi Code in BB without a custom ACP registration. Select models by their CLI display names with a separate Thinking control, use BB tools and instructions, and see account, subscription and quota information in Provider usage. The provider includes the official Kimi mark and host-aware native skill discovery.

## Installation and updates

BB's provider maintenance controls report installed and available CLI versions and offer Install or Update actions for recognized installation sources. Updates preserve the detected package manager. The `bb kimi status` command provides local readiness checks and source-aware update guidance, with registry queries available explicitly. Checking status never installs software or enables unattended upgrades. Plugin and CLI updates are separate.

## Requirements

Requires BB 0.47.1+ with compatible Plugin SDK 0.6.79 APIs, and Kimi Code CLI installed and signed in on the machine running the agent. Kimi account and subscription requirements still apply. The modern Node CLI and legacy Python CLI use separate adapters; legacy-to-modern account or session migration is not automatic.

Credentials stay on their machine. The provider supports Accept Edits and Full Access; ACP file-write checks do not provide an operating-system shell sandbox. This is an independent community plugin, not endorsed by Moonshot AI or BB.

See the [documentation](https://github.com/linniksa/bb-plugin-kimi-cli#readme) for supported versions and integration limits.
