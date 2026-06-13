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
OPENAI_REALTIME_TRANSPORT=websocket
OPENAI_REALTIME_WS_URL=
OPENAI_REALTIME_SESSION_MODE=sdp-proxy
OPENAI_TEXT_MODEL=gpt-4o
OPENAI_VOICE=alloy
```

For this proxy, `websocket` matches providers that expose:

```text
GET /v1/realtime
WebSocket Realtime API
```

If your provider supports OpenAI WebRTC SDP instead, you can set:

```text
OPENAI_REALTIME_TRANSPORT=webrtc
OPENAI_REALTIME_SESSION_MODE=sessions or sdp-proxy
```

If the provider's WebSocket endpoint does not accept `?model=...`, set an exact URL:

```text
OPENAI_REALTIME_WS_URL=wss://api.zyaihub.com/v1/realtime
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
