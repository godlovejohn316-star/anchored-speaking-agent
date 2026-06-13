const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
let WebSocket = null;
try {
  WebSocket = require("ws");
} catch {
  WebSocket = null;
}

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : __dirname;
const AI_PROVIDER = process.env.AI_PROVIDER || "dashscope";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const DASHSCOPE_API_BASE = process.env.DASHSCOPE_API_BASE || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const OPENAI_VOICE = process.env.OPENAI_VOICE || "marin";
const OPENAI_REALTIME_SESSION_MODE = process.env.OPENAI_REALTIME_SESSION_MODE || "calls";
const OPENAI_REALTIME_TRANSPORT = process.env.OPENAI_REALTIME_TRANSPORT || "webrtc";
const OPENAI_REALTIME_WS_URL = process.env.OPENAI_REALTIME_WS_URL || "";
const MAX_MINUTES = Number(process.env.PRACTICE_MAX_MINUTES || 8);
const REALTIME_VOICES = ["marin", "alloy", "verse", "aria", "coral", "sage", "shimmer"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function appendJsonl(filename, record) {
  const filePath = path.join(DATA_DIR, filename);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function loadSampleLessons() {
  const filePath = fs.existsSync(path.join(__dirname, "data", "sample-lessons.json"))
    ? path.join(__dirname, "data", "sample-lessons.json")
    : path.join(__dirname, "sample-lessons.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 6000);
}

function cleanSdp(value) {
  return String(value || "").trim();
}

function createSafetyIdentifier(value) {
  return crypto.createHash("sha256").update(String(value || "anonymous")).digest("hex").slice(0, 32);
}

function buildTutorInstructions(payload) {
  const lesson = payload.lesson || {};
  const role = payload.role || {};
  const child = payload.child || {};
  const anchorText = cleanString(lesson.text, "No anchor text was provided.");
  const keywords = Array.isArray(lesson.keywords) ? lesson.keywords.join(", ") : "";
  const patterns = Array.isArray(lesson.targetPatterns) ? lesson.targetPatterns.join("; ") : "";
  const goals = Array.isArray(lesson.discussionGoals) ? lesson.discussionGoals.join("; ") : "";
  const level = cleanString(lesson.level, "A2").slice(0, 20);
  const roleName = cleanString(role.name, "Miss Emma").slice(0, 80);
  const roleStyle = cleanString(role.style, "warm, patient, encouraging").slice(0, 300);
  const childName = cleanString(child.name, "the learner").slice(0, 80);

  return [
    `You are ${roleName}, an English speaking tutor for a child named ${childName}.`,
    `Teaching style: ${roleStyle}.`,
    `The learner level is ${level}. Keep your spoken English natural, short, and age-appropriate.`,
    "",
    "Anchor text:",
    anchorText,
    "",
    `Anchor keywords: ${keywords || "none provided"}.`,
    `Target sentence patterns: ${patterns || "none provided"}.`,
    `Practice goals: ${goals || "ask comprehension questions, invite retelling, and encourage full-sentence answers"}.`,
    "",
    "Conversation rules:",
    "1. Stay anchored to the text, its scene, words, characters, ideas, and target sentence patterns.",
    "2. Start with a friendly greeting and one easy question about the anchor text.",
    "3. Ask one question at a time. Wait for the child to answer.",
    "4. If the child struggles, offer a short hint or a sentence starter.",
    "5. Correct gently by recasting the child's answer naturally. Do not over-explain during live talk.",
    "6. Encourage the child to use anchor keywords and full sentences.",
    "7. If the child changes topic, warmly bring the conversation back to the anchor text.",
    "8. Avoid mature, unsafe, political, sexual, or violent topics. Keep the session suitable for children.",
    `9. Finish naturally after about ${MAX_MINUTES} minutes if the child seems ready.`,
    "",
    "When useful, send concise text events for transcript support, but prioritize natural spoken interaction."
  ].join("\n");
}

async function createRealtimeSession(payload) {
  if (!OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured for realtime mode.");
    error.status = 500;
    throw error;
  }

  const instructions = buildTutorInstructions(payload);
  const safetyIdentifier = createSafetyIdentifier(payload?.child?.id || payload?.child?.name || "anonymous");
  const requestedVoice = REALTIME_VOICES.includes(payload.voice) ? payload.voice : OPENAI_VOICE;
  const sessionConfig = {
    type: "realtime",
    model: OPENAI_REALTIME_MODEL,
    instructions,
    audio: {
      output: {
        voice: requestedVoice
      }
    }
  };

  if (OPENAI_REALTIME_SESSION_MODE === "server-call-proxy") {
    console.log(`Creating realtime call config for model=${OPENAI_REALTIME_MODEL}, voice=${requestedVoice}`);
    return {
      id: `call-${Date.now()}`,
      model: OPENAI_REALTIME_MODEL,
      voice: requestedVoice,
      sdpProxyUrl: "/api/realtime/call",
      sessionConfig
    };
  }

  if (OPENAI_REALTIME_SESSION_MODE === "sdp-proxy") {
    appendJsonl("sessions.jsonl", {
      id: `proxy-${Date.now()}`,
      createdAt: new Date().toISOString(),
      mode: OPENAI_REALTIME_SESSION_MODE,
      model: OPENAI_REALTIME_MODEL,
      lessonTitle: payload?.lesson?.title,
      roleName: payload?.role?.name,
      safetyIdentifier
    });

    return {
      id: `proxy-${Date.now()}`,
      model: OPENAI_REALTIME_MODEL,
      voice: requestedVoice,
      sdpProxyUrl: "/api/realtime/sdp",
      sessionConfig
    };
  }

  const response = await fetch(`${OPENAI_API_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier
    },
    body: JSON.stringify({ session: sessionConfig })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Failed to create realtime session.");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  appendJsonl("sessions.jsonl", {
    id: data.id,
    createdAt: new Date().toISOString(),
    model: OPENAI_REALTIME_MODEL,
    lessonTitle: payload?.lesson?.title,
    roleName: payload?.role?.name,
    safetyIdentifier
  });

  return {
    id: data.id,
    model: OPENAI_REALTIME_MODEL,
    voice: requestedVoice,
    realtimeUrl: `${OPENAI_API_BASE}/realtime/calls`,
    client_secret: data.value || data.client_secret?.value || data.client_secret
  };
}

async function exchangeRealtimeCall(payload) {
  if (!OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured for realtime mode.");
    error.status = 500;
    throw error;
  }

  const offerSdp = cleanSdp(payload.sdp);
  if (!offerSdp) {
    const error = new Error("Missing SDP offer.");
    error.status = 400;
    throw error;
  }

  const sessionConfig = payload.sessionConfig || {
    type: "realtime",
    model: OPENAI_REALTIME_MODEL,
    audio: { output: { voice: OPENAI_VOICE } }
  };

  const fd = new FormData();
  fd.set("offer", offerSdp);
  fd.set("sdp", offerSdp);
  fd.set("session", JSON.stringify(sessionConfig));

  console.log(`Exchanging realtime call SDP with OpenAI model=${sessionConfig.model || OPENAI_REALTIME_MODEL}, sdpLength=${offerSdp.length}`);
  const response = await fetch(`${OPENAI_API_BASE}/realtime/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": createSafetyIdentifier(payload?.child?.id || payload?.child?.name || "anonymous")
    },
    body: fd
  });

  const answerSdp = await response.text();
  if (!response.ok) {
    console.error("Realtime call exchange failed", {
      status: response.status,
      statusText: response.statusText,
      body: answerSdp,
      model: sessionConfig.model || OPENAI_REALTIME_MODEL,
      voice: sessionConfig.audio?.output?.voice
    });
    const error = new Error(answerSdp || "Realtime call exchange failed.");
    error.status = response.status;
    throw error;
  }

  console.log("Realtime call SDP exchange succeeded.");
  return { sdp: answerSdp };
}

async function exchangeRealtimeSdp(payload) {
  if (!OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured for realtime mode.");
    error.status = 500;
    throw error;
  }

  const offerSdp = cleanSdp(payload.sdp);
  if (!offerSdp) {
    const error = new Error("Missing SDP offer.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE}/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/sdp"
    },
    body: offerSdp
  });

  const answerSdp = await response.text();
  if (!response.ok) {
    const error = new Error(answerSdp || "Realtime SDP exchange failed.");
    error.status = response.status;
    throw error;
  }

  return {
    sdp: answerSdp
  };
}

