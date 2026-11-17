import type { Node } from "@xyflow/react"

export type ConfigFieldType = "input" | "textarea" | "select";

export interface ConfigSelectOption {
    value: string;
    label: string;
}

export interface ConfigFieldSchema {
    type: ConfigFieldType;
    placeholder?: string;
    defaultValue: string;
    options?: ConfigSelectOption[];
}

export interface NodeExecutionState {
    status: "idle" | "pending" | "executing" | "success" | "failed" | "skipped";
    output?: unknown;
    error?: string;
}

export interface Nodedefine extends Node {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
        label: string;
        config?: Record<string, string>;
        execution?: NodeExecutionState;
    };
}

export const configSchema: Record<string, Record<string, ConfigFieldSchema>> = {
    "AI Chatbot": {
        provider: {
            type: "select",
            defaultValue: "gemini",
            options: [
                { value: "gemini", label: "Google Gemini" },
                { value: "groq", label: "Groq" },
            ],
        },
        prompt: {
            type: "input",
            placeholder: "Enter system prompt (supports {{prev}})",
            defaultValue: "you are a professional assistant, help me with the query",
        },
        apikey: {
            type: "input",
            placeholder: "Enter Gemini or Groq API key",
            defaultValue: "",
        },
        model: {
            type: "input",
            placeholder: "gemini-2.5-flash or llama-3.3-70b-versatile",
            defaultValue: "gemini-2.5-flash",
        },
        temperature: {
            type: "input",
            placeholder: "0.7",
            defaultValue: "0.7",
        },
    },
    "HTTP Request": {
        url: {
            type: "input",
            placeholder: "https://jsonplaceholder.typicode.com/todos/1",
            defaultValue: "",
        },
        method: {
            type: "select",
            defaultValue: "GET",
            options: [
                { value: "GET", label: "GET" },
                { value: "POST", label: "POST" },
                { value: "DELETE", label: "DELETE" },
                { value: "PUT", label: "PUT" },
                { value: "PATCH", label: "PATCH" },
            ],
        },
        headers: {
            type: "textarea",
            placeholder: '{"Authorization": "Bearer ..."}',
            defaultValue: "{}",
        },
        body: {
            type: "textarea",
            placeholder: '{"key": "value"}',
            defaultValue: "{}",
        },
        timeoutMs: {
            type: "input",
            placeholder: "10000",
            defaultValue: "10000",
        },
    },
    "Database Query": {
        connectionString: {
            type: "input",
            placeholder: "mongodb+srv://... (MongoDB connection URI)",
            defaultValue: "",
        },
        collection: {
            type: "input",
            placeholder: "e.g. nodes, workflows, users",
            defaultValue: "",
        },
        operation: {
            type: "select",
            defaultValue: "find",
            options: [
                { value: "find", label: "Find Many (find)" },
                { value: "findOne", label: "Find One (findOne)" },
                { value: "countDocuments", label: "Count Documents" },
                { value: "insertOne", label: "Insert One (insertOne)" },
                { value: "updateOne", label: "Update One (updateOne)" },
                { value: "deleteOne", label: "Delete One (deleteOne)" },
            ],
        },
        query: {
            type: "textarea",
            placeholder: '{"type": "action"} (or document JSON for insertOne)',
            defaultValue: "{}",
        },
        update: {
            type: "textarea",
            placeholder: '{"$set": {"status": "done"}} (used for updateOne)',
            defaultValue: "{}",
        },
        limit: {
            type: "input",
            placeholder: "20",
            defaultValue: "20",
        },
    },
    "Text Formatter": {
        operation: {
            type: "select",
            defaultValue: "template",
            options: [
                { value: "template", label: "Template / Interpolate ({{prev}})" },
                { value: "uppercase", label: "UPPERCASE" },
                { value: "lowercase", label: "lowercase" },
                { value: "trim", label: "Trim Whitespace" },
                { value: "replace", label: "Find & Replace" },
                { value: "split", label: "Split to List" },
                { value: "extract_json", label: "Parse JSON String" },
                { value: "stringify", label: "JSON Stringify" },
            ],
        },
        input: {
            type: "textarea",
            placeholder: "Text or {{prev.reply}} (leave empty to format previous node output)",
            defaultValue: "",
        },
        find: {
            type: "input",
            placeholder: "Text to find or split delimiter",
            defaultValue: "",
        },
        replaceWith: {
            type: "input",
            placeholder: "Replacement text (for Find & Replace)",
            defaultValue: "",
        },
    },
    "Send Email": {
        to: { type: "input", placeholder: "Recipient email", defaultValue: "" },
        from: { type: "input", placeholder: "Sender email", defaultValue: "" },
        subject: { type: "input", placeholder: "Email subject", defaultValue: "" },
        message: { type: "textarea", placeholder: "Email body (supports {{prev}})", defaultValue: "" },
        apiKey: {
            type: "input",
            placeholder: "Optional Resend API key (re_...) — leave blank for dry-run",
            defaultValue: "",
        },
    },
    "Display Output": {
        title: {
            type: "input",
            placeholder: "Optional heading (e.g. Final Result)",
            defaultValue: "",
        },
        source: {
            type: "select",
            defaultValue: "auto",
            options: [
                { value: "auto", label: "Auto (Use Value if set, else Previous Output)" },
                { value: "prev", label: "Previous Node Output" },
                { value: "custom", label: "Custom Value / Template ({{prev}})" },
            ],
        },
        value: {
            type: "textarea",
            placeholder: "Text or template like {{prev.reply}} (leave blank to show previous output)",
            defaultValue: "",
        },
    },
    "Web Search": {
        query: {
            type: "input",
            placeholder: "Search topic or query (supports {{prev}})",
            defaultValue: "",
        },
        apiKey: {
            type: "input",
            placeholder: "Tavily API key (tvly-...) — leave blank if set in backend .env",
            defaultValue: "",
        },
        searchDepth: {
            type: "select",
            defaultValue: "basic",
            options: [
                { value: "basic", label: "Basic Search (Faster)" },
                { value: "advanced", label: "Advanced Search (Deeper)" },
            ],
        },
        maxResults: {
            type: "input",
            placeholder: "5",
            defaultValue: "5",
        },
    },
    "If / Else": {
        field: {
            type: "input",
            placeholder: "Field path or template (e.g. status, data.ok, {{prev.reply}})",
            defaultValue: "",
        },
        operator: {
            type: "select",
            defaultValue: "is_not_empty",
            options: [
                { value: "is_not_empty", label: "Is Not Empty" },
                { value: "is_empty", label: "Is Empty" },
                { value: "equals", label: "Equals (==)" },
                { value: "not_equals", label: "Not Equals (!=)" },
                { value: "contains", label: "Contains" },
                { value: "not_contains", label: "Does Not Contain" },
                { value: "greater_than", label: "Greater Than (>)" },
                { value: "less_than", label: "Less Than (<)" },
                { value: "regex", label: "Matches Regex" },
            ],
        },
        value: {
            type: "input",
            placeholder: "Expected value to compare against",
            defaultValue: "",
        },
    },
    "Compare Values": {
        leftValue: {
            type: "input",
            placeholder: "Left value or field (e.g. {{prev.count}} or status)",
            defaultValue: "",
        },
        operator: {
            type: "select",
            defaultValue: "equals",
            options: [
                { value: "equals", label: "Equals" },
                { value: "not_equals", label: "Not Equals" },
                { value: "greater_than", label: "Greater Than (>)" },
                { value: "greater_or_equal", label: "Greater or Equal (>=)" },
                { value: "less_than", label: "Less Than (<)" },
                { value: "less_or_equal", label: "Less or Equal (<=)" },
                { value: "contains", label: "Contains" },
                { value: "starts_with", label: "Starts With" },
                { value: "ends_with", label: "Ends With" },
            ],
        },
        rightValue: {
            type: "input",
            placeholder: "Right value (supports {{prev}})",
            defaultValue: "",
        },
    },
    "Check Empty": {
        field: {
            type: "input",
            placeholder: "Field path or template (leave blank to check full input)",
            defaultValue: "",
        },
        mode: {
            type: "select",
            defaultValue: "is_empty",
            options: [
                { value: "is_empty", label: "True when Empty / Null" },
                { value: "is_not_empty", label: "True when Not Empty" },
            ],
        },
    },
    "Filter Data": {
        arrayPath: {
            type: "input",
            placeholder: "Array path (e.g. records, data, items — auto if blank)",
            defaultValue: "",
        },
        field: {
            type: "input",
            placeholder: "Item field to check (e.g. status; blank for primitives)",
            defaultValue: "",
        },
        operator: {
            type: "select",
            defaultValue: "equals",
            options: [
                { value: "equals", label: "Equals" },
                { value: "not_equals", label: "Not Equals" },
                { value: "contains", label: "Contains" },
                { value: "greater_than", label: "Greater Than (>)" },
                { value: "less_than", label: "Less Than (<)" },
                { value: "is_not_empty", label: "Is Not Empty" },
            ],
        },
        value: {
            type: "input",
            placeholder: "Value to match",
            defaultValue: "",
        },
    },
    "Switch": {
        expression: {
            type: "input",
            placeholder: "Value or field to switch on (e.g. {{prev.status}})",
            defaultValue: "",
        },
        case1: {
            type: "input",
            placeholder: "Match value for Case 1",
            defaultValue: "",
        },
        case2: {
            type: "input",
            placeholder: "Match value for Case 2",
            defaultValue: "",
        },
        case3: {
            type: "input",
            placeholder: "Match value for Case 3",
            defaultValue: "",
        },
    },
    "Schedule Trigger": {
        expression: {
            type: "input",
            placeholder: "0 * * * * (e.g. hourly: 0 * * * *, every 15m: */15 * * * *)",
            defaultValue: "0 * * * *",
        },
        enabled: {
            type: "select",
            defaultValue: "true",
            options: [
                { value: "true", label: "Enabled (Active Schedule)" },
                { value: "false", label: "Disabled (Paused)" },
            ],
        },
        description: {
            type: "input",
            placeholder: "Optional note (e.g. Run every morning at 9 AM)",
            defaultValue: "",
        },
    },
    "Telegram Bot": {
        botToken: {
            type: "input",
            placeholder: "123456:ABC-DEF... (or leave blank if set in backend .env)",
            defaultValue: "",
        },
        chatId: {
            type: "input",
            placeholder: "@channel_name or numeric chat ID (supports {{prev}})",
            defaultValue: "",
        },
        message: {
            type: "textarea",
            placeholder: "Message text or {{prev.display}} (supports {{prev}})",
            defaultValue: "",
        },
        parseMode: {
            type: "select",
            defaultValue: "Markdown",
            options: [
                { value: "Markdown", label: "Markdown" },
                { value: "HTML", label: "HTML" },
                { value: "None", label: "Plain Text (None)" },
            ],
        },
    },
    "Notion": {
        apiKey: {
            type: "input",
            placeholder: "secret_... or ntn_... Notion API key (or set in backend .env)",
            defaultValue: "",
        },
        targetType: {
            type: "select",
            defaultValue: "database",
            options: [
                { value: "database", label: "Database Item (database_id)" },
                { value: "page", label: "Subpage under Page (page_id)" },
            ],
        },
        databaseId: {
            type: "input",
            placeholder: "Database ID or Page ID (or paste Notion URL)",
            defaultValue: "",
        },
        title: {
            type: "input",
            placeholder: "Page title (supports {{prev}})",
            defaultValue: "Workflow Result",
        },
        content: {
            type: "textarea",
            placeholder: "Body text / paragraph blocks (supports {{prev}})",
            defaultValue: "",
        },
    },
    "AI Extractor": {
        provider: {
            type: "select",
            defaultValue: "gemini",
            options: [
                { value: "gemini", label: "Google Gemini" },
                { value: "groq", label: "Groq" },
            ],
        },
        apikey: {
            type: "input",
            placeholder: "Gemini or Groq API key",
            defaultValue: "",
        },
        model: {
            type: "input",
            placeholder: "gemini-2.5-flash or llama-3.3-70b-versatile",
            defaultValue: "gemini-2.5-flash",
        },
        fields: {
            type: "textarea",
            placeholder: "Fields to extract: e.g. title, summary, keyPoints (array), sentiment",
            defaultValue: "title, summary, keyPoints, sentiment",
        },
        text: {
            type: "textarea",
            placeholder: "Input text or {{prev.display}} (leave blank to use previous output)",
            defaultValue: "",
        },
    },
    "Data Extractor": {
        extractType: {
            type: "select",
            defaultValue: "urls",
            options: [
                { value: "urls", label: "Web URLs (http/https)" },
                { value: "emails", label: "Email Addresses" },
                { value: "numbers", label: "Numbers & Quantities" },
                { value: "phones", label: "Phone Numbers" },
               
                { value: "regex", label: "Custom Regex Pattern" },
            ],
        },
        pattern: {
            type: "input",
            placeholder: "e.g. \\b[A-Z]{3,}\\b (only used when Regex is selected)",
            defaultValue: "",
        },
        flags: {
            type: "input",
            placeholder: "g, i, m (default: g)",
            defaultValue: "g",
        },
        input: {
            type: "textarea",
            placeholder: "Source text (leave blank to extract from previous node output)",
            defaultValue: "",
        },
    },
    "Code Runner": {
        code: {
            type: "textarea",
            placeholder: "// Access 'input' (previous node output)\nreturn {\n  timestamp: new Date().toISOString(),\n  data: input\n};",
            defaultValue: "return {\n  timestamp: new Date().toISOString(),\n  data: input\n};",
        },
    },
    "Delay": {
        duration: {
            type: "input",
            placeholder: "e.g. 5",
            defaultValue: "5",
        },
        unit: {
            type: "select",
            defaultValue: "seconds",
            options: [
                { value: "seconds", label: "Seconds" },
                { value: "milliseconds", label: "Milliseconds" },
                { value: "minutes", label: "Minutes" },
            ],
        },
    },
};

export function getDefaultConfig(label: string): Record<string, string> {
    const schema = configSchema[label];
    if (!schema) return {};
    return Object.fromEntries(
        Object.entries(schema).map(([key, field]) => [key, field.defaultValue ?? ""])
    );
}
