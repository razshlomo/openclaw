## Unreleased

- Model catalog (local #155753 mitigation): batch expired providers into one worker refresh and limit automatic expiry-triggered rebuilds to once per 10 minutes per runtime. Explicit refresh, changed-only configuration, and auth changes are not throttled. This patch is local and temporary: when an official #155753 fix is released, compare semantics, run the refresh and load tests, and confirm no CPU/memory regression before removing it in a separate commit.
