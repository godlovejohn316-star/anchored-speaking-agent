const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const PUBLIC_DIR = path.join(__dirname, "public");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const VOICE = process.env.OPENAI_VOICE || "alloy";
const MAX_MINUTES = Number(process.env.PRACTICE_MAX_MINUTES || 8);

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
  const filePath = path.join(__dirname, "data", "sample-lessons.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 6000);
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
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.status = 500;
    throw error;
  }

  const instructions = buildTutorInstructions(payload);
  const safetyIdentifier = createSafetyIdentifier(payload?.child?.id || payload?.child?.name || "anonymous");

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      voice: payload.voice || VOICE,
      instructions,
      modalities: ["audio", "text"],
      input_audio_transcription: {
        model: "gpt-4o-mini-transcribe"
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 650
      }
    })
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
    model: REALTIME_MODEL,
    lessonTitle: payload?.lesson?.title,
    roleName: payload?.role?.name,
    safetyIdentifier
  });

  return {
    id: data.id,
    model: REALTIME_MODEL,
    voice: payload.voice || VOICE,
    client_secret: data.client_secret
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
  if (!OPENAI_API_KEY) return fallbackReport(payload);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
      "OpenAI-Safety-Identifier": createSafetyIdentifier(payload?.child?.id || payload?.child?.name || "anonymous")
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      input: [
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
      text: {
        format: {
          type: "json_object"
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return fallbackReport(payload);

  const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
  try {
    return JSON.parse(outputText);
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
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "anchored-speaking-agent",
        realtimeConfigured: Boolean(OPENAI_API_KEY),
        model: REALTIME_MODEL
      });
    }

    if (req.method === "GET" && url.pathname === "/api/lessons") {
      return sendJson(res, 200, { lessons: loadSampleLessons() });
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        realtimeModel: REALTIME_MODEL,
        defaultVoice: VOICE,
        maxMinutes: MAX_MINUTES,
        configured: Boolean(OPENAI_API_KEY)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/realtime/session") {
      const payload = await readBody(req);
      const session = await createRealtimeSession(payload);
      return sendJson(res, 200, session);
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
