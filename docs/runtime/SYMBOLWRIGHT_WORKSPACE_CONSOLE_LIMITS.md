# Workspace Console Limits

The CM-200-L workspace console is a deterministic render layer only.

It does not perform file mutation, shell execution, provider invocation, GitHub writes, approval bypasses, or background automation.

The follow-up bundle should wire this render layer into a top-level operator surface after CI validates the renderer.
