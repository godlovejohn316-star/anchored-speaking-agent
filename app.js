const roles = [
  {
    id: "emma",
    name: "Miss Emma",
    initial: "E",
    style: "warm, patient, encouraging, asks simple questions, gives gentle recasts",
    label: "Patient Tutor",
    description: "Best for beginners. Encourages full-sentence answers."
  },
  {
    id: "story-guide",
    name: "Captain Leo",
    initial: "L",
    style: "playful story character, curious, dramatic but still focused on the anchor text",
    label: "Story Role",
    description: "Good for story-based role play and retelling."
  },
  {
    id: "interviewer",
    name: "Mr. Parker",
    initial: "P",
    style: "friendly interviewer, structured, asks follow-up questions and invites reasons",
    label: "Interviewer",
    description: "Good for opinions, reasons, and exam-style answers."
  }
];

const state = {
  lessons: [],
  selectedLesson: null,
  selectedRole: roles[0],
  config: null,
  pc: null,
  dc: null,
  ws: null,
  localStream: null,
  audioContext: null,
  audioSource: null,
  audioProcessor: null,
  playbackTime: 0,
  startedAt: null,
  timerId: null,
  transcript: [],
  active: false,
  recognition: null
};

const els = {
  apiStatus: document.querySelector("#apiStatus"),
  lessonSelect: document.querySelector("#lessonSelect"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonLevel: document.querySelector("#lessonLevel"),
  anchorText: document.querySelector("#anchorText"),
  keywordInput: document.querySelector("#keywordInput"),
  keywordChips: document.querySelector("#keywordChips"),
  patternsInput: document.querySelector("#patternsInput"),
  roleGrid: document.querySelector("#roleGrid"),
  roleName: document.querySelector("#roleName"),
  avatar: document.querySelector("#avatar"),
  childName: document.querySelector("#childName"),
  voiceSelect: document.querySelector("#voiceSelect"),
  answerBox: document.querySelector(".answer-box"),
  childMessage: document.querySelector("#childMessage"),
  listenBtn: document.querySelector("#listenBtn"),
  sendBtn: document.querySelector("#sendBtn"),
  callState: document.querySelector("#callState"),
  callHint: document.querySelector("#callHint"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  timer: document.querySelector("#timer"),
  transcript: document.querySelector("#transcript"),
  report: document.querySelector("#report"),
  tabs: document.querySelectorAll(".tab"),
  transcriptView: document.querySelector("#transcriptView"),
  reportView: document.querySelector("#reportView"),
  editLessonBtn: document.querySelector("#editLessonBtn")
};

function setCallState(title, hint) {
  els.callState.textContent = title;
  els.callHint.textContent = hint;
}

function setApiStatus(config) {
  els.apiStatus.textContent = config.configured ? "API ready" : "API missing";
  els.apiStatus.className = `status-pill ${config.configured ? "ok" : "warn"}`;
}

function currentLessonFromForm() {
  const keywords = els.keywordInput.value.split(",").map((item) => item.trim()).filter(Boolean);
  const targetPatterns = els.patternsInput.value.split("\n").map((item) => item.trim()).filter(Boolean);
  return {
    ...state.selectedLesson,
    title: els.lessonTitle.textContent,
    level: els.lessonLevel.textContent || "A2",
    text: els.anchorText.value.trim(),
    keywords,
    targetPatterns,
    discussionGoals: state.selectedLesson?.discussionGoals || []
  };
}

function renderKeywords() {
  const words = els.keywordInput.value.split(",").map((item) => item.trim()).filter(Boolean);
  els.keywordChips.innerHTML = "";
  for (const word of words) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = word;
    els.keywordChips.append(chip);
  }
}

function renderLesson(lesson) {
  state.selectedLesson = lesson;
  els.lessonTitle.textContent = lesson.title;
  els.lessonLevel.textContent = lesson.level;
  els.anchorText.value = lesson.text;
  els.keywordInput.value = lesson.keywords.join(", ");
  els.patternsInput.value = lesson.targetPatterns.join("\n");
  renderKeywords();
}

function renderRoles() {
  els.roleGrid.innerHTML = "";
  for (const role of roles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `role-card ${role.id === state.selectedRole.id ? "active" : ""}`;
    button.innerHTML = `<strong>${role.label}</strong><span>${role.name}</span><span>${role.description}</span>`;
    button.addEventListener("click", () => {
      state.selectedRole = role;
      els.roleName.textContent = role.name;
      els.avatar.textContent = role.initial;
      renderRoles();
    });
    els.roleGrid.append(button);
  }
}

function addMessage(role, text) {
  if (!text || !text.trim()) return;
  const displayRole = role === "assistant" ? state.selectedRole.name : role === "child" ? "Child" : "System";
  state.transcript.push({ role, text: text.trim(), at: new Date().toISOString() });
  const template = document.querySelector("#messageTemplate");
  const node = template.content.cloneNode(true);
  node.querySelector(".message-role").textContent = displayRole;
  node.querySelector(".message-text").textContent = text.trim();
  els.transcript.append(node);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function updateTimer() {
  if (!state.startedAt) return;
  const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  els.timer.textContent = `${mm}:${ss}`;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

async function askTutor(message) {
  const lesson = currentLessonFromForm();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lesson,
      role: state.selectedRole,
      child: {
        name: els.childName.value.trim() || "the learner"
      },
      transcript: state.transcript,
      message
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Tutor request failed.");
  return data.reply;
}

async function startPractice() {
  if (state.config?.mode === "realtime") {
    if (state.config?.realtimeTransport !== "webrtc") {
      return startRealtimeWebSocketPractice();
    }
    return startRealtimePractice();
  }
  return startTextPractice();
}

async function startTextPractice() {
  const lesson = currentLessonFromForm();
  if (!lesson.text) {
    setCallState("Missing anchor text", "Please enter a practice text first.");
    return;
  }

  state.active = true;
  state.transcript = [];
  els.transcript.innerHTML = "";
  els.report.className = "report-empty";
  els.report.textContent = "Practice is running. A report will appear here after you finish.";
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.sendBtn.disabled = false;
  state.startedAt = Date.now();
  state.timerId = setInterval(updateTimer, 1000);
  updateTimer();
  setCallState("Tutor is thinking", "The tutor will ask one question about the anchor text.");

  try {
    const reply = await askTutor("Please greet me and ask one easy question about the anchor text.");
    addMessage("assistant", reply);
    speak(reply);
    setCallState("Tutor is ready", "Type or dictate an English answer, then send it.");
  } catch (error) {
    setCallState("Connection failed", error.message);
    stopTimerOnly();
    els.startBtn.disabled = false;
    els.stopBtn.disabled = true;
    els.sendBtn.disabled = true;
  }
}

function getEphemeralKey(session) {
  return session?.client_secret?.value || session?.client_secret;
}

async function startRealtimePractice() {
  const lesson = currentLessonFromForm();
  if (!lesson.text) {
    setCallState("Missing anchor text", "Please enter a practice text first.");
    return;
  }

  state.active = true;
  state.transcript = [];
  els.transcript.innerHTML = "";
  els.report.className = "report-empty";
  els.report.textContent = "Realtime practice is running. A report will appear here after you finish.";
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.sendBtn.disabled = true;
  setCallState("Connecting realtime tutor", "Please allow microphone access when the browser asks.");

  try {
    const sessionRes = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lesson,
        role: state.selectedRole,
        voice: els.voiceSelect.value,
        child: {
          id: els.childName.value.trim().toLowerCase() || "anonymous",
          name: els.childName.value.trim() || "the learner"
        }
      })
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(session.error || "Failed to create realtime session.");

    const ephemeralKey = getEphemeralKey(session);
    if (!ephemeralKey && !session.sdpProxyUrl) throw new Error("Realtime session did not include a client secret.");

    state.pc = new RTCPeerConnection();
    state.pc.ontrack = (event) => {
      const audio = document.querySelector("#remoteAudio");
      audio.srcObject = event.streams[0];
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of state.localStream.getTracks()) {
      state.pc.addTrack(track, state.localStream);
    }

    state.dc = state.pc.createDataChannel("oai-events");
    state.dc.addEventListener("open", () => {
      setCallState("Realtime tutor online", "Speak English directly. The tutor will stay anchored to the text.");
      addMessage("system", "Realtime session started.");
      if (session.sessionConfig) {
        state.dc.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: session.sessionConfig.instructions,
            voice: session.sessionConfig.voice,
            input_audio_transcription: session.sessionConfig.input_audio_transcription,
            turn_detection: session.sessionConfig.turn_detection
          }
        }));
      }
      state.dc.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "Greet the child warmly and ask one easy question about the anchor text."
        }
      }));
    });
    state.dc.addEventListener("message", handleRealtimeEvent);

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);

    let answerSdp = "";
    if (session.sdpProxyUrl) {
      const sdpRes = await fetch(session.sdpProxyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp })
      });
      const sdpData = await sdpRes.json().catch(() => ({}));
      if (!sdpRes.ok) throw new Error(sdpData.error || "Realtime WebRTC connection failed.");
      answerSdp = sdpData.sdp;
    } else {
      const sdpRes = await fetch(session.realtimeUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ephemeralKey}`,
          "content-type": "application/sdp"
        },
        body: offer.sdp
      });
      answerSdp = await sdpRes.text();
      if (!sdpRes.ok) throw new Error(answerSdp || "Realtime WebRTC connection failed.");
    }

    await state.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    state.startedAt = Date.now();
    state.timerId = setInterval(updateTimer, 1000);
    updateTimer();
  } catch (error) {
    setCallState("Realtime failed", error.message);
    await cleanupRealtime(false);
  }
}

function handleRealtimeEvent(event) {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === "conversation.item.input_audio_transcription.completed") {
    addMessage("child", data.transcript || "");
  }

  if (data.type === "response.audio_transcript.done") {
    addMessage("assistant", data.transcript || "");
  }

  if (data.type === "error") {
    addMessage("system", data.error?.message || "Realtime error.");
  }
}

async function cleanupRealtime(keepStopDisabled = true) {
  stopTimerOnly();
  if (state.dc) state.dc.close();
  if (state.pc) state.pc.close();
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
  }
  state.dc = null;
  state.pc = null;
  state.localStream = null;
  els.startBtn.disabled = false;
  els.stopBtn.disabled = keepStopDisabled;
}

function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function arrayBufferFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function convertFloatToPcm16(float32Array, inputSampleRate, outputSampleRate = 24000) {
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(float32Array.length / ratio);
  const pcm = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const sample = float32Array[Math.floor(i * ratio)] || 0;
    const clipped = Math.max(-1, Math.min(1, sample));
    pcm[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
  }
  return pcm;
}

function playPcm16Base64(base64) {
  if (!state.audioContext) return;
  const pcm = new Int16Array(arrayBufferFromBase64(base64));
  const floatData = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) floatData[i] = pcm[i] / 0x8000;

  const buffer = state.audioContext.createBuffer(1, floatData.length, 24000);
  buffer.copyToChannel(floatData, 0);
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioContext.destination);

  const now = state.audioContext.currentTime;
  state.playbackTime = Math.max(state.playbackTime, now);
  source.start(state.playbackTime);
  state.playbackTime += buffer.duration;
}

async function startRealtimeWebSocketPractice() {
  const lesson = currentLessonFromForm();
  if (!lesson.text) {
    setCallState("Missing anchor text", "Please enter a practice text first.");
    return;
  }

  state.active = true;
  state.transcript = [];
  els.transcript.innerHTML = "";
  els.report.className = "report-empty";
  els.report.textContent = "Realtime WebSocket practice is running. A report will appear here after you finish.";
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.sendBtn.disabled = true;
  setCallState("Connecting realtime tutor", "Please allow microphone access when the browser asks.");

  try {
    const sessionRes = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lesson,
        role: state.selectedRole,
        voice: els.voiceSelect.value,
        child: {
          id: els.childName.value.trim().toLowerCase() || "anonymous",
          name: els.childName.value.trim() || "the learner"
        }
      })
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(session.error || "Failed to create realtime session.");

    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    state.ws = new WebSocket(`${wsProtocol}://${window.location.host}/api/realtime/ws`);

    state.ws.addEventListener("open", async () => {
      state.audioContext = new AudioContext();
      state.playbackTime = state.audioContext.currentTime;

      state.ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions: session.sessionConfig.instructions,
          voice: session.sessionConfig.voice,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: session.sessionConfig.input_audio_transcription,
          turn_detection: session.sessionConfig.turn_detection
        }
      }));

      state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioSource = state.audioContext.createMediaStreamSource(state.localStream);
      state.audioProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
      state.audioProcessor.onaudioprocess = (event) => {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = convertFloatToPcm16(input, state.audioContext.sampleRate, 24000);
        state.ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64FromArrayBuffer(pcm.buffer)
        }));
      };
      state.audioSource.connect(state.audioProcessor);
      state.audioProcessor.connect(state.audioContext.destination);

      state.ws.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "Greet the child warmly and ask one easy question about the anchor text."
        }
      }));

      addMessage("system", "Realtime WebSocket session started.");
      setCallState("Realtime tutor online", "Speak English directly. The tutor will stay anchored to the text.");
      state.startedAt = Date.now();
      state.timerId = setInterval(updateTimer, 1000);
      updateTimer();
    });

    state.ws.addEventListener("message", (event) => handleRealtimeWebSocketEvent(event.data));
    state.ws.addEventListener("error", () => {
      setCallState("Realtime failed", "WebSocket connection error.");
    });
    state.ws.addEventListener("close", () => {
      if (state.active) setCallState("Realtime closed", "The realtime connection closed.");
    });
  } catch (error) {
    setCallState("Realtime failed", error.message);
    await cleanupRealtimeWebSocket(false);
  }
}

