# Real poll vote fixtures

Each `*.json` file here is a WhatsApp poll vote captured from a real client.
`src/inbound/poll-vote-real-fixtures.test.ts` replays every file through
`resolveWhatsAppPollVote` and expects the vote to decode.

## Capturing a vote

When a vote cannot be decrypted, the gateway writes it to
`<state dir>/whatsapp/poll-vote-failures/<time>-<poll id>-<suffix>.json`
(mode 0600, newest 20 kept). The log line `whatsapp poll vote rejected` then
shows `captured: true`.

## Turning a capture into a fixture

Use a throwaway test poll: the fixture holds that poll's secret.

```json
{
  "name": "direct chat vote from an Android client",
  "self": { "jid": "<linked phone PN JID>", "lid": "<linked phone LID>" },
  "record": "<the poll record from plugin state, namespace whatsapp.poll-sent>",
  "capture": "<the saved failure file, unchanged>",
  "expectedSelected": ["<option the voter picked>"]
}
```

`record` is the stored `WhatsAppPollRecord` value (`chatJids`, `creatorJids`,
`question`, `secret`, `options`, `selectableCount`, `origin`).
