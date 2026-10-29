# Kimi Code and Claude Code in BB

The Kimi side of this comparison was updated on 2026-10-28 for plugin 0.6.0, BB 0.47.1 and Plugin SDK 0.6.79. The Claude column retains the bundled-provider review from 2026-10-18. It compares BB features, not model quality or CLI features outside BB.

## Current integration

| Feature | Claude Code provider | Kimi Code plugin |
| --- | --- | --- |
| Provider picker, icon, automatic model discovery | Supported | Supported |
| Installation status and Install/Update actions | Supported | Supported; preserves the detected package manager |
| Account, subscription and quota windows | Supported when signed in | Supported when signed in |
| Usage account identity across machines | Provider-issued account identity | Provider-issued, namespaced user identity; unknown identities stay null |
| Machine inventory and collection failures | Retains disconnected resources; returns collection errors as usage states | Retains disconnected non-ephemeral machines; host collection failures return usage states |
| Health check | Local executable and credential checks | Local executable and file-credential checks; no network, token refresh or migration |
| Credential storage for usage | macOS Keychain or credential file | Python CLI-managed credentials; Node file OAuth or configured API key, without keyring support |
| OAuth refresh during usage collection | Reads existing credentials; reports expired tokens | Python delegates refresh to its CLI; Node reads existing credentials and reports expiry |
| Streaming, tool calls and cancellation | Native Claude bridge | Shared ACP bridge |
| Session restoration | Supported | Available when the agent can load the recorded session; otherwise the ACP bridge warns and starts fresh |
| BB tools and instructions | Delivered through the provider bridge | BB dynamic tools are forwarded through a session MCP server; instructions use the ACP bridge |
| Permission modes | Accept Edits, Approve for me, Full Access | Accept Edits and Full Access; this ACP bridge rejects automatic reviewer mode |
| Shell sandbox | Claude sandbox integration, enabled by default | No equivalent enforced shell sandbox; the ACP workspace file-write check does not confine shell processes |
| Native structured user questions | Supported | Not advertised by this plugin |
| Structured Plan mode in BB | Supported | Not wired into the plugin |
| Edit a sent message / rewind | Supported | Not supported by the current integration |
| Fork | Fork at a checkpoint | Disabled in plugin metadata; version-dependent opportunity for a tip fork |
| Manual compaction from BB | Supported | Not advertised; shared bridge has a `/compact` route that needs Kimi-specific verification |
| Reasoning and service tier controls | Explicit effort levels and Fast tier | One row per model; separate binary Thinking on Python or native per-model effort on Node; no Fast tier is advertised |
| Native skill and command discovery in BB | Declared roots and dynamic discovery of installed Claude plugins | Host-resolved user/project/extra roots, CLI generation and legacy brand precedence; vendor-plugin and built-in inventories are not imported |
| Diagnostic and update guidance | Standard BB maintenance | `bb kimi status`; optional registry checks, source-aware update guidance; no unattended updater |
| Provider settings | Memory, native subagents/workflows, large context, Chrome and sandbox controls | No provider-specific settings surface |
| Forward BB archive/rename to the CLI | Neither is advertised | Neither is advertised |
| Completed-turn presentation | Flat by default | Collapsed by default |

Tool availability and permission to execute are separate. Neither a delivered MCP tool nor an ACP capability declaration establishes a global trusted-tool policy. The permission modes also have different enforcement boundaries: Kimi's Accept Edits is not equivalent to Claude's sandbox.

## Version-dependent opportunities

Initialization probes confirmed that the installed Python CLI 1.50.0 supports session loading and images but does not advertise session forks. Its installed ACP implementation leaves forks unimplemented and accepts only the default session mode. An isolated Node CLI 2.2.0 initialization advertises loading, forks, images and HTTP/SSE MCP. Those initialization probes did not send model prompts. Compatibility checks now exercise Python 1.50.0 and Node 2.3.3 through the shared BB bridge with isolated configuration and a local HTTP fixture, covering catalog labels, Thinking/effort, model round trips and session restoration. Interactive defaults remain unchanged.

The modern CLI's [ACP reference](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-acp.md) documents session forks, mode selection and native elicitation. These are opportunities for a version-aware adapter, not features enabled by this plugin. Forks also need checks for MCP inheritance and the shared bridge's tip-only restriction; they cannot provide Claude-style checkpoint rewind by changing a flag.

Kimi also has [native skill locations](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/skills.md). This plugin now exposes user, project and configured extra roots in BB, handling the installed CLI generation, configurable data directory, legacy directory precedence and flat skills. This is distinct from BB's existing skill delivery.

## Priorities

1. Verify manual compaction and version-aware tip forks before enabling their UI controls. An isolated Python 1.50.0/local-API probe did not confirm compaction completion, so it remains disabled.
2. Evaluate modern mode/question support against the bridge version. Do not advertise unsupported capabilities on Python installations.
3. Consider vendor-plugin skill inventories and broader credential-storage support only with their host-specific contracts verified.

## Evidence and limits

The comparison uses live provider metadata, the installed Claude provider's declaration and maintenance implementation, this plugin's sources, the published ACP bridge, initialization probes and real-CLI compatibility checks. Both providers use the same BB usage renderer and typography; the plugin supplies the sign-in and expired-session text. The updated Kimi text follows Claude's wording while preserving the actual authentication state.

See the [README](../README.md) for installation, permissions and verification commands. No live Claude conversation, real model inference, graphical layout check, fork or shell-isolation test was performed for this comparison. Compaction was attempted with an isolated CLI and local fake API, not a subscription-backed model; no successful compaction claim is made. An expired usage state still requires a valid Kimi login; changing its text does not refresh credentials.