function handleRealtimeWebSocketEvent(rawData) {
  let data;
  try {
    data = JSON.parse(rawData);
  } catch {
    return;
  }

  if (data.type === "response.audio.delta" && data.delta) playPcm16Base64(data.delta);
  if (data.type === "response.output_audio.delta" && data.delta) playPcm16Base64(data.delta);
  if (data.type === "conversation.item.input_audio_transcription.completed") addMessage("child", data.transcript || "");
  if (data.type === "response.audio_transcript.done") addMessage("assistant", data.transcript || "");
  if (data.type === "response.output_text.done") addMessage("assistant", data.text || "");
  if (data.type === "error" || data.type === "proxy.error") {
    const message = data.error?.message || "Realtime error.";
    addMessage("system", message);
    setCallState("Realtime failed", message);
  }
  if (data.type === "proxy.close") {
    const detail = [data.code, data.reason].filter(Boolean).join(" ");
    addMessage("system", `Realtime proxy closed: ${detail}`);
    setCallState("Realtime closed", detail || "The realtime connection closed.");
  }
}

async function cleanupRealtimeWebSocket(keepStopDisabled = true) {
  stopTimerOnly();
  if (state.audioProcessor) state.audioProcessor.disconnect();
  if (state.audioSource) state.audioSource.disconnect();
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.close();
  if (state.audioContext) await state.audioContext.close().catch(() => {});
  state.audioProcessor = null;
  state.audioSource = null;
  state.localStream = null;
  state.audioContext = null;
  state.ws = null;
  els.startBtn.disabled = false;
  els.stopBtn.disabled = keepStopDisabled;
}

