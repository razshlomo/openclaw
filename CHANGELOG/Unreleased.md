## Unreleased

### Fixes

- Codex: restore background memory narratives and isolated text completions on agent-scoped local runtimes with administrator-managed hooks, preserving managed hooks and existing native-account/proxy routing while keeping ordinary hooks and model tools isolated. (#151658)
- Sandboxes: honor each registered runtime owner's pruning policy so a stricter agent cannot evict another agent's containers or browser bridges.

### Changes

- WhatsApp: decrypt and store the latest selection per voter on known polls for 30 days, and give the agent the stored results of the chat's recent polls when it is woken there; group votes never wake the agent, and a direct-chat vote wakes it only on a poll it sent.
- Messaging: allow cross-provider sends and other guarded message actions by default, including WebChat-to-Discord notifications. Existing configurations that omit `tools.message.crossContext.allowAcrossProviders` adopt the new default on upgrade; explicit `false` remains enforced globally and per agent. Set `allowAcrossProviders: false` to retain provider isolation, or both it and `allowWithinProvider: false` to restrict guarded actions to the current bound conversation. See [security guidance](https://docs.openclaw.ai/gateway/security/tool-permissions#cross-provider-messaging). (#149875)
