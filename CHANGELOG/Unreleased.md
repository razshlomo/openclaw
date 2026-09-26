## Unreleased

- Model catalog (local #155753 mitigation): batch expired providers into one worker refresh and limit automatic expiry-triggered rebuilds to once per 10 minutes per runtime. Explicit refresh, changed-only configuration, and auth changes are not throttled.
