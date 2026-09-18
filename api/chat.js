const API_KEYS = [
    process.env.XYRUS_API_KEY_1,
    process.env.XYRUS_API_KEY_2
].filter(Boolean);

const GATEWAY_URL = "https://ai.xyrusrouter.my.id/v1/chat/completions";
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);
const MAX_BODY_BYTES = 2_000_000;
const MAX_MESSAGES = 1000;
const MAX_CONTENT_CHARS = 50_000;
const REQUEST_TIMEOUT_MS = 85_000;

function json(res, status, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.end(JSON.stringify(body));
}

function safeErrorMessage(status) {
    const messages = {
        400: "Permintaan tidak valid.",
        401: "Autentikasi gateway ditolak.",
        403: "Akses ke gateway ditolak.",
        408: "Permintaan melewati batas waktu.",
        429: "Gateway sedang membatasi permintaan.",
        500: "Server AI mengalami kesalahan.",
        502: "Gateway AI bermasalah.",
        503: "Layanan AI sedang tidak tersedia.",
        504: "Gateway AI melewati batas waktu."
    };
    return messages[status] || "Terjadi kesalahan pada layanan AI.";
}

function isCredentialFailure(status) {
    return status === 401 || status === 403 || status === 429;
}

function validModel(model) {
    return typeof model === "string" &&
        /^xyrz\/[a-zA-Z0-9._-]+$/.test(model) &&
        model.length <= 160;
}

function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
        return "Format messages tidak valid.";
    }
    for (const message of messages) {
        if (!message || typeof message !== "object" || !ALLOWED_ROLES.has(message.role) ||
            typeof message.content !== "string" || message.content.length > MAX_CONTENT_CHARS) {
            return "Format messages tidak valid.";
        }
    }
    if (messages[0].role !== "system") return "System message wajib menjadi message pertama.";
    return null;
}

function bodySize(req) {
    const length = Number(req.headers["content-length"]);
    return Number.isFinite(length) ? length : 0;
}

async function readBody(req) {
    if (bodySize(req) > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === "object") return req.body;
        if (typeof req.body === "string") {
            if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
            return JSON.parse(req.body);
        }
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return null;
    return JSON.parse(raw);
}

function buildPayload(input, stream) {
    return {
        model: input.model,
        messages: input.messages.map(m => ({ role: m.role, content: m.content })),
        stream
    };
}

function makeHeaders(key) {
    return {
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
        "Authorization": `Bearer ${key}`
    };
}

async function fetchGateway(key, payload, signal) {
    return fetch(GATEWAY_URL, {
        method: "POST",
        headers: makeHeaders(key),
        body: JSON.stringify(payload),
        signal
    });
}

function timeoutSignal(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
}

function prepareSseHeaders(res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
}

async function pipeWebStream(res, response) {
    if (!response.body) return false;
    prepareSseHeaders(res);
    const reader = response.body.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
        }
        res.end();
        return true;
    } catch (error) {
        try { res.end(); } catch {}
        return true;
    } finally {
        try { reader.releaseLock(); } catch {}
    }
}

async function readGatewayJson(response) {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("INVALID_GATEWAY_JSON"); }
    return data;
}

function extractContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content.map(item => typeof item?.text === "string" ? item.text : "").join("");
    }
    return "";
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return json(res, 405, { error: "Method tidak diizinkan." });
    }

    if (API_KEYS.length === 0) {
        return json(res, 500, { error: "Server belum dikonfigurasi untuk layanan AI." });
    }

    let input;
    try {
        input = await readBody(req);
    } catch (error) {
        if (error.message === "PAYLOAD_TOO_LARGE") return json(res, 413, { error: "Request terlalu besar." });
        return json(res, 400, { error: "JSON request tidak valid." });
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return json(res, 400, { error: "Request tidak valid." });
    }
    if (!validModel(input.model)) return json(res, 400, { error: "Model tidak valid." });
    const messageError = validateMessages(input.messages);
    if (messageError) return json(res, 400, { error: messageError });
    if (input.stream !== true && input.stream !== false) {
        return json(res, 400, { error: "Parameter stream harus boolean." });
    }

    const requestedStream = input.stream === true;
    let lastStatus = 502;
    let streamResponse = null;

    for (let i = 0; i < API_KEYS.length && i < 2; i++) {
        const { controller, timer } = timeoutSignal(REQUEST_TIMEOUT_MS);
        try {
            const response = await fetchGateway(API_KEYS[i], buildPayload(input, requestedStream), controller.signal);
            clearTimeout(timer);
            lastStatus = response.status;

            if (response.ok) {
                if (requestedStream && (response.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
                    streamResponse = response;
                    break;
                }

                const data = await readGatewayJson(response);
                if (requestedStream) {
                    // Gateway ignored streaming. Return a normal OpenAI-compatible JSON response.
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                    res.setHeader("Cache-Control", "no-store");
                    res.setHeader("X-Content-Type-Options", "nosniff");
                    return res.end(JSON.stringify(data));
                }
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("X-Content-Type-Options", "nosniff");
                return res.end(JSON.stringify(data));
            }

            // Rotate only for credential/rate-limit failures. Other errors are returned
            // without spending another credential on the same request.
            if (!isCredentialFailure(response.status) || i === API_KEYS.length - 1) {
                return json(res, response.status >= 400 && response.status <= 599 ? response.status : 502, {
                    error: safeErrorMessage(response.status)
                });
            }
        } catch (error) {
            clearTimeout(timer);
            if (error?.name === "AbortError") {
                if (i === API_KEYS.length - 1) return json(res, 504, { error: safeErrorMessage(504) });
                // Timeout is not a credential failure; do not rotate to avoid duplicate work.
                return json(res, 504, { error: safeErrorMessage(504) });
            }
            if (i === API_KEYS.length - 1) return json(res, 502, { error: safeErrorMessage(502) });
            return json(res, 502, { error: safeErrorMessage(502) });
        }
    }

    if (streamResponse) {
        await pipeWebStream(res, streamResponse);
        return;
    }

    return json(res, lastStatus || 502, { error: safeErrorMessage(lastStatus || 502) });
};
