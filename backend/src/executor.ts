import mongoose from 'mongoose'
import vm from 'node:vm'

export interface WorkflowNode {
    id: string;
    type: string;
    data: {
        label: string;
        config?: Record<string, string>;
    };
}

export interface WorkflowEdge {
    id?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

export interface NodeExecutionResult {
    nodeId: string;
    label: string;
    status: "success" | "failed" | "skipped";
    output?: unknown;
    error?: string;
}

export interface WorkflowExecutionResult {
    success: boolean;
    nodeResults: Record<string, NodeExecutionResult>;
    executionOrder: string[];
    finalOutput: unknown;
}

export type ExecutionProgressEvent =
    | { type: "node_start"; nodeId: string; label: string }
    | { type: "node_success"; nodeId: string; label: string; output: unknown }
    | { type: "node_skipped"; nodeId: string; label: string }
    | { type: "node_error"; nodeId: string; label: string; error: string }
    | { type: "done"; result: WorkflowExecutionResult };

type AbortSignalLike = unknown;

type AbortControllerLike = {
    signal: AbortSignalLike;
    abort: () => void;
};

type FetchResponseLike = {
    ok: boolean;
    status: number;
    statusText: string;
    text: () => Promise<string>;
};

type FetchLike = (
    url: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignalLike;
    }
) => Promise<FetchResponseLike>;

type GlobalRuntime = {
    fetch?: FetchLike;
    AbortController?: new () => AbortControllerLike;
    setTimeout?: (cb: () => void, ms: number) => unknown;
    clearTimeout?: (id: unknown) => void;
};

async function fetchWithTimeout(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    timeoutMs: number
): Promise<FetchResponseLike> {
    const rt = globalThis as unknown as GlobalRuntime;
    if (!rt.fetch) {
        throw new Error("Global fetch is not available in this Node runtime (requires Node 18+).");
    }

    const controller = rt.AbortController ? new rt.AbortController() : undefined;
    const timer =
        controller && rt.setTimeout
            ? rt.setTimeout(() => controller.abort(), timeoutMs)
            : undefined;

    try {
        return await rt.fetch(url, {
            ...init,
            ...(controller ? { signal: controller.signal } : {}),
        });
    } catch (err: unknown) {
        const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
        if (e?.name === "AbortError") {
            throw new Error(`Request to ${url} timed out after ${timeoutMs}ms.`);
        }
        const causeCode = e?.cause?.code ? `[${e.cause.code}] ` : "";
        const causeMsg = e?.cause?.message ? `: ${e.cause.message}` : "";
        throw new Error(`HTTP request to ${url} failed ${causeCode}(${e?.message || "network error"}${causeMsg})`);
    } finally {
        if (timer !== undefined && rt.clearTimeout) {
            rt.clearTimeout(timer);
        }
    }
}

function getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(".").filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
        if (current && typeof current === "object" && part in current) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }
    return current;
}

function interpolateTemplate(template: string, prevOutput: unknown): string {
    if (!template) return "";
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawKey: string) => {
        const key = rawKey.trim();
        if (key === "input" || key === "prev") {
            return typeof prevOutput === "string" ? prevOutput : JSON.stringify(prevOutput ?? "");
        }
        const normalizedKey = key.startsWith("prev.") ? key.slice(5) : key;
        if (typeof prevOutput === "string" && (normalizedKey === "reply" || key === "reply")) {
            return prevOutput;
        }
        const val = getNestedValue(prevOutput, normalizedKey);
        if (val === undefined) return "";
        return typeof val === "string" ? val : JSON.stringify(val);
    });
}

function extractReadableText(prevOutput: unknown): string {
    if (prevOutput === null || prevOutput === undefined) return "";
    if (typeof prevOutput === "string") return prevOutput;
    if (typeof prevOutput === "object") {
        const obj = prevOutput as Record<string, unknown>;
        if (typeof obj["reply"] === "string") return obj["reply"];
        if (typeof obj["text"] === "string") return obj["text"];
        if (typeof obj["display"] === "string") return obj["display"];
        if (Array.isArray(obj["sources"])) {
            return (obj["sources"] as Array<{ url?: string; content?: string }>)
                .map((s, i) => `Source ${i + 1} (${s.url}):\n${s.content}`)
                .join("\n\n");
        }
        if (obj["data"] !== undefined) {
            return typeof obj["data"] === "string" ? obj["data"] : JSON.stringify(obj["data"]);
        }
    }
    return JSON.stringify(prevOutput);
}

function safeParseJson(raw: string | undefined): Record<string, unknown> | undefined {
    if (!raw || !raw.trim()) return undefined;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function normalizeHttpUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
        throw new Error("HTTP Request node is missing a URL.");
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        return new URL(withProtocol).toString();
    } catch {
        throw new Error(`Invalid URL "${trimmed}". Please enter a valid http(s) URL.`);
    }
}

