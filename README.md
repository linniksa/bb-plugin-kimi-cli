# Kimi Code for BB

An independent Kimi Code provider plugin for BB, with an official Kimi mark, model discovery, account and subscription details, and quota windows in Provider usage. No custom ACP agent configuration is required.

This plugin wraps Kimi Code CLI. The repository and package are named `bb-plugin-kimi-cli`. The plugin, provider and bundled skill all use `kimi-cli`, and BB displays **Kimi Code**. Technical IDs stay stable when display copy changes. Conversations, tools, permissions and session restoration use BB's published ACP bridge; ACP is the transport, not part of the provider ID.

## Requirements and installation

- BB 0.47.1+ with Plugin SDK 0.6.79-compatible APIs.
- Python Kimi Code on PATH, signed in with `kimi login`. Tested on macOS with CLI 1.50.0.
- Node.js 22.19+ for source checks.

Install directly from GitHub:

```sh
bb plugin install git:https://github.com/linniksa/bb-plugin-kimi-cli.git@main
```

For local development from a checkout:

```sh
npm ci
bb plugin build .
bb plugin install .
```

Select **Kimi Code** in BB. Model choices come from the installed CLI. Account details come from Kimi's `/me` endpoint and quota from `/usages`; an unavailable profile stays blank instead of guessing the account or subscription.

## Upgrading from earlier registrations

Version 0.4 changes the provider ID from `acp-kimi` to `kimi-cli`. BB persists provider IDs in threads and its public SDK does not support changing them. This plugin does not rewrite BB's database or register a second provider as an alias. Existing thread history remains, but continuing an old thread requires its original provider registration. Start new threads with **Kimi Code**; keep the earlier registration available if old threads must continue.

Plugin 0.2 used the plugin ID `kimi-usage`; version 0.3 used `kimi-cli` with the old provider ID. Keep a backup of the earlier installation or custom ACP settings before upgrading. If replacing a custom ACP registration, remove only its Kimi entry after deciding how to handle old threads; keep unrelated entries.

Upstream identifiers remain unchanged: the executable is `kimi`, the modern npm package is `@moonshot-ai/kimi-code`, and its configuration uses `KIMI_CODE_HOME`, `.kimi-code` and `managed:kimi-code`. These are CLI interfaces, not alternative names for this plugin.

## CLI installation and updates

Kimi Code appears in BB's standard provider maintenance UI with installation status, installed/latest versions, and Install/Update actions. The bridge returns commands to BB for execution and verification; checking status never runs an installer.

A new installation uses the current Node CLI through npm, or Homebrew when npm is unavailable. Updates stay in the detected channel: Homebrew's matching formula, uv's legacy Python tool, npm's modern package, or the modern native updater. Unknown installations offer no automatic update. Version checks use the corresponding registry; an unavailable registry does not become a zero version or a guessed update.

Updating a Python installation does not migrate it to Node. Python Kimi Code is archived; migration requires installing the successor and logging in again. Follow the [official migration instructions](https://github.com/MoonshotAI/kimi-cli#readme). The plugin does not migrate sessions, change accounts, or uninstall an existing CLI.

After a tracking Git/npm installation, plugin updates use `bb plugin update kimi-cli`. BB applies compatible updates on request; it does not apply plugin updates automatically. Exact pins stay pinned. Local path installs do not download updates: update the source checkout, build it and reload the plugin on the BB server.

Legacy Python CLI startup update reminders are controlled by `KIMI_CLI_NO_AUTO_UPDATE`. They are interactive reminders, not an ACP auto-update service. Modern native CLI updates and package-manager updates remain separate from BB plugin updates. Follow the [official Kimi Code installation guide](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md) for current CLI upgrade options.

## Permissions

Use BB's thread permission selector:

- **Accept Edits** forwards ACP approval requests to BB; writes through ACP's file API outside the workspace are denied.
- **Full Access** automatically approves the agent's ACP requests.

These are not an operating-system sandbox. A permitted shell process is not confined by the ACP file-write check. Python Kimi Code 1.50.0 requests approvals for shell commands and MCP tool calls; session approvals are managed by Kimi. This plugin does not add a global trusted-tool policy or auto-approve tools independently of BB.

Automatic reviewer mode, fast service tiers, fork, archive forwarding and manual compaction are not advertised. Feature parity with other providers is limited by Kimi and BB's ACP bridge.

## Privacy and compatibility

Credentials remain on their machine. Kimi Code owns token refresh and its locking; only quota and displayable account metadata cross host RPC. The plugin does not store tokens, proxy inference requests, or log account responses. Collection is bounded and quota RPC results are cached briefly; explicit refresh fetches again.

Account/usage collection currently relies on Python Kimi Code internals. The newer Node Kimi Code CLI, standalone binaries, custom config locations, and untested operating systems are not supported by this collector. An unsupported install reports an error. Account and quota endpoints are restricted to the official Kimi Code service hosts.

Keep the plugin source directory while using a local path installation. Do not commit local credentials, BB settings backups, account-response recordings, or session transcripts.

## Development

```sh
npm run check
npm test
bb plugin build .
```

The tests cover quota/profile parsing, maintenance protocol validation, the shared ACP bridge's conformance suite, and allow/deny/full-access behavior against a synthetic ACP agent. They do not establish operating-system isolation or test every Kimi tool. Live checks also verified provider registration, model availability, and account/quota collection; the graphical UI has not been inspected.

## License and attribution

Plugin code is MIT licensed. Kimi branding is excluded from that license; see [NOTICE](NOTICE). This is an unofficial community integration, not endorsed by Moonshot AI or BB.
