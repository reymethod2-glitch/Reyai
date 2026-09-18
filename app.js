(() => {
  "use strict";

  const MODELS = [
    { id: "xyrz/gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "GPT-5.6" },
    { id: "xyrz/gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "GPT-5.6" },
    { id: "xyrz/gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "GPT-5.6" },
    { id: "xyrz/gpt-5.5", name: "GPT-5.5", provider: "GPT-5.5" },
    { id: "xyrz/gpt-5.5-review", name: "GPT-5.5 Review", provider: "GPT-5.5" },
    { id: "xyrz/minimax-m2.1", name: "MiniMax M2.1", provider: "MiniMax" },
    { id: "xyrz/minimax-m3", name: "MiniMax M3", provider: "MiniMax" },
    { id: "xyrz/glm-5.1", name: "GLM-5.1", provider: "GLM" },
    { id: "xyrz/glm-5.3", name: "GLM-5.3", provider: "GLM" },
    { id: "xyrz/glm-5.3-flash", name: "GLM-5.3 Flash", provider: "GLM" },
    { id: "xyrz/kimi-k2.7-code", name: "Kimi K2.7 Code", provider: "Kimi" },
    { id: "xyrz/kimi-k3", name: "Kimi K3", provider: "Kimi" },
    { id: "xyrz/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek" },
    { id: "xyrz/deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek" },
    { id: "xyrz/deepsek-4.1-flash", name: "DeepSek 4.1 Flash", provider: "DeepSeek" },
    { id: "xyrz/claude-fable-5", name: "Claude Fable 5", provider: "Claude" },
    { id: "xyrz/claude-fable5.1", name: "Claude Fable 5.1", provider: "Claude" },
    { id: "xyrz/claude-opus-4.7", name: "Claude Opus 4.7", provider: "Claude" },
    { id: "xyrz/claude-opus-5", name: "Claude Opus 5", provider: "Claude" },
    { id: "xyrz/gpt-6-astra", name: "GPT-6 Astra", provider: "GPT-6" },
    { id: "xyrz/qwen3.7-max", name: "Qwen 3.7 Max", provider: "Qwen" },
    { id: "xyrz/qwen3.7-plus", name: "Qwen 3.7 Plus", provider: "Qwen" },
    { id: "xyrz/qwen3.8-max-preview", name: "Qwen 3.8 Max Preview", provider: "Qwen" }
  ];

  const STORAGE = {
    chats: "xyrus-ai-conversations-v1",
    settings: "xyrus-ai-settings-v1",
    selectedModel: "xyrus-ai-selected-model-v1"
  };
  const SYSTEM_PROMPT = "Kamu adalah asisten AI yang membantu pengguna dengan jelas, akurat, dan relevan.";
  const MAX_MESSAGES = 1000;
  const MAX_MESSAGE_CHARS = 50000;

  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar: $("sidebar"), drawerOverlay: $("drawerOverlay"), newChatBtn: $("newChatBtn"),
    sidebarNewChat: $("sidebarNewChat"), historySearch: $("historySearch"), historyList: $("historyList"),
    clearAllBtn: $("clearAllBtn"), settingsBtn: $("settingsBtn"), headerSettingsBtn: $("headerSettingsBtn"),
    menuBtn: $("menuBtn"), modelPicker: $("modelPicker"), modelButton: $("modelButton"),
    selectedModelName: $("selectedModelName"), modelMenu: $("modelMenu"), modelSearch: $("modelSearch"),
    modelOptions: $("modelOptions"), connectionStatus: $("connectionStatus"), chatScroll: $("chatScroll"),
    chatContent: $("chatContent"), emptyState: $("emptyState"), scrollLatestBtn: $("scrollLatestBtn"),
    composerForm: $("composerForm"), messageInput: $("messageInput"), charCount: $("charCount"),
    sendBtn: $("sendBtn"), stopBtn: $("stopBtn"), modalRoot: $("modalRoot"), modalBackdrop: $("modalBackdrop"),
    modalDialog: $("modalDialog"), modalClose: $("modalClose"), modalTitle: $("modalTitle"),
    modalEyebrow: $("modalEyebrow"), modalBody: $("modalBody"), modalFooter: $("modalFooter"), toastRegion: $("toastRegion")
  };

  const state = {
    conversations: [],
    activeId: null,
    settings: {
      theme: "dark",
      enterToSend: true,
      autoScroll: true,
      defaultModel: "xyrz/gpt-5.6-luna",
      systemPrompt: SYSTEM_PROMPT
    },
    selectedModel: "xyrz/gpt-5.6-luna",
    controller: null,
    generationId: 0,
    streaming: false,
    userNearBottom: true,
    modalCloseTimer: null,
    lastModalFocus: null,
    modelFocusIndex: -1
  };

  function uid(prefix = "id") {
    if (crypto && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function now() { return Date.now(); }

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function normalizeMessage(m) {
    if (!m || typeof m !== "object") return null;
    if (!["user", "assistant"].includes(m.role) || typeof m.content !== "string") return null;
    if (m.content.length > MAX_MESSAGE_CHARS) return null;
    return { id: typeof m.id === "string" ? m.id : uid("msg"), role: m.role, content: m.content, interrupted: m.interrupted === true };
  }

  function normalizeConversation(c) {
    if (!c || typeof c !== "object") return null;
    if (typeof c.id !== "string" || !Array.isArray(c.messages)) return null;
    const messages = c.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES);
    const model = MODELS.some(m => m.id === c.model) ? c.model : state.settings.defaultModel;
    const title = typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 120) : "Obrolan baru";
    return {
      id: c.id,
      title,
      createdAt: Number.isFinite(c.createdAt) ? c.createdAt : now(),
      updatedAt: Number.isFinite(c.updatedAt) ? c.updatedAt : now(),
      model,
      messages
    };
  }

  function loadState() {
    const savedSettings = safeParse(localStorage.getItem(STORAGE.settings), null);
    if (savedSettings && typeof savedSettings === "object") {
      state.settings.theme = ["dark", "light", "system"].includes(savedSettings.theme) ? savedSettings.theme : "dark";
      state.settings.enterToSend = savedSettings.enterToSend !== false;
      state.settings.autoScroll = savedSettings.autoScroll !== false;
      state.settings.defaultModel = MODELS.some(m => m.id === savedSettings.defaultModel) ? savedSettings.defaultModel : state.settings.defaultModel;
      state.settings.systemPrompt = typeof savedSettings.systemPrompt === "string" && savedSettings.systemPrompt.trim() ? savedSettings.systemPrompt : SYSTEM_PROMPT;
    }
    const savedChats = safeParse(localStorage.getItem(STORAGE.chats), []);
    state.conversations = Array.isArray(savedChats) ? savedChats.map(normalizeConversation).filter(Boolean) : [];
    const savedModel = localStorage.getItem(STORAGE.selectedModel);
    state.selectedModel = MODELS.some(m => m.id === savedModel) ? savedModel : state.settings.defaultModel;
    if (!state.conversations.length) createConversation(false);
    else state.activeId = state.conversations.slice().sort((a,b) => b.updatedAt - a.updatedAt)[0].id;
  }

  function persistChats() {
    try { localStorage.setItem(STORAGE.chats, JSON.stringify(state.conversations)); }
    catch { showToast("Riwayat terlalu besar untuk disimpan di browser.", "error"); }
  }

  function persistSettings() {
    try { localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings)); } catch {}
  }

  function activeConversation() {
    return state.conversations.find(c => c.id === state.activeId) || null;
  }

  function createConversation(render = true) {
    if (state.streaming) stopGeneration();
    const t = now();
    const c = { id: uid("chat"), title: "Obrolan baru", createdAt: t, updatedAt: t, model: state.selectedModel, messages: [] };
    state.conversations.unshift(c);
    state.activeId = c.id;
    persistChats();
    if (render) renderAll();
    if (render) setTimeout(() => els.messageInput.focus(), 40);
    closeDrawer();
  }

  function renderAll() {
    renderHistory();
    renderModelButton();
    renderChat();
    resizeTextarea();
    updateSendState();
    applyTheme();
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }

  function renderHistory() {
    const query = els.historySearch.value.trim().toLowerCase();
    const items = state.conversations
      .slice().sort((a,b) => b.updatedAt - a.updatedAt)
      .filter(c => {
        if (!query) return true;
        const hay = `${c.title} ${c.messages.map(m => m.content).join(" ")}`.toLowerCase();
        return hay.includes(query);
      });
    els.historyList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = query ? "Tidak ada percakapan yang cocok." : "Belum ada riwayat.";
      els.historyList.append(empty);
      return;
    }
    for (const c of items) {
      const row = document.createElement("div");
      row.className = `history-item${c.id === state.activeId ? " active" : ""}`;
      row.setAttribute("role", "listitem");
      const main = document.createElement("button");
      main.type = "button"; main.className = "history-main"; main.dataset.chatId = c.id;
      const title = document.createElement("span"); title.className = "history-title"; title.textContent = c.title;
      const meta = document.createElement("span"); meta.className = "history-meta"; meta.textContent = `${formatDate(c.updatedAt)} · ${modelById(c.model).name}`;
      main.append(title, meta);
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "history-menu-btn"; menu.dataset.renameId = c.id; menu.setAttribute("aria-label", `Kelola ${c.title}`);
      menu.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>';
      row.append(main, menu); els.historyList.append(row);
    }
  }

  function modelById(id) { return MODELS.find(m => m.id === id) || MODELS[0]; }

  function renderModelButton() {
    const m = modelById(state.selectedModel);
    els.selectedModelName.textContent = m.name;
    const c = activeConversation();
    if (c && !c.messages.length) c.model = state.selectedModel;
  }

  function renderModelOptions(filter = "") {
    const q = filter.trim().toLowerCase();
    els.modelOptions.replaceChildren();
    const grouped = new Map();
    for (const m of MODELS) {
      if (q && !`${m.name} ${m.id} ${m.provider}`.toLowerCase().includes(q)) continue;
      if (!grouped.has(m.provider)) grouped.set(m.provider, []);
      grouped.get(m.provider).push(m);
    }
    if (!grouped.size) {
      const no = document.createElement("div"); no.className = "history-empty"; no.textContent = "Model tidak ditemukan."; els.modelOptions.append(no); return;
    }
    for (const [provider, models] of grouped) {
      const label = document.createElement("div"); label.className = "provider-label"; label.textContent = provider; els.modelOptions.append(label);
      models.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = `model-option${m.id === state.selectedModel ? " selected" : ""}`;
        b.dataset.modelId = m.id; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(m.id === state.selectedModel));
        const icon = document.createElement("span"); icon.className = "model-provider-icon"; icon.textContent = provider.slice(0,2).toUpperCase();
        const copy = document.createElement("span"); copy.style.minWidth = "0";
        const name = document.createElement("span"); name.className = "model-option-name"; name.textContent = m.name; name.style.display = "block";
        const id = document.createElement("span"); id.className = "model-option-id"; id.textContent = m.id; id.style.display = "block";
        copy.append(name,id); b.append(icon,copy);
        if (m.id === state.selectedModel) { const check = document.createElement("span"); check.className = "model-check"; check.textContent = "✓"; b.append(check); }
        els.modelOptions.append(b);
      });
    }
  }

  function setSelectedModel(id) {
    if (!MODELS.some(m => m.id === id)) return;
    state.selectedModel = id;
    localStorage.setItem(STORAGE.selectedModel, id);
    const c = activeConversation();
    if (c && c.messages.length === 0) { c.model = id; c.updatedAt = now(); persistChats(); }
    renderModelButton(); renderModelOptions(els.modelSearch.value); closeModelMenu();
    showToast(`Model: ${modelById(id).name}`, "info");
  }

  function renderChat() {
    const c = activeConversation();
    const shouldStick = isNearBottom();
    els.chatContent.replaceChildren();
    if (!c || !c.messages.length) {
      els.chatContent.append(els.emptyState);
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;
    for (const m of c.messages) els.chatContent.append(createMessageElement(m));
    if (shouldStick || state.settings.autoScroll) scrollToBottom(false);
  }

  function iconFor(role) {
    return role === "user"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 20c.7-3.5 2.9-5.3 6.5-5.3s5.8 1.8 6.5 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10l2 3v8l-2 3H7l-2-3V8l2-3Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m9 10 2 2-2 2m4-4 2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function createMessageElement(m) {
    const article = document.createElement("article");
    article.className = `message ${m.role}`;
    article.dataset.messageId = m.id;
    const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.innerHTML = iconFor(m.role);
    const body = document.createElement("div"); body.className = "message-body";
    const content = document.createElement("div"); content.className = m.role === "assistant" ? "message-content markdown" : "message-content";
    if (m.role === "assistant") renderMarkdownInto(content, m.content);
    else content.textContent = m.content;
    body.append(content);
    if (m.interrupted) { const interrupted = document.createElement("div"); interrupted.className = "interrupted"; interrupted.textContent = "Generasi dihentikan."; body.append(interrupted); }
    const actions = document.createElement("div"); actions.className = "message-actions";
    const actionsList = m.role === "user"
      ? [["copy","Salin"],["edit","Edit"],["delete","Hapus"]]
      : [["copy","Salin"],["regenerate","Regenerasi"],["delete","Hapus"]];
    for (const [action, label] of actionsList) {
      const b = document.createElement("button"); b.type = "button"; b.className = `mini-action${action === "delete" ? " danger" : ""}`; b.dataset.action = action; b.dataset.messageId = m.id; b.textContent = label; actions.append(b);
    }
    body.append(actions);
    if (m.role === "user") article.append(body); else article.append(avatar, body);
    return article;
  }

  function renderMarkdownInto(container, markdown) {
    if (!markdown) {
      container.innerHTML = '<span class="typing-cursor" aria-label="Sedang mengetik"></span>';
      return;
    }
    if (!window.marked || !window.DOMPurify) { container.textContent = markdown; return; }
    const raw = marked.parse(markdown, { gfm: true, breaks: true });
    const clean = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script","iframe","object","embed","form","input","button","style"],
      FORBID_ATTR: ["onclick","onerror","onload","onmouseover","onfocus","onmouseenter","onmouseleave"],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i
    });
    container.innerHTML = clean;
    container.querySelectorAll("a").forEach(a => {
      const href = a.getAttribute("href") || "";
      if (!/^(https?:|mailto:)/i.test(href)) a.removeAttribute("href");
      else { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });
    container.querySelectorAll("pre").forEach(pre => {
      const code = pre.querySelector("code");
      if (!code) return;
      const wrap = document.createElement("div"); wrap.className = "code-wrap";
      const head = document.createElement("div"); head.className = "code-head";
      const label = document.createElement("span"); label.textContent = languageFromClass(code.className);
      const copy = document.createElement("button"); copy.type = "button"; copy.className = "code-copy"; copy.textContent = "Copy code"; copy.dataset.code = code.textContent;
      head.append(label, copy); pre.parentNode.insertBefore(wrap, pre); wrap.append(head, pre);
      if (window.hljs) { try { hljs.highlightElement(code); } catch {} }
    });
  }

  function languageFromClass(className) {
    const match = /language-([^\s]+)/.exec(className || "");
    return match ? match[1] : "code";
  }

  function updateMessageDom(messageId, content, streaming = false, interrupted = false) {
    const article = els.chatContent.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!article) return;
    const box = article.querySelector(".message-content");
    if (box) renderMarkdownInto(box, content);
    const old = article.querySelector(".interrupted");
    if (old) old.remove();
    if (interrupted) { const el = document.createElement("div"); el.className = "interrupted"; el.textContent = "Generasi dihentikan."; article.querySelector(".message-body").append(el); }
    if (streaming) {
      const cursor = article.querySelector(".message-content .typing-cursor");
      if (!cursor) {
        const c = document.createElement("span"); c.className = "typing-cursor"; c.setAttribute("aria-label","Sedang mengetik");
        article.querySelector(".message-content").append(c);
      }
    }
  }

  function autoTitle(c, text) {
    if (!c || c.title !== "Obrolan baru" || c.messages.filter(m => m.role === "user").length !== 1) return;
    const clean = text.replace(/\s+/g, " ").trim();
    c.title = clean.length > 40 ? `${clean.slice(0, 40).trimEnd()}...` : clean;
  }

  function getContextMessages(c) {
    const system = (state.settings.systemPrompt || SYSTEM_PROMPT).trim() || SYSTEM_PROMPT;
    const result = [{ role: "system", content: system }];
    for (const m of c.messages) if (m.role === "user" || m.role === "assistant") result.push({ role: m.role, content: m.content });
    return result;
  }

  async function sendMessage(textOverride = null) {
    const c = activeConversation();
    if (!c || state.streaming) return;
    const text = (textOverride !== null ? textOverride : els.messageInput.value).trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE_CHARS) { showToast("Pesan terlalu panjang.", "error"); return; }

    if (c.messages.length === 0) c.model = state.selectedModel;
    const generationId = ++state.generationId;
    const user = { id: uid("msg"), role: "user", content: text, interrupted: false };
    const assistant = { id: uid("msg"), role: "assistant", content: "", interrupted: false };
    c.messages.push(user, assistant);
    c.updatedAt = now(); autoTitle(c, text); persistChats();
    els.messageInput.value = ""; resizeTextarea(); updateCharCount();
    state.streaming = true; setStatus("connecting", "Connecting"); toggleGeneratingUI(true);
    renderChat();
    const assistantEl = els.chatContent.querySelector(`[data-message-id="${CSS.escape(assistant.id)}"]`);
    if (assistantEl) updateMessageDom(assistant.id, "", true);
    await runGeneration(c.id, assistant.id, generationId);
  }

  async function runGeneration(chatId, assistantId, generationId) {
    const c = state.conversations.find(x => x.id === chatId);
    if (!c || state.activeId !== chatId) return;
    const assistant = c.messages.find(m => m.id === assistantId);
    if (!assistant) return;
    const controller = new AbortController();
    state.controller = controller;
    let timeoutId = setTimeout(() => controller.abort("timeout"), 90000);
    let received = false;
    let streamEnded = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify({ model: c.model, messages: getContextMessages(c), stream: true }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (generationId !== state.generationId || state.activeId !== chatId) return;
      if (!response.ok) {
        const errorText = await safeResponseText(response);
        throw new ApiError(response.status, parseServerError(errorText, response.status));
      }
      setStatus("connected", "Connected");
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/event-stream") && response.body) {
        await readSSE(response.body, (delta) => {
          if (generationId !== state.generationId || state.activeId !== chatId) return;
          if (delta) {
            received = true; assistant.content += delta; persistChatsThrottled();
            updateMessageDom(assistant.id, assistant.content, true, false);
            if (state.settings.autoScroll && isNearBottom()) scrollToBottom(false);
          }
        }, () => { streamEnded = true; });
      } else {
        const data = await parseJsonResponse(response);
        const content = extractAssistantContent(data);
        if (!content) throw new ApiError(502, "Gateway mengembalikan respons kosong.");
        received = true; assistant.content = content; updateMessageDom(assistant.id, content, false);
      }
      if (!received) throw new ApiError(502, "AI tidak mengembalikan teks.");
    } catch (err) {
      clearTimeout(timeoutId);
      if (generationId !== state.generationId || state.activeId !== chatId) return;
      if (err.name === "AbortError" || controller.signal.aborted) {
        assistant.interrupted = true;
        if (!assistant.content) assistant.content = "Generasi dihentikan.";
        updateMessageDom(assistant.id, assistant.content, false, true);
      } else {
        const message = err instanceof ApiError ? err.message : friendlyNetworkError(err);
        assistant.content = assistant.content || `Terjadi kesalahan: ${message}`;
        updateMessageDom(assistant.id, assistant.content, false, false);
        showToast(message, "error");
        setStatus("error", "Error");
      }
    } finally {
      clearTimeout(timeoutId);
      if (generationId !== state.generationId) return;
      state.controller = null; state.streaming = false; toggleGeneratingUI(false);
      const current = state.conversations.find(x => x.id === chatId);
      if (current) { current.updatedAt = now(); persistChats(); renderHistory(); }
      if (streamEnded || received) setStatus("connected", "Connected");
      else if (!state.connectionStatus?.error) setStatus("ready", "Ready");
    }
  }

  let persistTimer = null;
  function persistChatsThrottled() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistChats, 250);
  }

  class ApiError extends Error {
    constructor(status, message) { super(message); this.name = "ApiError"; this.status = status; }
  }

  async function readSSE(body, onDelta, onDone) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      buffer += decoder.decode(result.value || new Uint8Array(), { stream: !done });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || "";
      for (const block of parts) {
        const dataLines = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart());
        if (!dataLines.length) continue;
        const data = dataLines.join("\n");
        if (data === "[DONE]") { onDone(); try { reader.cancel(); } catch {} return; }
        try {
          const parsed = JSON.parse(data);
          const delta = extractDelta(parsed);
          if (delta) onDelta(delta);
        } catch {
          if (data && !data.startsWith(":")) throw new ApiError(502, "Stream AI tidak valid.");
        }
      }
    }
    if (buffer.trim()) {
      const dataLines = buffer.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart());
      for (const data of dataLines) {
        if (data === "[DONE]") { onDone(); continue; }
        try { const parsed = JSON.parse(data); const delta = extractDelta(parsed); if (delta) onDelta(delta); }
        catch { throw new ApiError(502, "Stream AI tidak valid."); }
      }
    }
    onDone();
  }

  function extractDelta(data) {
    const choice = data?.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.content === "string") return delta.content;
    if (Array.isArray(delta?.content)) return delta.content.map(x => typeof x?.text === "string" ? x.text : "").join("");
    if (typeof choice?.text === "string") return choice.text;
    return "";
  }

  function extractAssistantContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(x => typeof x?.text === "string" ? x.text : "").join("");
    return "";
  }

  async function safeResponseText(response) {
    try { return await response.text(); } catch { return ""; }
  }

  async function parseJsonResponse(response) {
    const text = await safeResponseText(response);
    try { return JSON.parse(text); } catch { throw new ApiError(502, "Respons server tidak valid."); }
  }

  function parseServerError(text, status) {
    try {
      const data = JSON.parse(text);
      if (typeof data.error === "string") return data.error;
      if (typeof data.message === "string") return data.message;
    } catch {}
    const map = {400:"Permintaan tidak valid.",401:"Sesi API tidak terautentikasi.",403:"Akses ke gateway ditolak.",408:"Permintaan melewati batas waktu.",429:"Gateway sedang membatasi permintaan. Coba lagi sebentar.",500:"Server AI mengalami kesalahan.",502:"Gateway AI bermasalah.",503:"Layanan AI sedang tidak tersedia.",504:"Gateway AI melewati batas waktu."};
    return map[status] || "Terjadi kesalahan pada server AI.";
  }

  function friendlyNetworkError(err) {
    if (err && err.name === "AbortError") return "Permintaan dihentikan atau melewati batas waktu.";
    if (!navigator.onLine) return "Tidak ada koneksi internet.";
    return "Tidak dapat terhubung ke server Xyrus AI.";
  }

  function stopGeneration() {
    if (!state.streaming) return;
    ++state.generationId;
    if (state.controller) state.controller.abort();
    const c = activeConversation();
    if (c) {
      const last = c.messages[c.messages.length - 1];
      if (last?.role === "assistant") { last.interrupted = true; if (!last.content) last.content = "Generasi dihentikan."; }
      c.updatedAt = now(); persistChats();
    }
    state.streaming = false; state.controller = null; toggleGeneratingUI(false); setStatus("connected", "Connected");
    renderChat();
  }

  async function regenerateLast() {
    const c = activeConversation();
    if (!c || state.streaming) return;
    const idx = c.messages.length - 1;
    if (idx < 1 || c.messages[idx].role !== "assistant" || c.messages[idx - 1].role !== "user") return;
    c.messages.splice(idx, 1);
    const assistant = { id: uid("msg"), role: "assistant", content: "", interrupted: false };
    c.messages.push(assistant); c.updatedAt = now(); persistChats();
    state.streaming = true; const generationId = ++state.generationId;
    setStatus("connecting", "Connecting"); toggleGeneratingUI(true); renderChat();
    updateMessageDom(assistant.id, "", true);
    await runGeneration(c.id, assistant.id, generationId);
  }

  function editMessage(id) {
    const c = activeConversation(); const m = c?.messages.find(x => x.id === id);
    if (!c || !m || m.role !== "user" || state.streaming) return;
    els.messageInput.value = m.content; resizeTextarea(); updateCharCount(); els.messageInput.focus();
    els.messageInput.dataset.editId = id;
    els.sendBtn.setAttribute("aria-label", "Kirim edit");
    showToast("Edit pesan lalu tekan Enter untuk mengirim ulang.", "info");
  }

  async function submitEdit(id) {
    const c = activeConversation(); const m = c?.messages.find(x => x.id === id);
    if (!c || !m || m.role !== "user" || state.streaming) return;
    const text = els.messageInput.value.trim();
    if (!text) return;
    const idx = c.messages.findIndex(x => x.id === id);
    m.content = text;
    c.messages = c.messages.slice(0, idx + 1);
    c.updatedAt = now(); autoTitle(c, text); persistChats();
    els.messageInput.value = ""; delete els.messageInput.dataset.editId; resizeTextarea(); updateCharCount();
    const assistant = { id: uid("msg"), role: "assistant", content: "", interrupted: false };
    c.messages.push(assistant);
    const generationId = ++state.generationId; state.streaming = true; setStatus("connecting","Connecting"); toggleGeneratingUI(true); renderChat();
    updateMessageDom(assistant.id, "", true);
    await runGeneration(c.id, assistant.id, generationId);
  }

  function deleteMessage(id) {
    const c = activeConversation(); if (!c || state.streaming) return;
    const m = c.messages.find(x => x.id === id); if (!m) return;
    openConfirm("Hapus pesan", "Pesan ini akan dihapus dari percakapan.", () => {
      c.messages = c.messages.filter(x => x.id !== id); c.updatedAt = now(); persistChats(); renderChat(); renderHistory();
    }, "Hapus");
  }

  function deleteConversation(id) {
    const c = state.conversations.find(x => x.id === id); if (!c) return;
    openConfirm("Hapus percakapan", "Apakah kamu yakin ingin menghapus percakapan ini?", () => {
      if (state.activeId === id && state.streaming) stopGeneration();
      state.conversations = state.conversations.filter(x => x.id !== id);
      if (!state.conversations.length) createConversation(false);
      else if (state.activeId === id) state.activeId = state.conversations.slice().sort((a,b) => b.updatedAt-a.updatedAt)[0].id;
      persistChats(); renderAll();
    }, "Hapus");
  }

  function renameConversation(id) {
    const c = state.conversations.find(x => x.id === id); if (!c) return;
    openModal("Ganti nama", "Percakapan", `
      <div class="rename-form"><label for="renameInput" class="setting-note">Nama percakapan</label><input id="renameInput" class="setting-input" maxlength="80" value="${escapeAttr(c.title)}"></div>
    `, [
      { label: "Batal", action: closeModal },
      { label: "Simpan", primary: true, action: () => {
        const input = $("renameInput"); const title = input?.value.trim();
        if (!title) { showToast("Nama tidak boleh kosong.", "error"); return; }
        c.title = title.slice(0,80); c.updatedAt = now(); persistChats(); renderHistory(); closeModal();
      }}
    ]);
    setTimeout(() => { const input = $("renameInput"); input?.focus(); input?.select(); }, 50);
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function openConfirm(title, message, onConfirm, confirmLabel = "Hapus") {
    openModal(title, "Konfirmasi", `<p class="confirm-copy">${escapeHtml(message)}</p>`, [
      { label: "Batal", action: closeModal },
      { label: confirmLabel, primary: true, danger: confirmLabel === "Hapus", action: () => { onConfirm(); closeModal(); } }
    ]);
  }

  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

  function openSettings() {
    const selected = state.settings.theme;
    openModal("Pengaturan", "Xyrus AI", `
      <section class="setting-section"><h3>Appearance</h3>
        <div class="segmented" id="themeSegment">
          <button type="button" data-theme-choice="dark" class="${selected==="dark"?"active":""}">Dark</button>
          <button type="button" data-theme-choice="light" class="${selected==="light"?"active":""}">Light</button>
          <button type="button" data-theme-choice="system" class="${selected==="system"?"active":""}">System</button>
        </div>
      </section>
      <section class="setting-section"><h3>Chat</h3>
        <div class="setting-row"><div><strong>Enter untuk mengirim</strong><small>Shift + Enter tetap membuat baris baru.</small></div><label class="switch"><input id="enterToggle" type="checkbox" ${state.settings.enterToSend?"checked":""}><span class="slider"></span></label></div>
        <div class="setting-row"><div><strong>Auto-scroll</strong><small>Ikuti respons saat kamu berada dekat bagian bawah.</small></div><label class="switch"><input id="scrollToggle" type="checkbox" ${state.settings.autoScroll?"checked":""}><span class="slider"></span></label></div>
      </section>
      <section class="setting-section"><h3>AI</h3>
        <label class="setting-note" for="defaultModelSelect">Default model</label>
        <select id="defaultModelSelect" class="setting-select" style="margin-top:6px">${MODELS.map(m=>`<option value="${escapeAttr(m.id)}" ${m.id===state.settings.defaultModel?"selected":""}>${escapeHtml(m.name)} — ${escapeHtml(m.provider)}</option>`).join("")}</select>
        <label class="setting-note" for="systemPromptInput" style="display:block;margin-top:12px">System prompt</label>
        <textarea id="systemPromptInput" class="setting-input" maxlength="12000" style="margin-top:6px">${escapeHtml(state.settings.systemPrompt)}</textarea>
        <div class="setting-note" style="margin-top:5px">Jika dikosongkan, prompt default Xyrus AI akan digunakan.</div>
      </section>
      <section class="setting-section"><h3>Data</h3><div class="action-grid">
        <button id="exportBtn" type="button" class="btn">Export percakapan</button>
        <button id="importBtn" type="button" class="btn">Import JSON</button>
        <button id="settingsClearBtn" type="button" class="btn danger">Clear all chats</button>
      </div><input id="importFile" type="file" accept="application/json,.json" hidden></section>
      <section class="setting-section"><h3>About</h3><div class="setting-row"><div><strong>Xyrus AI</strong><small>Premium AI Chat Workspace</small></div><span class="setting-note">23 models</span></div><div class="setting-row"><div><strong>Gateway status</strong><small>Server-side proxy melalui /api/chat</small></div><span class="setting-note">Ready</span></div></section>
    `, [{ label: "Selesai", primary: true, action: saveSettingsFromModal }]);

    $("themeSegment")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-theme-choice]"); if (!btn) return;
      state.settings.theme = btn.dataset.themeChoice; persistSettings(); applyTheme();
      document.querySelectorAll("[data-theme-choice]").forEach(x=>x.classList.toggle("active", x===btn));
    });
    $("enterToggle")?.addEventListener("change", e => { state.settings.enterToSend = e.target.checked; persistSettings(); });
    $("scrollToggle")?.addEventListener("change", e => { state.settings.autoScroll = e.target.checked; persistSettings(); });
    $("exportBtn")?.addEventListener("click", exportChats);
    $("importBtn")?.addEventListener("click", () => $("importFile")?.click());
    $("importFile")?.addEventListener("change", e => { if (e.target.files[0]) importChats(e.target.files[0]); });
    $("settingsClearBtn")?.addEventListener("click", () => {
      openConfirm("Clear all chats", "Semua percakapan yang tersimpan di browser akan dihapus.", () => {
        if (state.streaming) stopGeneration();
        state.conversations = []; createConversation(false); persistChats(); renderAll(); showToast("Semua percakapan dihapus.", "success"); openSettings();
      }, "Hapus semua");
    });
  }

  function saveSettingsFromModal() {
    const prompt = $("systemPromptInput")?.value.trim();
    state.settings.systemPrompt = prompt || SYSTEM_PROMPT;
    state.settings.defaultModel = MODELS.some(m => m.id === $("defaultModelSelect")?.value) ? $("defaultModelSelect").value : state.settings.defaultModel;
    persistSettings(); closeModal(); showToast("Pengaturan disimpan.", "success");
  }

  function exportChats() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), conversations: state.conversations };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
    const date = new Date().toISOString().slice(0,10); a.download = `xyrus-ai-conversations-${date}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Percakapan berhasil diekspor.", "success");
  }

  async function importChats(file) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("File terlalu besar.");
      const text = await file.text(); const data = JSON.parse(text);
      const raw = Array.isArray(data) ? data : data?.conversations;
      if (!Array.isArray(raw)) throw new Error("Format JSON tidak didukung.");
      const imported = raw.map(normalizeConversation).filter(Boolean);
      if (!imported.length) throw new Error("Tidak ada percakapan valid.");
      const map = new Map(state.conversations.map(c => [c.id, c]));
      imported.forEach(c => {
        const existing = map.get(c.id);
        if (!existing || c.updatedAt > existing.updatedAt) map.set(c.id, c);
      });
      state.conversations = Array.from(map.values()).sort((a,b)=>b.updatedAt-a.updatedAt);
      if (!state.conversations.some(c => c.id === state.activeId)) state.activeId = state.conversations[0].id;
      persistChats(); renderAll(); closeModal(); showToast(`${imported.length} percakapan diimpor.`, "success");
    } catch (e) { showToast(`Import gagal: ${e.message || "JSON rusak."}`, "error"); }
  }

  function openModal(title, eyebrow, bodyHtml, buttons = []) {
    state.lastModalFocus = document.activeElement;
    els.modalTitle.textContent = title; els.modalEyebrow.textContent = eyebrow || "Xyrus AI";
    els.modalBody.innerHTML = bodyHtml; els.modalFooter.replaceChildren();
    for (const cfg of buttons) {
      const b = document.createElement("button"); b.type = "button"; b.className = `btn${cfg.primary ? " primary" : ""}${cfg.danger ? " danger" : ""}`; b.textContent = cfg.label;
      b.addEventListener("click", cfg.action); els.modalFooter.append(b);
    }
    els.modalRoot.hidden = false; document.body.style.overflow = "hidden";
    requestAnimationFrame(() => els.modalDialog.focus());
  }

  function closeModal() {
    if (els.modalRoot.hidden) return;
    els.modalRoot.hidden = true; document.body.style.overflow = "";
    if (state.lastModalFocus && document.contains(state.lastModalFocus)) state.lastModalFocus.focus();
    state.lastModalFocus = null;
  }

  function openModelMenu() {
    els.modelMenu.hidden = false; els.modelButton.setAttribute("aria-expanded","true"); renderModelOptions(els.modelSearch.value);
    setTimeout(() => els.modelSearch.focus(), 30);
  }
  function closeModelMenu() { els.modelMenu.hidden = true; els.modelButton.setAttribute("aria-expanded","false"); state.modelFocusIndex = -1; }
  function toggleModelMenu() { els.modelMenu.hidden ? openModelMenu() : closeModelMenu(); }

  function openDrawer() { els.sidebar.classList.add("open"); els.drawerOverlay.hidden = false; }
  function closeDrawer() { els.sidebar.classList.remove("open"); els.drawerOverlay.hidden = true; }

  function setStatus(type, text) {
    els.connectionStatus.className = `connection-status ${type}`;
    els.connectionStatus.querySelector("span:last-child").textContent = text;
  }

  function toggleGeneratingUI(generating) {
    els.stopBtn.hidden = !generating; els.sendBtn.hidden = generating;
    els.messageInput.disabled = generating;
    if (!generating) { els.messageInput.disabled = false; els.messageInput.focus(); }
  }

  function updateSendState() { els.sendBtn.disabled = !els.messageInput.value.trim() || state.streaming; }
  function resizeTextarea() { els.messageInput.style.height = "auto"; els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 210)}px`; }
  function updateCharCount() { els.charCount.textContent = `${els.messageInput.value.length.toLocaleString("id-ID")} / 50k`; }

  function isNearBottom() {
    const gap = els.chatScroll.scrollHeight - els.chatScroll.scrollTop - els.chatScroll.clientHeight;
    state.userNearBottom = gap < 100; return state.userNearBottom;
  }
  function scrollToBottom(smooth = true) {
    els.chatScroll.scrollTo({ top: els.chatScroll.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    els.scrollLatestBtn.hidden = true;
  }

  function applyTheme() {
    const theme = state.settings.theme;
    if (theme === "system") {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    } else document.documentElement.dataset.theme = theme;
  }

  function showToast(message, type = "info") {
    while (els.toastRegion.children.length >= 4) els.toastRegion.firstElementChild.remove();
    const toast = document.createElement("div"); toast.className = `toast ${type}`;
    const icon = document.createElement("span"); icon.className = "toast-icon"; icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : "i";
    const text = document.createElement("span"); text.textContent = message;
    const close = document.createElement("button"); close.type = "button"; close.setAttribute("aria-label","Tutup"); close.textContent = "×";
    close.addEventListener("click", () => toast.remove());
    toast.append(icon,text,close); els.toastRegion.append(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function bindEvents() {
    [els.newChatBtn, els.sidebarNewChat].forEach(b => b.addEventListener("click", () => createConversation()));
    els.settingsBtn.addEventListener("click", openSettings); els.headerSettingsBtn.addEventListener("click", openSettings);
    els.menuBtn.addEventListener("click", openDrawer); els.drawerOverlay.addEventListener("click", closeDrawer);
    els.historySearch.addEventListener("input", debounce(renderHistory, 140));
    els.clearAllBtn.addEventListener("click", () => openConfirm("Clear all chats", "Semua percakapan yang tersimpan di browser akan dihapus.", () => {
      if (state.streaming) stopGeneration(); state.conversations = []; createConversation(false); persistChats(); renderAll(); showToast("Semua percakapan dihapus.", "success");
    }, "Hapus semua"));

    els.historyList.addEventListener("click", e => {
      const main = e.target.closest("[data-chat-id]"); if (main) { if (state.streaming) stopGeneration(); state.activeId = main.dataset.chatId; const c=activeConversation(); state.selectedModel=c?.model||state.selectedModel; localStorage.setItem(STORAGE.selectedModel,state.selectedModel); renderAll(); closeDrawer(); return; }
      const menu = e.target.closest("[data-rename-id]"); if (menu) { e.stopPropagation(); renameConversation(menu.dataset.renameId); }
    });

    els.modelButton.addEventListener("click", toggleModelMenu);
    els.modelSearch.addEventListener("input", debounce(() => renderModelOptions(els.modelSearch.value), 100));
    els.modelOptions.addEventListener("click", e => { const b=e.target.closest("[data-model-id]"); if(b) setSelectedModel(b.dataset.modelId); });
    document.addEventListener("click", e => { if (!els.modelPicker.contains(e.target)) closeModelMenu(); });

    els.messageInput.addEventListener("input", () => { resizeTextarea(); updateCharCount(); updateSendState(); });
    els.messageInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && state.settings.enterToSend) { e.preventDefault(); els.composerForm.requestSubmit(); }
    });
    els.composerForm.addEventListener("submit", e => {
      e.preventDefault();
      const editId = els.messageInput.dataset.editId;
      if (editId) submitEdit(editId); else sendMessage();
    });
    els.stopBtn.addEventListener("click", stopGeneration);
    els.scrollLatestBtn.addEventListener("click", () => scrollToBottom(true));
    els.chatScroll.addEventListener("scroll", () => { const near=isNearBottom(); els.scrollLatestBtn.hidden=near; }, { passive: true });

    els.chatContent.addEventListener("click", e => {
      const suggestion = e.target.closest("[data-prompt]"); if (suggestion) { els.messageInput.value=suggestion.dataset.prompt; resizeTextarea(); updateCharCount(); updateSendState(); els.messageInput.focus(); return; }
      const action = e.target.closest("[data-action]"); if (action) {
        const id=action.dataset.messageId; const type=action.dataset.action;
        if(type==="copy") copyText(activeConversation()?.messages.find(m=>m.id===id)?.content||"");
        else if(type==="edit") editMessage(id);
        else if(type==="delete") deleteMessage(id);
        else if(type==="regenerate") regenerateLast();
        return;
      }
      const code = e.target.closest(".code-copy"); if(code) copyText(code.dataset.code || "", code);
    });

    els.modalClose.addEventListener("click", closeModal); els.modalBackdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (!els.modalRoot.hidden) closeModal();
        else if (!els.modelMenu.hidden) closeModelMenu();
        else closeDrawer();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); els.historySearch.focus(); }
      if (!els.modelMenu.hidden && ["ArrowDown","ArrowUp","Enter"].includes(e.key)) handleModelKeyboard(e);
    });
    window.addEventListener("resize", () => { resizeTextarea(); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if(state.settings.theme==="system") applyTheme(); });
  }

  function handleModelKeyboard(e) {
    const options = [...els.modelOptions.querySelectorAll("[data-model-id]")];
    if (!options.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); state.modelFocusIndex = (state.modelFocusIndex + 1) % options.length; }
    if (e.key === "ArrowUp") { e.preventDefault(); state.modelFocusIndex = (state.modelFocusIndex - 1 + options.length) % options.length; }
    if (e.key === "Enter" && state.modelFocusIndex >= 0) { e.preventDefault(); setSelectedModel(options[state.modelFocusIndex].dataset.modelId); return; }
    options.forEach((x,i)=>x.classList.toggle("focused", i===state.modelFocusIndex));
    options[state.modelFocusIndex]?.scrollIntoView({ block:"nearest" });
  }

  async function copyText(text, sourceButton = null) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      if (sourceButton) { const old=sourceButton.textContent; sourceButton.textContent="✓ Disalin"; setTimeout(()=>sourceButton.textContent=old,1200); }
      else showToast("Disalin.", "success");
    } catch { showToast("Gagal menyalin ke clipboard.", "error"); }
  }

  function debounce(fn, wait) {
    let timer; return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args),wait); };
  }

  loadState();
  bindEvents();
  renderAll();
  setStatus("ready","Ready");
})();