async function executeDatabaseQuery(
    config: Record<string, string>,
    prevOutput: unknown
): Promise<unknown> {
    const connectionString = interpolateTemplate(config["connectionString"] ?? "", prevOutput).trim();
    const collectionName = interpolateTemplate(config["collection"] ?? "", prevOutput).trim();
    const operation = (config["operation"] ?? "find").trim();
    const limitNum = Math.min(Math.max(Number(config["limit"] ?? "20") || 20, 1), 100);

    if (!collectionName) {
        throw new Error("Database Query node requires a collection name.");
    }

    const rawQuery = interpolateTemplate(config["query"] ?? "{}", prevOutput).trim() || "{}";
    let queryObj: Record<string, unknown>;
    try {
        const parsed = JSON.parse(rawQuery);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Query must be a JSON object.");
        }
        queryObj = parsed as Record<string, unknown>;
    } catch (err: unknown) {
        throw new Error(`Invalid Database Query JSON: ${err instanceof Error ? err.message : "parse error"}`);
    }

    let customConn: mongoose.Connection | null = null;
    try {
        if (!connectionString && process.env["ALLOW_APP_DB_QUERY"] !== "true") {
            throw new Error("Database Query node requires a connectionString.");
        }

        const conn = connectionString
            ? await mongoose
                  .createConnection(connectionString, { serverSelectionTimeoutMS: 5000 })
                  .asPromise()
            : mongoose.connection;

        if (connectionString) {
            customConn = conn;
        }

        const db = conn.db;
        if (!db) {
            throw new Error("Database connection is not ready yet.");
        }

        const collection = db.collection(collectionName);

        switch (operation) {
            case "find": {
                const records = await collection.find(queryObj).limit(limitNum).toArray();
                return { operation, collection: collectionName, count: records.length, records };
            }
            case "findOne": {
                const record = await collection.findOne(queryObj);
                return { operation, collection: collectionName, record };
            }
            case "countDocuments": {
                const count = await collection.countDocuments(queryObj);
                return { operation, collection: collectionName, count };
            }
            case "insertOne": {
                const res = await collection.insertOne(queryObj);
                return {
                    operation,
                    collection: collectionName,
                    acknowledged: res.acknowledged,
                    insertedId: res.insertedId,
                };
            }
            case "updateOne": {
                const rawUpdate = interpolateTemplate(config["update"] ?? "{}", prevOutput).trim() || "{}";
                const updateObj = JSON.parse(rawUpdate) as Record<string, unknown>;
                const res = await collection.updateOne(queryObj, updateObj);
                return {
                    operation,
                    collection: collectionName,
                    matchedCount: res.matchedCount,
                    modifiedCount: res.modifiedCount,
                };
            }
            case "deleteOne": {
                const res = await collection.deleteOne(queryObj);
                return {
                    operation,
                    collection: collectionName,
                    deletedCount: res.deletedCount,
                };
            }
            default:
                throw new Error(`Unsupported Database Query operation "${operation}".`);
        }
    } finally {
        if (customConn) {
            await customConn.close().catch(() => {});
        }
    }
}

function isValueEmpty(val: unknown): boolean {
    if (val === null || val === undefined) return true;
    if (typeof val === "string") return val.trim().length === 0;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === "object") return Object.keys(val).length === 0;
    return false;
}

function resolveFieldPath(raw: string | undefined, prevOutput: unknown): unknown {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return prevOutput;
    if (/\{\{[^}]+\}\}/.test(trimmed)) {
        return interpolateTemplate(trimmed, prevOutput);
    }
    return getNestedValue(prevOutput, trimmed);
}

function resolveFieldOrTemplate(raw: string | undefined, prevOutput: unknown): unknown {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return prevOutput;
    if (/\{\{[^}]+\}\}/.test(trimmed)) {
        return interpolateTemplate(trimmed, prevOutput);
    }
    if (prevOutput && typeof prevOutput === "object") {
        const nested = getNestedValue(prevOutput, trimmed);
        if (nested !== undefined) return nested;
    }
    return trimmed;
}

function evaluateConditionOperator(actual: unknown, operator: string, expectedRaw: string): boolean {
    const actualStr = actual === null || actual === undefined ? "" : typeof actual === "string" ? actual : JSON.stringify(actual);
    const actualNum = Number(actual);
    const expectedNum = Number(expectedRaw);

    switch (operator) {
        case "equals":
            return actualStr === expectedRaw || (!Number.isNaN(actualNum) && !Number.isNaN(expectedNum) && actualStr !== "" && expectedRaw !== "" && actualNum === expectedNum);
        case "not_equals":
            return !evaluateConditionOperator(actual, "equals", expectedRaw);
        case "contains":
            return actualStr.toLowerCase().includes(expectedRaw.toLowerCase());
        case "not_contains":
            return !actualStr.toLowerCase().includes(expectedRaw.toLowerCase());
        case "starts_with":
            return actualStr.startsWith(expectedRaw);
        case "ends_with":
            return actualStr.endsWith(expectedRaw);
        case "greater_than":
            return !Number.isNaN(actualNum) && !Number.isNaN(expectedNum) && actualNum > expectedNum;
        case "greater_or_equal":
            return !Number.isNaN(actualNum) && !Number.isNaN(expectedNum) && actualNum >= expectedNum;
        case "less_than":
            return !Number.isNaN(actualNum) && !Number.isNaN(expectedNum) && actualNum < expectedNum;
        case "less_or_equal":
            return !Number.isNaN(actualNum) && !Number.isNaN(expectedNum) && actualNum <= expectedNum;
        case "is_empty":
            return isValueEmpty(actual);
        case "is_not_empty":
            return !isValueEmpty(actual);
        case "regex": {
            try {
                return new RegExp(expectedRaw).test(actualStr);
            } catch {
                return false;
            }
        }
        default:
            return Boolean(actual);
    }
}

