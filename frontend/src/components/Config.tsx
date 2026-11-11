import { useEffect, useState, type FormEvent } from "react"
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "./ui/button"
import { configSchema, getDefaultConfig, type Nodedefine } from "@/lib/node-definitions"
import { useWorkflowstore } from "@/store"

export function Config({
    open,
    onclose,
    node,
}: {
    open: boolean
    onclose: () => void
    node: Nodedefine | null
}) {
    const updateNodeConfig = useWorkflowstore((state) => state.updateNodeConfig)
    const [formValues, setFormValues] = useState<Record<string, string>>({})

    const schema = node?.data?.label ? configSchema[node.data.label] : undefined
    const execution = node?.data?.execution

    useEffect(() => {
        if (!open || !node) return
        const defaults = getDefaultConfig(node.data.label)
        const existingConfig = node.data?.config ?? {}
        const merged: Record<string, string> = { ...defaults }

        for (const [key, val] of Object.entries(existingConfig)) {
            if (val === undefined || val === null) continue
            merged[key] = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)
        }

        setFormValues(merged)
    }, [open, node])

    const handleChange = (key: string, value: string) => {
        setFormValues((prev) => ({
            ...prev,
            [key]: value,
        }))
    }

    const handleSave = (e: FormEvent) => {
        e.preventDefault()
        if (!node) return
        updateNodeConfig(node.id, formValues)
        onclose()
    }

    return (
        <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onclose() }}>
            <SheetContent className="overflow-auto px-4" side="right">
                <SheetHeader>
                    <SheetTitle className="font-bold">
                        {node?.data?.label ? `${node.data.label} Configurations` : "Configurations"}
                    </SheetTitle>
                    <SheetDescription>
                        Set node configurations and inspect execution output.
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSave} className="flex flex-1 flex-col">
                    {node && schema ? (
                        <div className="py-6 space-y-5">
                            {Object.entries(schema).map(([key, field]) => (
                                <div key={key} className="flex flex-col space-y-2">
                                    <label
                                        htmlFor={`config-${key}`}
                                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                    >
                                        {key}
                                    </label>

                                    {field.type === "input" && (
                                        <input
                                            id={`config-${key}`}
                                            type="text"
                                            value={formValues[key] ?? ""}
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            placeholder={field.placeholder ?? `Enter ${key}`}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                        />
                                    )}

                                    {field.type === "textarea" && (
                                        <textarea
                                            id={`config-${key}`}
                                            value={formValues[key] ?? ""}
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            placeholder={field.placeholder ?? `Enter ${key}`}
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        />
                                    )}

                                    {field.type === "select" && (
                                        <select
                                            id={`config-${key}`}
                                            value={formValues[key] ?? field.defaultValue ?? ""}
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                        >
                                            {field.options?.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="py-4 text-sm text-muted-foreground">
                            No configurable fields for this node.
                        </p>
                    )}

                    {execution && execution.status !== "idle" && (
                        <div className="mb-4 rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Last Execution
                                </span>
                                <span
                                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                                        execution.status === "success"
                                            ? "bg-green-100 text-green-800"
                                            : execution.status === "failed"
                                              ? "bg-red-100 text-red-800"
                                              : execution.status === "skipped"
                                                ? "bg-slate-200 text-slate-700"
                                                : "bg-blue-100 text-blue-800"
                                    }`}
                                >
                                    {execution.status}
                                </span>
                            </div>

                            {execution.status === "skipped" && (
                                <p className="text-xs text-muted-foreground">
                                    Skipped because an upstream condition routed to another branch.
                                </p>
                            )}

                            {execution.status === "failed" && execution.error && (
                                <div className="rounded bg-red-50 p-2 text-xs text-red-700 whitespace-pre-wrap break-words">
                                    {execution.error}
                                </div>
                            )}

                            {execution.status === "success" && (
                                <pre className="max-h-60 overflow-auto rounded bg-slate-950 p-2.5 text-xs text-slate-100 whitespace-pre-wrap break-words">
                                    {typeof execution.output === "string"
                                        ? execution.output
                                        : JSON.stringify(execution.output, null, 2)}
                                </pre>
                            )}

                            {execution.status === "executing" && (
                                <p className="text-xs text-blue-600">Executing node...</p>
                            )}
                        </div>
                    )}

                    <SheetFooter className="flex-row justify-end gap-2">
                        <SheetClose render={<Button type="button" variant="outline">Close</Button>} />
                        {schema && (
                            <Button type="submit" variant="default">
                                Save
                            </Button>
                        )}
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    )
}
