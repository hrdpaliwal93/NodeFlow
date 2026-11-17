import cron, { type ScheduledTask } from 'node-cron'
import { workflowModel } from './db.js'
import { executeWorkflow, type WorkflowEdge, type WorkflowNode } from './executor.js'

const activeCronTasks = new Map<string, ScheduledTask>()

export async function syncSingleWorkflow(workflowId: string): Promise<void> {
    const existingTask = activeCronTasks.get(workflowId)
    if (existingTask) {
        existingTask.stop()
        activeCronTasks.delete(workflowId)
    }

    try {
        const workflow = await workflowModel.findById(workflowId)
        if (!workflow) return

        const nodes = (workflow.nodes as WorkflowNode[]) ?? []
        const edges = (workflow.edges as WorkflowEdge[]) ?? []

        const scheduleNode = nodes.find(
            (n) => n.type === 'trigger' && /schedule|cron/i.test(n.data?.label ?? '')
        )
        if (!scheduleNode) return

        const config = scheduleNode.data?.config ?? {}
        const isEnabled = config['enabled'] !== 'false'
        if (!isEnabled) return

        const expression = (config['expression'] ?? '0 * * * *').trim()
        if (!cron.validate(expression)) {
            console.warn(`[Scheduler] Invalid cron expression "${expression}" for workflow ${workflowId}`)
            return
        }

        const task = cron.schedule(expression, async () => {
            console.log(`[Scheduler] Executing scheduled workflow "${workflow.title}" (${workflowId})`)
            try {
                const result = await executeWorkflow(nodes, edges, {
                    triggeredBy: 'cron',
                    scheduledTime: new Date().toISOString(),
                })
                console.log(`[Scheduler] Workflow "${workflow.title}" finished. Success: ${result.success}`)
            } catch (err: unknown) {
                console.error(`[Scheduler] Workflow "${workflow.title}" execution failed:`, err)
            }
        })

        activeCronTasks.set(workflowId, task)
        console.log(`[Scheduler] Scheduled workflow "${workflow.title}" (${workflowId}) with cron "${expression}"`)
    } catch (err) {
        console.error(`[Scheduler] Failed to sync cron for workflow ${workflowId}:`, err)
    }
}

export async function syncWorkflowCronJobs(): Promise<void> {
    for (const [id, task] of activeCronTasks.entries()) {
        task.stop()
    }
    activeCronTasks.clear()

    try {
        const workflows = await workflowModel.find()
        for (const wf of workflows) {
            await syncSingleWorkflow(wf._id.toString())
        }
        console.log(`[Scheduler] Cron synchronization complete. Active jobs: ${activeCronTasks.size}`)
    } catch (err) {
        console.error('[Scheduler] Error during cron synchronization:', err)
    }
}

export function stopAllCronJobs(): void {
    for (const [, task] of activeCronTasks.entries()) {
        task.stop()
    }
    activeCronTasks.clear()
}