function executeSandboxedCode(codeStr: string, input: unknown): unknown {
    const sandbox = {
        input,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        console: {
            log: () => {},
            error: () => {},
            warn: () => {},
        },
    };
    const context = vm.createContext(sandbox);
    const wrapped = `(() => {
        ${codeStr}
    })()`;
    return vm.runInContext(wrapped, context, {
        timeout: 3000,
        displayErrors: true,
    });
}

interface NodeExecutionOutcome {
    output: unknown;
    activeHandles?: string[];
}

async function executeNode(
    node: WorkflowNode,
    prevOutput: unknown
): Promise<NodeExecutionOutcome> {
    const label = node.data?.label ?? "";
    const config = node.data?.config ?? {};

    if (node.type === "trigger" || /manual|schedule|cron/i.test(label)) {
        if (/schedule|cron/i.test(label)) {
            return {
                output: {
                    trigger: "schedule",
                    cron: config["expression"] || "0 * * * *",
                    triggeredAt: new Date().toISOString(),
                    input: prevOutput ?? null,
                },
            };
        }
        return {
            output: {
                trigger: "manual",
                triggeredAt: new Date().toISOString(),
                input: prevOutput ?? null,
            },
        };
    }

    if (label === "Text Formatter") {
        const operation = (config["operation"] ?? "template").trim();
        const rawInput = config["input"] ?? "";
        const sourceText = rawInput.trim()
            ? interpolateTemplate(rawInput, prevOutput)
            : extractReadableText(prevOutput);

        switch (operation) {
            case "uppercase":
                return { output: { operation, text: sourceText.toUpperCase() } };
            case "lowercase":
                return { output: { operation, text: sourceText.toLowerCase() } };
            case "trim":
                return { output: { operation, text: sourceText.trim() } };
            case "replace": {
                const find = config["find"] ?? "";
                const replaceWith = interpolateTemplate(config["replaceWith"] ?? "", prevOutput);
                const replaced = find ? sourceText.split(find).join(replaceWith) : sourceText;
                return { output: { operation, text: replaced } };
            }
            case "split": {
                const delimiter = config["find"] ?? ",";
                const items = sourceText.split(delimiter).map((s) => s.trim());
                return { output: { operation, items, count: items.length } };
            }
            case "extract_json": {
                const parsed = JSON.parse(sourceText);
                return { output: { operation, data: parsed } };
            }
            case "stringify": {
                return {
                    output: {
                        operation,
                        text: typeof prevOutput === "string" ? prevOutput : JSON.stringify(prevOutput, null, 2),
                    },
                };
            }
            case "template":
            default:
                return { output: { operation: "template", text: sourceText } };
        }
    }

    if (label === "HTTP Request") {
        const interpolatedUrl = interpolateTemplate(config["url"] ?? "", prevOutput);
        const url = normalizeHttpUrl(interpolatedUrl);
        const method = (config["method"] ?? "GET").toUpperCase();
        const parsedTimeout = Number(config["timeoutMs"] ?? "10000");
        const timeoutMs = Number.isNaN(parsedTimeout) || parsedTimeout <= 0 ? 10000 : parsedTimeout;

        const headersObj = safeParseJson(config["headers"]) ?? {};
        const headers: Record<string, string> = {
            Accept: "application/json, text/plain, */*",
            "User-Agent": "AI-Workflow-Runner/1.0",
        };
        for (const [k, v] of Object.entries(headersObj)) {
            headers[k] = interpolateTemplate(String(v), prevOutput);
        }

        const init: { method: string; headers: Record<string, string>; body?: string } = {
            method,
            headers,
        };

        if (!["GET", "HEAD"].includes(method) && config["body"]?.trim()) {
            init.body = interpolateTemplate(config["body"], prevOutput);
            if (!headers["Content-Type"] && !headers["content-type"]) {
                headers["Content-Type"] = "application/json";
            }
        }

        const res = await fetchWithTimeout(url, init, timeoutMs);
        const text = await res.text();
        let data: unknown = text;
        try {
            data = JSON.parse(text);
        } catch {
            // Keep plain text response if not JSON
        }

        if (!res.ok) {
            throw new Error(
                `HTTP ${res.status} ${res.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`
            );
        }

        return { output: { status: res.status, url, data } };
    }

    if (label === "Database Query") {
        return { output: await executeDatabaseQuery(config, prevOutput) };
    }

    if (label === "AI Chatbot") {
        const apikey = (config["apikey"] ?? "").trim();
        const rawProvider = (config["provider"] ?? "").trim().toLowerCase();
        const rawModel = (config["model"] ?? "").trim();
        const systemPrompt = interpolateTemplate(
            config["prompt"] ?? "You are a helpful assistant.",
            prevOutput
        );
        const parsedTemp = Number(config["temperature"] ?? "0.7");
        const temperature = Number.isNaN(parsedTemp) ? 0.7 : parsedTemp;

        if (!apikey) {
            throw new Error("AI Chatbot node is missing an API key.");
        }

        const provider =
            rawProvider === "groq" || rawProvider === "gemini"
                ? rawProvider
                : apikey.startsWith("gsk_") || (rawModel && !rawModel.toLowerCase().startsWith("gemini"))
                  ? "groq"
                  : "gemini";

        const userMessage =
            typeof prevOutput === "string"
                ? prevOutput
                : JSON.stringify(prevOutput ?? "Hello");

        if (provider === "groq") {
            const model = rawModel || "llama-3.3-70b-versatile";
            const res = await fetchWithTimeout(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apikey}`,
                    },
                    body: JSON.stringify({
                        model,
                        temperature,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userMessage },
                        ],
                    }),
                },
                30000
            );

            const text = await res.text();
            if (!res.ok) {
                throw new Error(`Groq AI error (${res.status}): ${text}`);
            }
            const parsed = JSON.parse(text) as {
                choices?: Array<{ message?: { content?: string } }>;
            };
            const reply = parsed.choices?.[0]?.message?.content ?? "";
            return { output: reply };
        }

        const model = rawModel || "gemini-2.5-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        const res = await fetchWithTimeout(
            geminiUrl,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apikey,
                },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: userMessage }] }],
                    generationConfig: { temperature },
                }),
            },
            30000
        );

        const text = await res.text();
        if (!res.ok) {
            throw new Error(`Gemini AI error (${res.status}): ${text}`);
        }
        const parsed = JSON.parse(text) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const reply =
            parsed.candidates?.[0]?.content?.parts
                ?.map((part) => part.text ?? "")
                .join("") ?? "";
        return { output: reply };
    }

    if (label === "Send Email") {
        const to = interpolateTemplate(config["to"] ?? "", prevOutput).trim();
        const from = interpolateTemplate(config["from"] ?? "", prevOutput).trim();
        const subject = interpolateTemplate(config["subject"] ?? "", prevOutput).trim();
        const message = interpolateTemplate(config["message"] ?? "", prevOutput);
        const resendApiKey = (config["apiKey"] ?? process.env["RESEND_API_KEY"] ?? "").trim();

        if (!to || !subject) {
            throw new Error("Send Email node requires 'to' and 'subject' fields.");
        }

        if (resendApiKey) {
            const sender = from || "Workflow <onboarding@resend.dev>";
            const res = await fetchWithTimeout(
                "https://api.resend.com/emails",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${resendApiKey}`,
                    },
                    body: JSON.stringify({
                        from: sender,
                        to: to.split(",").map((addr) => addr.trim()).filter(Boolean),
                        subject,
                        text: message,
                    }),
                },
                15000
            );
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`Email send failed (${res.status}): ${text}`);
            }
            const parsed = safeParseJson(text);
            return {
                output: {
                    queued: true,
                    simulated: false,
                    provider: "resend",
                    id: parsed?.["id"],
                    to,
                    from: sender,
                    subject,
                },
            };
        }

        return {
            output: {
                queued: false,
                simulated: true,
                to,
                from,
                subject,
                message,
                note: "Dry-run: provide a Resend API key in node config or RESEND_API_KEY env to send live emails.",
            },
        };
    }

    if (label === "Display Output") {
        const title = interpolateTemplate(config["title"] ?? "", prevOutput).trim();
        const source = (config["source"] ?? "auto").trim();
        const rawValue = config["value"] ?? "";

        let displayed: unknown;
        if (source === "prev") {
            displayed = prevOutput ?? null;
        } else if (source === "custom") {
            displayed = interpolateTemplate(rawValue, prevOutput);
        } else {
            displayed = rawValue.trim()
                ? interpolateTemplate(rawValue, prevOutput)
                : (prevOutput ?? null);
        }

        const display =
            typeof displayed === "string"
                ? displayed
                : JSON.stringify(displayed, null, 2);

        return {
            output: {
                ...(title ? { title } : {}),
                source,
                display,
                value: displayed,
            },
        };
    }

    if (label === "If / Else") {
        const operator = (config["operator"] ?? "is_not_empty").trim();
        const expectedValue = interpolateTemplate(config["value"] ?? "", prevOutput);
        const actualValue = resolveFieldPath(config["field"], prevOutput);
        const condition = evaluateConditionOperator(actualValue, operator, expectedValue);
        const branch = condition ? "true" : "false";
        return {
            output: {
                condition,
                branch,
                operator,
                actualValue,
                expectedValue,
                data: prevOutput,
            },
            activeHandles: [branch],
        };
    }

    if (label === "Compare Values") {
        const operator = (config["operator"] ?? "equals").trim();
        const leftValue = resolveFieldOrTemplate(config["leftValue"], prevOutput);
        const rightValue = interpolateTemplate(config["rightValue"] ?? "", prevOutput);
        const result = evaluateConditionOperator(leftValue, operator, rightValue);
        const branch = result ? "true" : "false";
        return {
            output: {
                result,
                branch,
                operator,
                leftValue,
                rightValue,
                data: prevOutput,
            },
            activeHandles: [branch],
        };
    }

    if (label === "Check Empty") {
        const mode = (config["mode"] ?? "is_empty").trim();
        const target = resolveFieldPath(config["field"], prevOutput);
        const empty = isValueEmpty(target);
        const result = mode === "is_not_empty" ? !empty : empty;
        const branch = result ? "true" : "false";
        return {
            output: {
                isEmpty: empty,
                mode,
                result,
                branch,
                data: prevOutput,
            },
            activeHandles: [branch],
        };
    }

    if (label === "Filter Data") {
        const arrayPath = (config["arrayPath"] ?? "").trim();
        const itemField = (config["field"] ?? "").trim();
        const operator = (config["operator"] ?? "equals").trim();
        const expectedValue = interpolateTemplate(config["value"] ?? "", prevOutput);

        let sourceList: unknown;
        if (arrayPath) {
            sourceList = getNestedValue(prevOutput, arrayPath);
        } else if (Array.isArray(prevOutput)) {
            sourceList = prevOutput;
        } else if (prevOutput && typeof prevOutput === "object") {
            const obj = prevOutput as Record<string, unknown>;
            sourceList = obj["records"] ?? obj["items"] ?? obj["data"];
        }

        if (!Array.isArray(sourceList)) {
            throw new Error("Filter Data node requires an input array (or records/items/data array).");
        }

        const records = sourceList.filter((item) => {
            const candidate = itemField && item && typeof item === "object"
                ? getNestedValue(item, itemField)
                : item;
            return evaluateConditionOperator(candidate, operator, expectedValue);
        });

        return {
            output: {
                total: sourceList.length,
                count: records.length,
                rejectedCount: sourceList.length - records.length,
                records,
            },
        };
    }

    if (label === "Switch") {
        const rawVal = resolveFieldOrTemplate(config["expression"], prevOutput);
        const valStr = rawVal === null || rawVal === undefined ? "" : typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal);

        const cases: Array<{ handle: string; match: string }> = [
            { handle: "case1", match: interpolateTemplate(config["case1"] ?? "", prevOutput).trim() },
            { handle: "case2", match: interpolateTemplate(config["case2"] ?? "", prevOutput).trim() },
            { handle: "case3", match: interpolateTemplate(config["case3"] ?? "", prevOutput).trim() },
        ];

        const matched = cases.find((c) => c.match !== "" && c.match === valStr.trim());
        const matchedCase = matched ? matched.handle : "default";

        return {
            output: {
                value: rawVal,
                matchedCase,
                data: prevOutput,
            },
            activeHandles: [matchedCase],
        };
    }

    if (label === "Web Search" || label === "Tavily Search") {
        const queryTemplate = (config["query"] ?? config["topic"] ?? "").trim();
        const searchQuery = queryTemplate
            ? interpolateTemplate(queryTemplate, prevOutput).trim()
            : extractReadableText(prevOutput).trim();

        if (!searchQuery) {
            throw new Error("Web Search node requires a search query or topic.");
        }

        const apiKey = (config["apiKey"] ?? config["apikey"] ?? process.env["TAVILY_API_KEY"] ?? "").trim();
        if (!apiKey) {
            throw new Error("Tavily API key is missing. Please provide it in node settings or set TAVILY_API_KEY in backend .env.");
        }

        const searchDepth = (config["searchDepth"] ?? "basic").trim();
        const parsedMax = Number(config["maxResults"] ?? "5");
        const maxResults = Number.isNaN(parsedMax) || parsedMax <= 0 ? 5 : Math.min(parsedMax, 20);

        const res = await fetchWithTimeout(
            "https://api.tavily.com/search",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: searchQuery,
                    search_depth: searchDepth,
                    max_results: maxResults,
                }),
            },
            25000
        );

        const text = await res.text();
        if (!res.ok) {
            throw new Error(`Tavily search failed (${res.status}): ${text}`);
        }

        const parsed = safeParseJson(text) as {
            results?: Array<{
                title?: string;
                url?: string;
                content?: string;
                score?: number;
            }>;
        } | undefined;

        const rawResults = parsed?.results ?? [];
        // Extract only sources (links) and their content fetched
        const sources = rawResults
            .map((item) => ({
                url: String(item.url ?? "").trim(),
                content: String(item.content ?? "").trim(),
            }))
            .filter((s) => s.url || s.content);

        const formattedDisplay = sources.length > 0
            ? sources.map((s, idx) => `[Source ${idx + 1}] ${s.url}\n${s.content}`).join("\n\n")
            : "No sources found.";

        return {
            output: {
                query: searchQuery,
                count: sources.length,
                sources,
                display: formattedDisplay,
                text: formattedDisplay,
            },
        };
    }

    if (label === "Telegram Bot" || label === "Telegram") {
        const botToken = (config["botToken"] ?? process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
        const chatId = interpolateTemplate(config["chatId"] ?? "", prevOutput).trim();
        const rawMessage = config["message"] ?? "";
        const messageText = rawMessage.trim()
            ? interpolateTemplate(rawMessage, prevOutput)
            : extractReadableText(prevOutput);
        const parseMode = (config["parseMode"] ?? "Markdown").trim();

        if (!botToken) {
            throw new Error("Telegram Bot node requires a Bot Token (or set TELEGRAM_BOT_TOKEN in backend .env).");
        }
        if (!chatId) {
            throw new Error("Telegram Bot node requires a Chat ID.");
        }
        if (!messageText) {
            throw new Error("Telegram Bot node has no message text to send.");
        }

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const payload: Record<string, unknown> = {
            chat_id: chatId,
            text: messageText,
        };
        if (parseMode && parseMode !== "None") {
            payload["parse_mode"] = parseMode;
        }

        const res = await fetchWithTimeout(
            telegramUrl,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
            15000
        );

        const text = await res.text();
        const parsed = safeParseJson(text);
        if (!res.ok || (parsed && parsed["ok"] === false)) {
            throw new Error(`Telegram send failed: ${text}`);
        }

        return {
            output: {
                success: true,
                chatId,
                messageId: (parsed?.["result"] as Record<string, unknown> | undefined)?.["message_id"],
                message: messageText,
            },
        };
    }

    if (label === "Notion") {
        const apiKey = (config["apiKey"] ?? process.env["NOTION_API_KEY"] ?? "").trim();
        const rawTargetId = interpolateTemplate(config["databaseId"] ?? config["pageId"] ?? "", prevOutput).trim();
        const title = interpolateTemplate(config["title"] ?? "Workflow Output", prevOutput).trim() || "Workflow Output";
        const rawContent = config["content"] ?? "";
        const contentText = rawContent.trim()
            ? interpolateTemplate(rawContent, prevOutput)
            : extractReadableText(prevOutput);

        if (!apiKey) {
            throw new Error("Notion node requires an API key / Integration Secret (or set NOTION_API_KEY in backend .env).");
        }
        if (!rawTargetId) {
            throw new Error("Notion node requires a Database ID or Page ID.");
        }

        let cleanId = rawTargetId;
        const urlMatch = rawTargetId.match(/([a-f0-9]{32}|[a-f0-9-]{36})/i);
        if (urlMatch) {
            cleanId = urlMatch[1]!;
        }

        const isDatabase = (config["targetType"] ?? "database") === "database";
        const parentPayload = isDatabase
            ? { database_id: cleanId }
            : { page_id: cleanId };

        const payload: Record<string, unknown> = {
            parent: parentPayload,
            properties: {
                title: [
                    {
                        type: "text",
                        text: { content: title.slice(0, 2000) },
                    },
                ],
            },
        };

        if (contentText.trim()) {
            payload["children"] = [
                {
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [
                            {
                                type: "text",
                                text: { content: contentText.slice(0, 2000) },
                            },
                        ],
                    },
                },
            ];
        }

        const res = await fetchWithTimeout(
            "https://api.notion.com/v1/pages",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
            20000
        );

        const text = await res.text();
        const parsed = safeParseJson(text);
        if (!res.ok) {
            throw new Error(`Notion API error (${res.status}): ${text}`);
        }

        return {
            output: {
                success: true,
                pageId: parsed?.["id"],
                url: parsed?.["url"],
                title,
            },
        };
    }

    if (label === "AI Extractor") {
        const apikey = (config["apikey"] ?? process.env["GEMINI_API_KEY"] ?? process.env["GROQ_API_KEY"] ?? "").trim();
        const rawProvider = (config["provider"] ?? "").trim().toLowerCase();
        const rawModel = (config["model"] ?? "").trim();
        const schemaGoal = interpolateTemplate(
            config["fields"] ?? "Extract main title, key points (array), summary, and sentiment",
            prevOutput
        );

        const rawInput = config["text"] ?? "";
        const sourceText = rawInput.trim()
            ? interpolateTemplate(rawInput, prevOutput)
            : extractReadableText(prevOutput);

        if (!apikey) {
            throw new Error("AI Extractor node requires an API key.");
        }
        if (!sourceText.trim()) {
            throw new Error("AI Extractor has no input text to process.");
        }

        const promptInstruction = `Extract the requested data from the provided text into valid JSON with fields: ${schemaGoal}. Respond with ONLY the raw JSON object, no markdown codeblocks, no explanations.`;

        const provider =
            rawProvider === "groq" || rawProvider === "gemini"
                ? rawProvider
                : apikey.startsWith("gsk_")
                  ? "groq"
                  : "gemini";

        let responseText = "";
        if (provider === "groq") {
            const model = rawModel || "llama-3.3-70b-versatile";
            const res = await fetchWithTimeout(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apikey}`,
                    },
                    body: JSON.stringify({
                        model,
                        response_format: { type: "json_object" },
                        messages: [
                            { role: "system", content: promptInstruction },
                            { role: "user", content: sourceText },
                        ],
                    }),
                },
                30000
            );
            const raw = await res.text();
            if (!res.ok) throw new Error(`Groq error (${res.status}): ${raw}`);
            const p = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
            responseText = p.choices?.[0]?.message?.content ?? "{}";
        } else {
            const model = rawModel || "gemini-2.5-flash";
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
            const res = await fetchWithTimeout(
                geminiUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apikey,
                    },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: promptInstruction }] },
                        contents: [{ role: "user", parts: [{ text: sourceText }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                        },
                    }),
                },
                30000
            );
            const raw = await res.text();
            if (!res.ok) throw new Error(`Gemini error (${res.status}): ${raw}`);
            const p = JSON.parse(raw) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            responseText = p.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "{}";
        }

        let parsedData: unknown = responseText;
        try {
            const cleaned = responseText.replace(/```json\s*|```/g, "").trim();
            parsedData = JSON.parse(cleaned);
        } catch {
            // Keep raw if parse fails
        }

        return {
            output: {
                extracted: parsedData,
                text: typeof parsedData === "string" ? parsedData : JSON.stringify(parsedData, null, 2),
                display: JSON.stringify(parsedData, null, 2),
            },
        };
    }

    if (label === "Data Extractor") {
        const extractType = (config["extractType"] ?? "urls").trim();
        const rawInput = config["input"] ?? "";
        const sourceText = rawInput.trim()
            ? interpolateTemplate(rawInput, prevOutput)
            : extractReadableText(prevOutput);

        let matches: string[] = [];
        switch (extractType) {
            case "urls": {
                const regex = /https?:\/\/[^\s"'<>)\]]+/gi;
                matches = sourceText.match(regex) || [];
                break;
            }
            case "emails": {
                const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                matches = sourceText.match(regex) || [];
                break;
            }
            case "numbers": {
                const regex = /-?\d+(?:\.\d+)?/g;
                matches = sourceText.match(regex) || [];
                break;
            }
            case "phones": {
                const regex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
                matches = sourceText.match(regex) || [];
                break;
            }
          
            case "regex": {
                //name regex -- [a-z]+(?: [a-z]+)+
                //flags --- gi
                const pattern = config["pattern"] ?? "";
                if (!pattern) throw new Error("Data Extractor requires a regex pattern.");
                const flags = config["flags"] ?? "g";
                const customReg = new RegExp(pattern, flags);
                matches = sourceText.match(customReg) || [];
                break;
            }
            default:
                matches = [];
        }

        const uniqueMatches = Array.from(new Set(matches));
        return {
            output: {
                extractType,
                count: uniqueMatches.length,
                matches: uniqueMatches,
                text: uniqueMatches.join("\n"),
                display: uniqueMatches.join("\n"),
            },
        };
    }

    if (label === "Code Runner") {
        const rawCode = config["code"] ?? "return input;";
        try {
            const outcome = executeSandboxedCode(rawCode, prevOutput);
            return {
                output: {
                    result: outcome,
                    display: typeof outcome === "string" ? outcome : JSON.stringify(outcome, null, 2),
                    text: typeof outcome === "string" ? outcome : JSON.stringify(outcome, null, 2),
                },
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Code Runner error: ${msg}`);
        }
    }

    if (label === "Delay") {
        const parsedDuration = Number(config["duration"] ?? "1");
        const duration = Number.isNaN(parsedDuration) || parsedDuration < 0 ? 1 : parsedDuration;
        const unit = (config["unit"] ?? "seconds").trim().toLowerCase();

        let ms = duration * 1000;
        if (unit === "milliseconds" || unit === "ms") {
            ms = duration;
        } else if (unit === "minutes" || unit === "m") {
            ms = duration * 60 * 1000;
        }

        // Cap delay to 5 minutes max for safety
        const cappedMs = Math.min(ms, 5 * 60 * 1000);
        await new Promise((resolve) => setTimeout(resolve, cappedMs));

        return {
            output: {
                delayedMs: cappedMs,
                data: prevOutput,
            },
        };
    }

    throw new Error(`Unknown node type/label: "${label}"`);
}

