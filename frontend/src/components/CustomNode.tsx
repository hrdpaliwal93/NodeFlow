import { Position, Handle, type NodeProps } from '@xyflow/react';
import { Play, Loader2, CheckCircle2, XCircle, Clock, MinusCircle, Search, ExternalLink, Send, Database, Sparkles, Filter, Code2, Hourglass, Bot } from 'lucide-react';
import { type NodeExecutionState, type Nodedefine } from '@/lib/node-definitions';
import { useWorkflowstore } from '@/store';

function getStatusStyles(status?: NodeExecutionState['status']) {
    switch (status) {
        case 'executing':
            return 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-300';
        case 'pending':
            return 'border-amber-400 bg-amber-50/50';
        case 'success':
            return 'border-green-500 bg-green-50/70';
        case 'failed':
            return 'border-red-500 bg-red-50/80 ring-2 ring-red-200';
        case 'skipped':
            return 'border-slate-300 border-dashed bg-slate-100/70 opacity-75';
        default:
            return 'border-slate-300 bg-white';
    }
}

function StatusBadge({ execution }: { execution?: NodeExecutionState }) {
    const status = execution?.status;
    if (!status || status === 'idle') return null;

    if (status === 'pending') {
        return (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                <Clock className="h-3 w-3" /> Queued
            </span>
        );
    }
    if (status === 'executing') {
        return (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                <Loader2 className="h-3 w-3 animate-spin" /> Running
            </span>
        );
    }
    if (status === 'success') {
        return (
            <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                <CheckCircle2 className="h-3 w-3" /> Done
            </span>
        );
    }
    if (status === 'skipped') {
        return (
            <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                <MinusCircle className="h-3 w-3" /> Skipped
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
            <XCircle className="h-3 w-3" /> Failed
        </span>
    );
}

export function TriggerNode({ data }: NodeProps<Nodedefine>) {
    const runWorkflow = useWorkflowstore((state) => state.runWorkflow);
    const isRunning = useWorkflowstore((state) => state.isRunning);
    const execution = data.execution;
    const isSchedule = /schedule|cron/i.test(data.label);
    const cronExpr = data.config?.expression || '0 * * * *';
    const isEnabled = data.config?.enabled !== 'false';

    return (
        <div
            className={`min-w-[185px] rounded-lg border-2 px-3 py-2 text-sm shadow-sm transition-colors ${getStatusStyles(
                execution?.status
            )}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{data.label}</span>
                <StatusBadge execution={execution} />
            </div>

            {isSchedule && (
                <div className="mt-2 flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-[11px] font-mono text-slate-700">
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>{cronExpr}</span>
                    </span>
                    <span className={`text-[10px] font-sans font-medium ${isEnabled ? 'text-green-700' : 'text-slate-400'}`}>
                        {isEnabled ? 'Active' : 'Paused'}
                    </span>
                </div>
            )}

            <button
                type="button"
                disabled={isRunning}
                onClick={(e) => {
                    e.stopPropagation();
                    void runWorkflow();
                }}
                className="nodrag mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {execution?.status === 'executing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <Play className="h-3.5 w-3.5" />
                )}
                {execution?.status === 'executing' ? 'Executing...' : isSchedule ? 'Run Now' : 'Trigger Workflow'}
            </button>

            {execution?.status === 'failed' && execution.error && (
                <p className="mt-1.5 max-w-[200px] truncate text-[11px] text-red-600" title={execution.error}>
                    {execution.error}
                </p>
            )}

            <Handle type="source" position={Position.Right} />
        </div>
    );
}

const BOOLEAN_BRANCH_NODES = new Set(["If / Else", "Compare Values", "Check Empty"]);

function getDisplayPreview(
    config: Record<string, string> | undefined,
    execution: NodeExecutionState | undefined
): { title?: string; text: string; isLive: boolean } {
    if (execution?.status === 'success' && execution.output !== undefined) {
        const out = execution.output;
        if (out && typeof out === 'object') {
            const obj = out as Record<string, unknown>;
            const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title : undefined;
            const text =
                typeof obj.display === 'string'
                    ? obj.display
                    : JSON.stringify(obj.value ?? out, null, 2);
            return { title, text, isLive: true };
        }
        return {
            title: config?.title?.trim() || undefined,
            text: typeof out === 'string' ? out : JSON.stringify(out, null, 2),
            isLive: true,
        };
    }

    const source = config?.source ?? 'auto';
    const configured = config?.value ?? '';
    const title = config?.title?.trim() || undefined;
    if (source !== 'prev' && configured.trim()) {
        return { title, text: configured, isLive: false };
    }
    return { title, text: 'Waiting for workflow output...', isLive: false };
}

export function OrdinaryNode({ id, data }: NodeProps<Nodedefine>) {
    const execution = data.execution;
    const isBooleanBranch = BOOLEAN_BRANCH_NODES.has(data.label);
    const isSwitch = data.label === "Switch";
    const isDisplay = data.label === "Display Output";
    const isWebSearch = data.label === "Web Search";
    const updateNodeConfig = useWorkflowstore((state) => state.updateNodeConfig);
    const displayPreview = isDisplay ? getDisplayPreview(data.config, execution) : null;

    const webSearchOutput =
        isWebSearch && execution?.status === 'success' && execution.output && typeof execution.output === 'object'
            ? (execution.output as {
                  query?: string;
                  count?: number;
                  sources?: Array<{ url: string; content: string }>;
              })
            : null;

    return (
        <div
            className={`min-w-[175px] rounded-lg border-2 px-3 py-2 text-sm shadow-sm transition-colors ${getStatusStyles(
                execution?.status
            )}`}
        >
            <Handle type="target" position={Position.Left} />
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{data.label}</span>
                <StatusBadge execution={execution} />
            </div>

            {displayPreview && (
                <div className="nodrag nowheel mt-2 max-w-[260px]">
                    {displayPreview.title && (
                        <div className="mb-1 text-[11px] font-semibold text-slate-700">
                            {displayPreview.title}
                        </div>
                    )}
                    <pre
                        className={`max-h-36 overflow-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap break-words ${
                            displayPreview.isLive
                                ? 'bg-slate-900 text-slate-100'
                                : 'border border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                    >
                        {displayPreview.text}
                    </pre>
                </div>
            )}

            {isWebSearch && (
                <div className="nodrag nowheel mt-2 max-w-[280px]">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                            <Search className="h-3 w-3 text-slate-500" />
                            <span>Topic to Search</span>
                        </span>
                        {webSearchOutput?.sources && (
                            <span className="text-[10px] font-normal text-slate-500">
                                {webSearchOutput.sources.length} sources
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        placeholder="Enter topic to search..."
                        value={data.config?.query ?? ""}
                        onChange={(e) => {
                            updateNodeConfig(id, { ...(data.config ?? {}), query: e.target.value });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="nodrag h-7 w-full rounded border border-slate-300 bg-slate-50 px-2 text-[11px] text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />

                    {webSearchOutput?.sources && webSearchOutput.sources.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Fetched Sources & Content
                            </div>
                            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-1.5 text-xs">
                                {webSearchOutput.sources.map((source, idx) => (
                                    <div
                                        key={idx}
                                        className="rounded border border-slate-200 bg-white p-1.5 shadow-xs"
                                    >
                                        <a
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline break-all"
                                        >
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{source.url}</span>
                                        </a>
                                        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-600 whitespace-pre-wrap break-words">
                                            {source.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {data.label === "AI Chatbot" && (
                <div className="nodrag nowheel mt-2 max-w-[260px]">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3 text-purple-600" />
                            <span>AI Response</span>
                        </span>
                        <span className="text-[10px] font-normal text-slate-400 capitalize">
                            {data.config?.provider || 'gemini'}
                        </span>
                    </div>
                    {execution?.status === 'success' && execution.output !== undefined ? (
                        <pre className="max-h-36 overflow-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-100 whitespace-pre-wrap break-words">
                            {typeof execution.output === 'string'
                                ? execution.output
                                : (execution.output as any)?.reply ?? JSON.stringify(execution.output, null, 2)}
                        </pre>
                    ) : (
                        <p className="text-[10px] text-slate-500 italic truncate" title={data.config?.prompt}>
                            {data.config?.prompt ? `Prompt: ${data.config.prompt}` : 'Waiting for workflow run...'}
                        </p>
                    )}
                </div>
            )}

            {data.label === "Delay" && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 border border-amber-200">
                    <Hourglass className="h-3 w-3 text-amber-600" />
                    <span>Delay: {data.config?.duration || '5'} {data.config?.unit || 'seconds'}</span>
                </div>
            )}

            {data.label === "Telegram Bot" && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-sky-50 px-2 py-1 text-[11px] text-sky-900 border border-sky-200">
                    <Send className="h-3 w-3 text-sky-600 shrink-0" />
                    <span className="truncate">Chat: {data.config?.chatId || 'Set chatId'}</span>
                </div>
            )}

            {data.label === "Notion" && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-800 border border-slate-200">
                    <Database className="h-3 w-3 text-slate-600 shrink-0" />
                    <span className="truncate">{data.config?.title || 'Notion Page'}</span>
                </div>
            )}

            {data.label === "Code Runner" && (
                <div className="nodrag nowheel mt-2 max-w-[260px]">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                        <Code2 className="h-3 w-3 text-slate-500" />
                        <span>JavaScript Code</span>
                    </div>
                    {execution?.status === 'success' && execution.output !== undefined ? (
                        <pre className="max-h-28 overflow-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-emerald-300 whitespace-pre-wrap break-words">
                            {typeof (execution.output as any)?.result === 'object'
                                ? JSON.stringify((execution.output as any)?.result, null, 2)
                                : String((execution.output as any)?.result ?? '')}
                        </pre>
                    ) : (
                        <pre className="max-h-20 overflow-hidden rounded border border-slate-200 bg-slate-50 p-1.5 font-mono text-[10px] text-slate-600 line-clamp-3">
                            {data.config?.code || 'return input;'}
                        </pre>
                    )}
                </div>
            )}

            {data.label === "AI Extractor" && (
                <div className="nodrag nowheel mt-2 max-w-[260px]">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                        <Sparkles className="h-3 w-3 text-indigo-500" />
                        <span>Extracted JSON</span>
                    </div>
                    {execution?.status === 'success' && execution.output !== undefined ? (
                        <pre className="max-h-32 overflow-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-indigo-200 whitespace-pre-wrap break-words">
                            {typeof (execution.output as any)?.extracted === 'object'
                                ? JSON.stringify((execution.output as any)?.extracted, null, 2)
                                : String((execution.output as any)?.extracted ?? '')}
                        </pre>
                    ) : (
                        <p className="text-[10px] text-slate-500 italic truncate">
                            Fields: {data.config?.fields || 'title, summary, keyPoints'}
                        </p>
                    )}
                </div>
            )}

            {data.label === "Data Extractor" && (
                <div className="nodrag nowheel mt-2 max-w-[260px]">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                            <Filter className="h-3 w-3 text-slate-500" />
                            <span className="capitalize">{data.config?.extractType || 'URLs'}</span>
                        </span>
                        {execution?.status === 'success' && (
                            <span className="text-[10px] text-slate-500 font-normal">
                                {(execution.output as any)?.count ?? 0} found
                            </span>
                        )}
                    </div>
                    {execution?.status === 'success' && Array.isArray((execution.output as any)?.matches) ? (
                        <div className="max-h-24 overflow-y-auto space-y-1 rounded border border-slate-200 bg-slate-50 p-1.5 text-[10px]">
                            {((execution.output as any).matches as string[]).slice(0, 8).map((m, i) => (
                                <div key={i} className="truncate font-mono text-slate-700">{m}</div>
                            ))}
                            {((execution.output as any).matches as string[]).length > 8 && (
                                <div className="text-[9px] text-slate-400">+{((execution.output as any).matches.length - 8)} more</div>
                            )}
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-500 italic">
                            Extracts {data.config?.extractType || 'urls'} from input
                        </p>
                    )}
                </div>
            )}

            {isBooleanBranch && (
                <div className="mt-2 flex flex-col items-end gap-1.5 pr-1 text-[10px] font-semibold">
                    <span className="text-green-700">True</span>
                    <span className="text-red-600">False</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="true"
                        style={{ top: '58%', background: '#16a34a' }}
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="false"
                        style={{ top: '82%', background: '#dc2626' }}
                    />
                </div>
            )}

            {isSwitch && (
                <div className="mt-2 flex flex-col items-end gap-1 pr-1 text-[10px] font-semibold text-slate-600">
                    <span>Case 1</span>
                    <span>Case 2</span>
                    <span>Case 3</span>
                    <span>Default</span>
                    <Handle type="source" position={Position.Right} id="case1" style={{ top: '42%' }} />
                    <Handle type="source" position={Position.Right} id="case2" style={{ top: '58%' }} />
                    <Handle type="source" position={Position.Right} id="case3" style={{ top: '74%' }} />
                    <Handle type="source" position={Position.Right} id="default" style={{ top: '90%' }} />
                </div>
            )}

            {execution?.status === 'failed' && execution.error && (
                <p className="mt-1 max-w-[190px] truncate text-[11px] text-red-600" title={execution.error}>
                    {execution.error}
                </p>
            )}

            {!isBooleanBranch && !isSwitch && <Handle type="source" position={Position.Right} />}
        </div>
    );
}