function getChatProviderConfig() {
  if (AI_PROVIDER === "openai-realtime") {
    return {
      provider: AI_PROVIDER,
      apiKey: OPENAI_API_KEY,
      apiBase: OPENAI_API_BASE,
      model: OPENAI_TEXT_MODEL,
      missingKeyMessage: "OPENAI_API_KEY is not configured."
    };
  }

  if (AI_PROVIDER === "openai-compatible") {
    return {
      provider: AI_PROVIDER,
      apiKey: OPENAI_API_KEY,
      apiBase: OPENAI_API_BASE,
      model: OPENAI_TEXT_MODEL,
      missingKeyMessage: "OPENAI_API_KEY is not configured."
    };
  }

  if (AI_PROVIDER === "dashscope") {
    return {
      provider: AI_PROVIDER,
      apiKey: DASHSCOPE_API_KEY,
      apiBase: DASHSCOPE_API_BASE.replace(/\/$/, ""),
      model: DASHSCOPE_MODEL,
      missingKeyMessage: "DASHSCOPE_API_KEY is not configured."
    };
  }

  return null;
}

async function callCompatibleChat(payload) {
  const providerConfig = getChatProviderConfig();
  if (!providerConfig) {
    const error = new Error(`Unsupported AI_PROVIDER: ${AI_PROVIDER}`);
    error.status = 500;
    throw error;
  }

  if (!providerConfig.apiKey) {
    const error = new Error(providerConfig.missingKeyMessage);
    error.status = 500;
    throw error;
  }

  const system = buildTutorInstructions(payload);
  const transcript = Array.isArray(payload.transcript) ? payload.transcript.slice(-12) : [];
  const messages = [
    { role: "system", content: system },
    ...transcript
      .filter((item) => item.text)
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.text
      })),
    { role: "user", content: cleanString(payload.message, "Please ask me a question about the text.").slice(0, 1200) }
  ];

  const response = await fetch(`${providerConfig.apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${providerConfig.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages,
      temperature: 0.7,
      max_tokens: 450
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Domestic model request failed.");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  const text = data?.choices?.[0]?.message?.content || "";
  appendJsonl("chat.jsonl", {
    createdAt: new Date().toISOString(),
    provider: providerConfig.provider,
    model: providerConfig.model,
    lessonTitle: payload?.lesson?.title,
    roleName: payload?.role?.name,
    childName: payload?.child?.name,
    message: payload.message,
    reply: text
  });

  return {
    reply: text,
    provider: providerConfig.provider,
    model: providerConfig.model
  };
}

function fallbackReport(payload) {
  const transcript = Array.isArray(payload.transcript) ? payload.transcript : [];
  const childTurns = transcript.filter((item) => item.role === "child");
  const text = childTurns.map((item) => item.text || "").join(" ").toLowerCase();
  const lesson = payload.lesson || {};
  const keywords = Array.isArray(lesson.keywords) ? lesson.keywords : [];
  const usedKeywords = keywords.filter((word) => text.includes(String(word).toLowerCase()));
  return {
    summary: "The child completed an anchored speaking practice session.",
    strengths: [
      childTurns.length > 2 ? "Kept participating across multiple turns." : "Started speaking in the session.",
      usedKeywords.length ? `Used anchor words: ${usedKeywords.join(", ")}.` : "Stayed close to the practice topic."
    ],
    improvements: [
      "Answer in full sentences more often.",
      "Reuse the anchor keywords from the text.",
      "Try one target pattern in the next session."
    ],
    nextPractice: [
      "I think Tom is kind because...",
      "The puppy was near the school gate.",
      "He should help the puppy."
    ],
    keywordCoverage: {
      used: usedKeywords,
      total: keywords
    }
  };
}

async function generateReport(payload) {
  const providerConfig = getChatProviderConfig();
  if (!providerConfig?.apiKey) return fallbackReport(payload);

  const response = await fetch(`${providerConfig.apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${providerConfig.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        {
          role: "system",
          content: "You are a child-friendly English speaking coach. Return strict JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a short speaking practice report.",
            schema: {
              summary: "one sentence",
              strengths: ["2 short items"],
              improvements: ["3 short items"],
              nextPractice: ["3 reusable English sentences"],
              keywordCoverage: { used: ["keywords used"], missed: ["keywords missed"] }
            },
            lesson: payload.lesson,
            role: payload.role,
            transcript: payload.transcript
          })
        }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return fallbackReport(payload);

  const outputText = data?.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(outputText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
  } catch {
    return fallbackReport(payload);
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(requestedPath, (error, data) => {
    if (error) return sendText(res, 404, "Not found");
    const ext = path.extname(requestedPath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      const realtimeMode = AI_PROVIDER === "openai-realtime";
      const providerConfig = getChatProviderConfig();
      return sendJson(res, 200, {
        ok: true,
        service: "anchored-speaking-agent",
        configured: realtimeMode ? Boolean(OPENAI_API_KEY) : Boolean(providerConfig?.apiKey),
        provider: AI_PROVIDER,
        model: realtimeMode ? OPENAI_REALTIME_MODEL : providerConfig?.model
      });
    }

    if (req.method === "GET" && url.pathname === "/api/lessons") {
      return sendJson(res, 200, { lessons: loadSampleLessons() });
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      const realtimeMode = AI_PROVIDER === "openai-realtime";
      const providerConfig = getChatProviderConfig();
      return sendJson(res, 200, {
        provider: AI_PROVIDER,
        model: realtimeMode ? OPENAI_REALTIME_MODEL : providerConfig?.model,
        maxMinutes: MAX_MINUTES,
        configured: realtimeMode ? Boolean(OPENAI_API_KEY) : Boolean(providerConfig?.apiKey),
        mode: realtimeMode ? "realtime" : "domestic-text",
        voices: REALTIME_VOICES,
        defaultVoice: OPENAI_VOICE,
        realtimeSessionMode: OPENAI_REALTIME_SESSION_MODE,
        realtimeTransport: OPENAI_REALTIME_TRANSPORT,
        realtimeWsUrlConfigured: Boolean(OPENAI_REALTIME_WS_URL),
        appVersion: "openai-calls-realtime-20260613-6"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/realtime/session") {
      const payload = await readBody(req);
      const session = await createRealtimeSession(payload);
      return sendJson(res, 200, session);
    }

    if (req.method === "POST" && url.pathname === "/api/realtime/sdp") {
      const payload = await readBody(req);
      const answer = await exchangeRealtimeSdp(payload);
      return sendJson(res, 200, answer);
    }

    if (req.method === "POST" && url.pathname === "/api/realtime/call") {
      const payload = await readBody(req);
      const answer = await exchangeRealtimeCall(payload);
      return sendJson(res, 200, answer);
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const payload = await readBody(req);
      const reply = await callCompatibleChat(payload);
      return sendJson(res, 200, reply);
    }

    if (req.method === "POST" && url.pathname === "/api/report") {
      const payload = await readBody(req);
      const report = await generateReport(payload);
      appendJsonl("reports.jsonl", {
        createdAt: new Date().toISOString(),
        lessonTitle: payload?.lesson?.title,
        roleName: payload?.role?.name,
        childName: payload?.child?.name,
        report
      });
      return sendJson(res, 200, { report });
    }

    if (req.method === "POST" && url.pathname === "/api/practice-log") {
      const payload = await readBody(req);
      appendJsonl("practice-log.jsonl", {
        createdAt: new Date().toISOString(),
        ...payload
      });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET") return serveStatic(req, res);
    return sendText(res, 405, "Method not allowed");
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, {
      error: error.message || "Unexpected server error.",
      details: process.env.NODE_ENV === "development" ? error.details : undefined
    });
  }
});

server.listen(PORT, () => {
  console.log(`Anchored Speaking Agent running at http://localhost:${PORT}`);
});

if (WebSocket) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== "/api/realtime/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit("connection", clientWs, req);
    });
  });

  wss.on("connection", (clientWs) => {
    if (!OPENAI_API_KEY) {
      clientWs.close(1011, "OPENAI_API_KEY is not configured.");
      return;
    }

    const upstreamUrl = OPENAI_REALTIME_WS_URL ||
      `${OPENAI_API_BASE.replace(/^http/, "ws")}/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`;
    console.log(`Opening realtime websocket upstream: ${upstreamUrl.replace(/key=[^&]+/i, "key=***")}`);
    const upstreamWs = new WebSocket(upstreamUrl, {
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    upstreamWs.on("open", () => {
      console.log("Realtime websocket upstream opened.");
      clientWs.send(JSON.stringify({ type: "proxy.open", model: OPENAI_REALTIME_MODEL }));
    });

    upstreamWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });

    upstreamWs.on("error", (error) => {
      console.error("Realtime websocket upstream error:", error.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "proxy.error", error: { message: error.message } }));
      }
    });

    upstreamWs.on("close", (code, reason) => {
      console.log(`Realtime websocket upstream closed: ${code} ${reason.toString()}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "proxy.close", code, reason: reason.toString() }));
        clientWs.close();
      }
    });

    clientWs.on("message", (data) => {
      if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.send(data);
    });

    clientWs.on("close", () => {
      if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.close();
      }
    });
  });
} else {
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/realtime/ws") {
      socket.destroy();
      return;
    }
    socket.destroy();
  });
}
