# Kimi Code for BB

An independent Kimi Code provider plugin for BB, with an official Kimi mark, model discovery, account and subscription details, and quota windows in Provider usage. No custom ACP agent configuration is required.

This plugin wraps Kimi Code CLI. The repository and package are named `bb-plugin-kimi-cli`. The plugin, provider and bundled skill all use `kimi-cli`, and BB displays **Kimi Code**. Technical IDs stay stable when display copy changes. Conversations, tools, permissions and session restoration use BB's published ACP bridge; ACP is the transport, not part of the provider ID.

## Requirements and installation

- BB 0.47.1+ with Plugin SDK 0.6.79-compatible APIs.
- Kimi Code on PATH, signed in with `kimi login`. The modern Node CLI and legacy Python CLI are detected separately; Python 1.50.0 and Node 2.3.3 are covered by real-CLI compatibility checks.
- Node.js 22.19+ for source and modern CLI checks.

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

Use `bb kimi status --help` for read-only diagnostics and update hints on the selected machine. A normal status check stays local. Add `--check-updates` to query the CLI registry without installing anything; `--json` returns structured diagnostics without credentials. The command distinguishes the plugin source from the CLI installation channel and does not schedule unattended upgrades.

Legacy Python CLI startup update reminders are controlled by `KIMI_CLI_NO_AUTO_UPDATE`. They are interactive reminders, not an ACP auto-update service. Modern native CLI updates and package-manager updates remain separate from BB plugin updates. Follow the [official Kimi Code installation guide](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md) for current CLI upgrade options.

## Models and Thinking

Models appear once under the CLI's display names. Thinking is a separate per-model control: the legacy Python adapter exposes only On/Off modes that the CLI can execute; modern Node sessions expose their native effort levels. An always-thinking model has no Off choice; a confirmed mandatory binary setting is labelled **Always on**. BB still renders a singleton as a selectable control; the plugin cannot change that host layout. Highspeed models retain their own identity and quota-cost labels; the plugin does not infer model families by stripping name suffixes or enable a Fast service tier.

Local model metadata follows the selected CLI generation and launch environment. When existing managed credentials are readable, discovery can enrich names and thinking requirements from the official model catalog. This read-only request is bounded and briefly cached; offline discovery falls back to the CLI configuration. Tokens are not refreshed or sent to BB. Explicit model overrides take precedence over enrichment. Declared effort sets constrain inherited choices and defaults; absent effort metadata preserves the native CLI catalog. Without an authoritative effort declaration, Node 2.3.3 can still advertise an inherited current effort that it later rejects.

The Python compatibility server adds native ACP model/Thinking options while keeping Kimi's session loading, streaming, tools and permission handling. BB model discovery and selections are session-local and do not rewrite the interactive CLI's defaults. This adapter relies on the tested Python server and ACP router internals; other Python releases need verification before claiming compatibility. Modern Node sessions use Kimi's own config-option implementation.

## Permissions

Use BB's thread permission selector:

- **Accept Edits** forwards ACP approval requests to BB; writes through ACP's file API outside the workspace are denied.
- **Full Access** automatically approves the agent's ACP requests.

These are not an operating-system sandbox. A permitted shell process is not confined by the ACP file-write check. Python Kimi Code 1.50.0 requests approvals for shell commands and MCP tool calls; session approvals are managed by Kimi. This plugin does not add a global trusted-tool policy or auto-approve tools independently of BB.

Automatic reviewer mode, fast service tiers, fork, archive forwarding and manual compaction are not advertised. Feature parity with other providers is limited by Kimi and BB's ACP bridge.

See the [Claude Code comparison](docs/provider-comparison.md) for the current feature matrix, version-dependent opportunities and remaining integration gaps.

## Native skills and diagnostics

BB discovers Kimi Code user, project and configured extra skill directories on the workspace host. Discovery follows the installed CLI generation, the nearest Git project root, legacy brand-directory precedence and `merge_all_available_skills`. Modern data roots honor `KIMI_CODE_HOME`; legacy skill roots follow the CLI's fixed skill locations independently of its data directory. Canonical `SKILL.md` directories and flat Markdown skills are supported. Vendor-plugin and built-in skill inventories are not imported into BB; BB-provided plugin skills remain available through the normal agent configuration.

Health checks only read the local executable and existing file credentials. They never contact the quota service, refresh a token or migrate keyring storage. Account and subscription metadata come from usage collection instead. Usage resources retain disconnected machines, return collection failures as unavailable states, and use provider-issued user identity to recognize the same account across machines. Explicit refresh requests fetch after an older background request rather than accepting its result.

## Privacy and compatibility

Credentials remain on their machine. Python Kimi Code owns token refresh and its locking; the Node adapter reads its existing token without rotating or writing credentials. If that token expires, open Kimi to refresh its login, then refresh BB usage. In both cases, only quota and displayable account metadata cross host RPC. The plugin does not store tokens, proxy inference requests, or log account responses. Collection is bounded and quota RPC results are cached briefly; explicit refresh fetches again.

Python account/usage collection relies on its CLI internals. The Node adapter reads the managed Kimi provider from config.toml and supports file OAuth credentials, configured API keys and api_key_env. KIMI_CODE_HOME is honored; keyring credentials and custom endpoints are unsupported. Account and quota requests are restricted to the official Kimi Code service hosts and do not follow redirects. A failed optional profile request does not discard quota.

Local checks cover macOS; CI also runs both real CLI generations against a local HTTP fixture on Linux. Native CLI migrations and live Node OAuth refresh are not covered by those tests.

Keep the plugin source directory while using a local path installation. Do not commit local credentials, BB settings backups, account-response recordings, or session transcripts.

## Development

```sh
npm run check
npm test
bb plugin build .
```

The tests cover model identity and metadata, per-generation Thinking controls, quota/profile identity, local health and credential boundaries, usage inventory/cache/refresh failures, native skill roots, diagnostic command routing, installer selection, maintenance validation, ACP conformance, and allow/deny/full-access behavior. They do not establish operating-system isolation or test every Kimi tool. Live checks also verified provider registration, model availability, and account/quota collection; the graphical UI has not been inspected.

Real CLI compatibility checks use `npm run test:cli`. Set `KIMI_TEST_PYTHON` to an interpreter with the legacy CLI installed and `KIMI_TEST_NODE` to the modern CLI executable. The [CI workflow](.github/workflows/check.yml) is the source of truth for installation and pinned versions. These tests use isolated homes, fixture credentials and a local model endpoint; they do not use a subscription.

## License and attribution

Plugin code is MIT licensed. Kimi branding is excluded from that license; see [NOTICE](NOTICE). This is an unofficial community integration, not endorsed by Moonshot AI or BB.
