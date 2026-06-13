# Anchored Speaking Agent

Text-anchored English speaking practice for children. A child selects an anchor text, a tutor role, and a voice, then speaks with an AI tutor in realtime.

## Features

- Anchor text, keywords, and target sentence patterns.
- Tutor roles: patient tutor, story guide, and interviewer.
- Realtime voice mode through an OpenAI Realtime compatible proxy.
- Voice selection: `alloy`, `verse`, `aria`, `coral`, `sage`, `shimmer`.
- Transcript panel and end-of-practice report.
- Render-ready `render.yaml`.

## Render Realtime Setup

Set these environment variables on Render:

```text
AI_PROVIDER=openai-realtime
OPENAI_API_KEY=your proxy sk-... token
OPENAI_API_BASE=https://api.zyaihub.com/v1
OPENAI_REALTIME_MODEL=the realtime model confirmed by your provider
OPENAI_REALTIME_SESSION_MODE=sdp-proxy
OPENAI_TEXT_MODEL=gpt-4o
OPENAI_VOICE=alloy
```

For this proxy, `sdp-proxy` avoids `POST /v1/realtime/sessions` and lets the backend exchange SDP with:

```text
POST /v1/realtime?model=...
WebRTC SDP exchange
```

If your provider supports OpenAI ephemeral sessions, you can set:

```text
OPENAI_REALTIME_SESSION_MODE=sessions
```

If the provider supports OpenAI voice names, users can switch voices in the page before starting a session.

## Text Fallback

If you want to test text-only mode:

```text
AI_PROVIDER=openai-compatible
OPENAI_API_KEY=your proxy sk-... token
OPENAI_API_BASE=https://api.zyaihub.com/v1
OPENAI_TEXT_MODEL=gpt-4o
```

This calls:

```text
POST /v1/chat/completions
```

## Local Run

```bash
copy .env.example .env
npm.cmd start
```

Open:

```text
http://localhost:4174
```

## Security Notes

- Never put API keys in frontend code.
- Use reviewed anchor texts and tutor roles for children.
- For production, add accounts, teacher/parent controls, moderation, usage limits, and persistent storage.