async function sendAnswer() {
  const text = els.childMessage.value.trim();
  if (!text || !state.active) return;
  els.childMessage.value = "";
  els.sendBtn.disabled = true;
  addMessage("child", text);
  setCallState("Tutor is replying", "Please wait a moment.");

  try {
    const reply = await askTutor(text);
    addMessage("assistant", reply);
    speak(reply);
    setCallState("Your turn", "Answer the tutor in English.");
  } catch (error) {
    addMessage("system", error.message);
    setCallState("Reply failed", error.message);
  } finally {
    els.sendBtn.disabled = false;
    els.childMessage.focus();
  }
}

function stopTimerOnly() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.startedAt = null;
  state.active = false;
}

async function stopPractice() {
  els.stopBtn.disabled = true;
  els.sendBtn.disabled = true;
  if (state.config?.mode === "realtime") {
    if (state.config?.realtimeTransport === "websocket") {
      await cleanupRealtimeWebSocket(true);
    } else {
      await cleanupRealtime(true);
    }
  } else {
    stopTimerOnly();
  }
  window.speechSynthesis?.cancel();
  setCallState("Generating report", "Checking keywords, strengths, and next practice sentences.");

  try {
    const lesson = currentLessonFromForm();
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lesson,
        role: state.selectedRole,
        child: {
          name: els.childName.value.trim() || "the learner"
        },
        transcript: state.transcript
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Report request failed.");
    renderReport(data.report);
    switchTab("report");
    setCallState("Practice complete", "The report is ready.");
  } catch (error) {
    els.report.textContent = error.message;
    setCallState("Report failed", error.message);
  } finally {
    els.startBtn.disabled = false;
  }
}

