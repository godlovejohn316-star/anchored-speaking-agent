const roles = [
  {
    id: "emma",
    name: "Miss Emma",
    initial: "E",
    style: "warm, patient, encouraging, asks simple questions, gives gentle recasts",
    label: "耐心外教",
    description: "适合低龄和初学者，鼓励多说完整句。"
  },
  {
    id: "story-guide",
    name: "Captain Leo",
    initial: "L",
    style: "playful story character, curious, dramatic but still focused on the anchor text",
    label: "故事角色",
    description: "适合故事文本，用角色扮演带动表达。"
  },
  {
    id: "interviewer",
    name: "Mr. Parker",
    initial: "P",
    style: "friendly interviewer, structured, asks follow-up questions and invites reasons",
    label: "小面试官",
    description: "适合观点表达、复述和考试型练习。"
  }
];

const state = {
  lessons: [],
  selectedLesson: null,
  selectedRole: roles[0],
  pc: null,
  dc: null,
  localStream: null,
  startedAt: null,
  timerId: null,
  transcript: []
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
  callState: document.querySelector("#callState"),
  callHint: document.querySelector("#callHint"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  timer: document.querySelector("#timer"),
  remoteAudio: document.querySelector("#remoteAudio"),
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
  els.apiStatus.textContent = config.configured ? "API 已配置" : "未配置 API";
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
  const normalizedRole = role === "assistant" ? state.selectedRole.name : role === "child" ? "孩子" : role;
  state.transcript.push({ role, text: text.trim(), at: new Date().toISOString() });
  const template = document.querySelector("#messageTemplate");
  const node = template.content.cloneNode(true);
  node.querySelector(".message-role").textContent = normalizedRole;
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

function getEphemeralKey(session) {
  return session?.client_secret?.value || session?.client_secret;
}

async function startPractice() {
  const lesson = currentLessonFromForm();
  if (!lesson.text) {
    setCallState("缺少锚定文本", "请先输入一段练习文本。");
    return;
  }

  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  setCallState("正在连接外教", "请允许浏览器使用麦克风。");
  els.report.textContent = "练习进行中，结束后生成报告。";
  state.transcript = [];
  els.transcript.innerHTML = "";

  try {
    const sessionRes = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lesson,
        role: state.selectedRole,
        child: {
          id: els.childName.value.trim().toLowerCase() || "anonymous",
          name: els.childName.value.trim() || "the learner"
        }
      })
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(session.error || "创建实时会话失败。");

    const ephemeralKey = getEphemeralKey(session);
    if (!ephemeralKey) throw new Error("Realtime session did not include a client secret.");

    state.pc = new RTCPeerConnection();
    state.pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of state.localStream.getTracks()) {
      state.pc.addTrack(track, state.localStream);
    }

    state.dc = state.pc.createDataChannel("oai-events");
    state.dc.addEventListener("open", () => {
      setCallState("外教已在线", "可以直接开口说英语。AI 会围绕文本追问和引导。");
      addMessage("system", "Session started. Try: Can you ask me about the story?");
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

    const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ephemeralKey}`,
        "content-type": "application/sdp"
      },
      body: offer.sdp
    });
    const answerSdp = await sdpRes.text();
    if (!sdpRes.ok) throw new Error(answerSdp || "WebRTC 连接失败。");

    await state.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    state.startedAt = Date.now();
    state.timerId = setInterval(updateTimer, 1000);
    updateTimer();
  } catch (error) {
    setCallState("连接失败", error.message);
    await cleanupCall(false);
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

async function cleanupCall(keepStopDisabled = true) {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.startedAt = null;

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

async function stopPractice() {
  els.stopBtn.disabled = true;
  setCallState("正在生成报告", "我在整理关键词覆盖、表达亮点和下一步练习句。");
  await cleanupCall(true);

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
    if (!res.ok) throw new Error(data.error || "报告生成失败。");
    renderReport(data.report);
    switchTab("report");
    setCallState("练习完成", "报告已经生成，可以换一个角色或文本继续练。");
  } catch (error) {
    els.report.textContent = error.message;
    setCallState("报告失败", error.message);
  }
}

function renderReport(report) {
  const list = (items) => (Array.isArray(items) ? items : []).map((item) => `<li>${escapeHtml(String(item))}</li>`).join("");
  els.report.className = "report-card";
  els.report.innerHTML = `
    <h2>本次复盘</h2>
    <p>${escapeHtml(report.summary || "练习已完成。")}</p>
    <h3>亮点</h3>
    <ul>${list(report.strengths)}</ul>
    <h3>下次改进</h3>
    <ul>${list(report.improvements)}</ul>
    <h3>复练句</h3>
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

async function loadInitialData() {
  renderRoles();
  const [configRes, lessonsRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/lessons")
  ]);
  const config = await configRes.json();
  const lessonsData = await lessonsRes.json();
  setApiStatus(config);
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
els.editLessonBtn.addEventListener("click", () => {
  els.anchorText.focus();
  els.anchorText.select();
});
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

window.addEventListener("beforeunload", () => {
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
  }
});

loadInitialData().catch((error) => {
  setCallState("初始化失败", error.message);
  els.apiStatus.textContent = "服务异常";
  els.apiStatus.className = "status-pill warn";
});
