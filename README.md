# Kimi CLI for BB

An independent Kimi Code provider plugin for BB, with an official Kimi mark, model discovery, account and subscription details, and quota windows in Provider usage. No custom ACP agent configuration is required.

The plugin registers `acp-kimi` directly through BB's provider API and uses BB's published ACP bridge for conversations, tools, permissions and session restoration. The package ID remains `kimi-usage` for upgrades from version 0.1.

## Requirements and installation

- BB 0.46+ with Plugin SDK 0.6.49-compatible APIs.
- Python Kimi CLI on PATH, signed in with `kimi login`. Tested on macOS with CLI 1.50.0.
- Node.js 22.18+ for source checks.

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

If migrating from a custom ACP registration, remove only the `id: "kimi"` entry from the ACP providers plugin before enabling this provider. Keep other entries. The stable `acp-kimi` ID preserves existing thread references. Back up the old setting first; restore it if you remove this plugin.

## Permissions

Use BB's thread permission selector:

- **Accept Edits** forwards ACP approval requests to BB; writes through ACP's file API outside the workspace are denied.
- **Full Access** automatically approves the agent's ACP requests.

These are not an operating-system sandbox. A permitted shell process is not confined by the ACP file-write check. Python Kimi CLI 1.50.0 requests approvals for shell commands and MCP tool calls; session approvals are managed by Kimi. This plugin does not add a global trusted-tool policy or auto-approve tools independently of BB.

Automatic reviewer mode, fast service tiers, fork, archive forwarding and manual compaction are not advertised. Feature parity with other providers is limited by Kimi and BB's ACP bridge.

## Privacy and compatibility

Credentials remain on their machine. Kimi CLI owns token refresh and its locking; only quota and displayable account metadata cross host RPC. The plugin does not store tokens, proxy inference requests, or log account responses. Collection is bounded and quota RPC results are cached briefly; explicit refresh fetches again.

Account/usage collection currently relies on Python Kimi CLI internals. The newer Node Kimi Code CLI, standalone binaries, custom config locations, and untested operating systems are not supported by this collector. An unsupported install reports an error. Account and quota endpoints are restricted to the official Kimi Code service hosts.

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