function renderReport(report) {
  const list = (items) => (Array.isArray(items) ? items : []).map((item) => `<li>${escapeHtml(String(item))}</li>`).join("");
  els.report.className = "report-card";
  els.report.innerHTML = `
    <h2>Practice Report</h2>
    <p>${escapeHtml(report.summary || "Practice completed.")}</p>
    <h3>Strengths</h3>
    <ul>${list(report.strengths)}</ul>
    <h3>Improvements</h3>
    <ul>${list(report.improvements)}</ul>
    <h3>Next Practice</h3>
    <ul>${list(report.nextPractice)}</ul>
  `;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function switchTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  els.transcriptView.classList.toggle("active", tabName === "transcript");
  els.reportView.classList.toggle("active", tabName === "report");
}

function startDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setCallState("Dictation unavailable", "This browser does not support built-in speech recognition.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => setCallState("Listening", "Speak one English answer.");
  recognition.onresult = (event) => {
    els.childMessage.value = event.results[0][0].transcript;
    setCallState("Dictation complete", "Check the text, then send it.");
  };
  recognition.onerror = () => setCallState("Dictation failed", "Please type the answer instead.");
  recognition.start();
  state.recognition = recognition;
}

async function loadInitialData() {
  renderRoles();
  const [configRes, lessonsRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/lessons")
  ]);
  const config = await configRes.json();
  const lessonsData = await lessonsRes.json();
  state.config = config;
  setApiStatus(config);
  if (config.mode === "realtime" && config.realtimeTransport !== "webrtc") {
    els.answerBox.style.display = "none";
    els.voiceSelect.disabled = false;
    els.startBtn.textContent = "Start realtime speaking";
    setCallState("Realtime mode", "Click start, allow microphone access, and speak with the tutor.");
  } else if (config.mode === "realtime") {
    els.answerBox.style.display = "none";
    els.voiceSelect.disabled = false;
    els.startBtn.textContent = "Start realtime speaking";
    setCallState("Realtime WebRTC mode", "Click start, allow microphone access, and speak with the tutor.");
  } else {
    els.answerBox.style.display = "";
    els.voiceSelect.disabled = true;
    els.startBtn.textContent = "Start practice";
    setCallState("Text mode", "Type or dictate an English answer, then let the tutor reply.");
  }
  state.lessons = lessonsData.lessons || [];
  els.lessonSelect.innerHTML = state.lessons.map((lesson) => `<option value="${lesson.id}">${lesson.title}</option>`).join("");
  renderLesson(state.lessons[0]);
}

els.lessonSelect.addEventListener("change", () => {
  const lesson = state.lessons.find((item) => item.id === els.lessonSelect.value);
  if (lesson) renderLesson(lesson);
});

els.keywordInput.addEventListener("input", renderKeywords);
els.startBtn.addEventListener("click", startPractice);
els.stopBtn.addEventListener("click", stopPractice);
els.sendBtn.addEventListener("click", sendAnswer);
els.listenBtn.addEventListener("click", startDictation);
els.childMessage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) sendAnswer();
});
els.editLessonBtn.addEventListener("click", () => {
  els.anchorText.focus();
  els.anchorText.select();
});
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

window.addEventListener("beforeunload", () => {
  window.speechSynthesis?.cancel();
  state.recognition?.abort();
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
  }
});

loadInitialData().catch((error) => {
  setCallState("Initialization failed", error.message);
  els.apiStatus.textContent = "Service error";
  els.apiStatus.className = "status-pill warn";
});