export async function executeWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    initialInput: unknown = null,
    onProgress?: (event: ExecutionProgressEvent) => void
): Promise<WorkflowExecutionResult> {
    if (nodes.length === 0) {
        throw new Error("Workflow has no nodes to execute.");
    }

    const triggerNodes = nodes.filter((n) => n.type === "trigger" || /manual|schedule|cron/i.test(n.data?.label ?? ""));
    if (triggerNodes.length === 0) {
        throw new Error("Every workflow must have a Trigger node (e.g. Manual Trigger or Schedule Trigger).");
    }
    const startNode = triggerNodes[0]!;

    const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
        if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
        const list = outgoingEdges.get(edge.source) ?? [];
        const duplicate = list.some(
            (e) => e.target === edge.target && (e.sourceHandle ?? null) === (edge.sourceHandle ?? null)
        );
        if (!duplicate) {
            list.push(edge);
        }
        outgoingEdges.set(edge.source, list);
    }

    const reachable = new Set<string>([startNode.id]);
    const bfsQueue: string[] = [startNode.id];
    while (bfsQueue.length > 0) {
        const id = bfsQueue.shift()!;
        for (const edge of outgoingEdges.get(id) ?? []) {
            if (!reachable.has(edge.target)) {
                reachable.add(edge.target);
                bfsQueue.push(edge.target);
            }
        }
    }

    if (reachable.size <= 1) {
        throw new Error("No edges connected from Trigger node. Connect at least one node with an edge to run.");
    }

    const remainingIncoming = new Map<string, number>();
    const activeIncomingCount = new Map<string, number>();
    const activeParents = new Map<string, string[]>();
    for (const id of reachable) {
        remainingIncoming.set(id, 0);
        activeIncomingCount.set(id, 0);
        activeParents.set(id, []);
    }
    for (const sourceId of reachable) {
        for (const edge of outgoingEdges.get(sourceId) ?? []) {
            if (!reachable.has(edge.target)) continue;
            remainingIncoming.set(edge.target, (remainingIncoming.get(edge.target) ?? 0) + 1);
        }
    }

    if ((remainingIncoming.get(startNode.id) ?? 0) > 0) {
        throw new Error("Cycle detected pointing back into the Trigger node.");
    }

    // Upfront cycle check across the reachable subgraph so conditional branch skips never look like cycles
    const topoInDegree = new Map(remainingIncoming);
    const topoQueue: string[] = [startNode.id];
    let topoVisited = 0;
    while (topoQueue.length > 0) {
        const id = topoQueue.shift()!;
        topoVisited += 1;
        for (const edge of outgoingEdges.get(id) ?? []) {
            if (!reachable.has(edge.target)) continue;
            const deg = (topoInDegree.get(edge.target) ?? 0) - 1;
            topoInDegree.set(edge.target, deg);
            if (deg === 0) {
                topoQueue.push(edge.target);
            }
        }
    }
    if (topoVisited < reachable.size) {
        throw new Error("Cycle detected in workflow graph; cannot execute cyclic edges.");
    }

    let currentWave: string[] = [startNode.id];
    const outputsByNodeId = new Map<string, unknown>();
    const nodeResults: Record<string, NodeExecutionResult> = {};
    const executionOrder: string[] = [];
    let finalOutput: unknown = null;

    const resolveEdgeTransition = (
        sourceId: string,
        edge: WorkflowEdge,
        isActive: boolean,
        nextWaveSet: Set<string>
    ) => {
        if (!reachable.has(edge.target)) return;
        const nextRemaining = (remainingIncoming.get(edge.target) ?? 0) - 1;
        remainingIncoming.set(edge.target, nextRemaining);

        if (isActive) {
            activeIncomingCount.set(edge.target, (activeIncomingCount.get(edge.target) ?? 0) + 1);
            const list = activeParents.get(edge.target) ?? [];
            if (!list.includes(sourceId)) {
                list.push(sourceId);
            }
            activeParents.set(edge.target, list);
        }

        if (nextRemaining === 0) {
            if ((activeIncomingCount.get(edge.target) ?? 0) > 0) {
                nextWaveSet.add(edge.target);
            } else {
                const skippedNode = nodeMap.get(edge.target);
                const skippedLabel = skippedNode?.data?.label ?? skippedNode?.type ?? edge.target;
                nodeResults[edge.target] = {
                    nodeId: edge.target,
                    label: skippedLabel,
                    status: "skipped",
                };
                onProgress?.({ type: "node_skipped", nodeId: edge.target, label: skippedLabel });
                for (const downstreamEdge of outgoingEdges.get(edge.target) ?? []) {
                    resolveEdgeTransition(edge.target, downstreamEdge, false, nextWaveSet);
                }
            }
        }
    };

    while (currentWave.length > 0) {
        const nextWaveSet = new Set<string>();
        let waveFailed = false;

        await Promise.all(
            currentWave.map(async (nodeId) => {
                const node = nodeMap.get(nodeId);
                if (!node) return;

                const label = node.data?.label ?? node.type;
                onProgress?.({ type: "node_start", nodeId: node.id, label });

                const parentIds = activeParents.get(node.id) ?? [];
                let nodeInput: unknown = initialInput;
                if (parentIds.length === 1) {
                    nodeInput = outputsByNodeId.get(parentIds[0]!);
                } else if (parentIds.length > 1) {
                    const merged: Record<string, unknown> = {};
                    for (const pId of parentIds) {
                        const pNode = nodeMap.get(pId);
                        const key = pNode?.data?.label ? `${pNode.data.label}_${pId}` : pId;
                        merged[key] = outputsByNodeId.get(pId);
                    }
                    nodeInput = merged;
                }

                executionOrder.push(node.id);

                try {
                    const outcome = await executeNode(node, nodeInput);
                    outputsByNodeId.set(node.id, outcome.output);
                    nodeResults[node.id] = {
                        nodeId: node.id,
                        label,
                        status: "success",
                        output: outcome.output,
                    };
                    finalOutput = outcome.output;
                    onProgress?.({ type: "node_success", nodeId: node.id, label, output: outcome.output });

                    for (const edge of outgoingEdges.get(node.id) ?? []) {
                        const isEdgeActive = outcome.activeHandles
                            ? edge.sourceHandle
                                ? outcome.activeHandles.includes(edge.sourceHandle)
                                : outcome.activeHandles.includes("true") || outcome.activeHandles.includes("default")
                            : true;
                        resolveEdgeTransition(node.id, edge, isEdgeActive, nextWaveSet);
                    }
                } catch (err: unknown) {
                    waveFailed = true;
                    const message = err instanceof Error ? err.message : "Node execution failed";
                    nodeResults[node.id] = {
                        nodeId: node.id,
                        label,
                        status: "failed",
                        error: message,
                    };
                    onProgress?.({ type: "node_error", nodeId: node.id, label, error: message });
                }
            })
        );

        if (waveFailed) {
            const failedResult: WorkflowExecutionResult = {
                success: false,
                nodeResults,
                executionOrder,
                finalOutput: null,
            };
            onProgress?.({ type: "done", result: failedResult });
            return failedResult;
        }

        currentWave = Array.from(nextWaveSet);
    }

    const result: WorkflowExecutionResult = {
        success: true,
        nodeResults,
        executionOrder,
        finalOutput,
    };
    onProgress?.({ type: "done", result });
    return result;
}
