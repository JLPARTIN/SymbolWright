# CodeMind Browser Workspace

The browser workspace is the operator console for CodeMind. It should work from any modern browser and should not require the browser to know provider SDK details.

## Entrypoint

```txt
/codemind
```

## Required panels

The browser workspace contract requires these panels:

- mission input;
- chat console;
- terminal output;
- tool execution history;
- GitHub PR panel;
- audit evidence panel;
- memory/RAG panel;
- provider selector;
- API key manager;
- session history.

## Provider selector behavior

The provider selector chooses a provider adapter. It must not expose raw provider credentials to the client runtime.

The browser may submit the chosen provider id, such as `openai`, `anthropic`, `google-gemini`, `groq`, `openrouter`, `github-models`, `ollama`, or `custom`.

The browser must not call the provider directly.

## Mission flow

```txt
1. Operator opens /codemind.
2. Operator enters mission and repo.
3. Operator chooses provider.
4. Browser sends mission to CodeMind.
5. CodeMind validates the request.
6. CodeMind routes through policy, audit, provider adapter, tools, and sessions.
7. Browser streams mission events from /api/missions/:id/events.
```

## Source of truth

The contract is defined in `src/workspace/browser-workspace-contract.ts` and guarded by release-readiness.
