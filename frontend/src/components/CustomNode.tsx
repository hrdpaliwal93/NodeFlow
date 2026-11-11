import { Position, Handle, type NodeProps } from '@xyflow/react';
import { Play, Loader2, CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';
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

    return (
        <div
            className={`min-w-[180px] rounded-lg border-2 px-3 py-2 text-sm shadow-sm transition-colors ${getStatusStyles(
                execution?.status
            )}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{data.label}</span>
                <StatusBadge execution={execution} />
            </div>

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
                {execution?.status === 'executing' ? 'Executing...' : 'Trigger Workflow'}
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

export function OrdinaryNode({ data }: NodeProps<Nodedefine>) {
    const execution = data.execution;
    const isBooleanBranch = BOOLEAN_BRANCH_NODES.has(data.label);
    const isSwitch = data.label === "Switch";
    const isDisplay = data.label === "Display Output";
    const displayPreview = isDisplay ? getDisplayPreview(data.config, execution) : null;

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
