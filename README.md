# Anchored Speaking Agent

Text-anchored English speaking practice for children. A child selects an anchor text, a tutor role, and a voice, then speaks with an AI tutor through OpenAI Realtime.

## Features

- Anchor text, keywords, and target sentence patterns.
- Tutor roles: patient tutor, story guide, and interviewer.
- OpenAI Realtime WebRTC voice conversation.
- Voice selection: `alloy`, `verse`, `aria`, `coral`, `sage`, `shimmer`.
- Transcript panel and end-of-practice report.
- Render-ready `render.yaml`.

## Render Setup

Set these environment variables on Render:

```text
AI_PROVIDER=openai-realtime
OPENAI_API_KEY=your OpenAI sk-... API key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_TRANSPORT=webrtc
OPENAI_REALTIME_SESSION_MODE=sessions
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_VOICE=alloy
PRACTICE_MAX_MINUTES=8
```

This mode uses:

```text
POST /v1/realtime/sessions
WebRTC SDP exchange with /v1/realtime?model=...
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

## Upload Note

If your GitHub repository is flat, upload files from:

```text
anchored-speaking-agent-github-upload
```

That folder maps `public/app.js` to root `app.js`, and `public/index.html` to root `index.html`.

## Security Notes

- Never put API keys in frontend code or GitHub.
- Use reviewed anchor texts and tutor roles for children.
- For production, add accounts, parent/teacher controls, moderation, usage limits, and persistent storage.
