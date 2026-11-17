import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react'
import { getDefaultConfig, type NodeExecutionState, type Nodedefine } from './lib/node-definitions'

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"

export function createManualTriggerNode(): Nodedefine {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `trigger-${Date.now()}`,
    type: "trigger",
    position: { x: 80, y: 180 },
    data: {
      label: "Manual Trigger",
      config: {},
      execution: { status: "idle" },
    },
  }
}

export interface ExecutionResultSummary {
  success: boolean;
  nodeResults: Record<string, { nodeId: string; label: string; status: "success" | "failed"; output?: unknown; error?: string }>;
  executionOrder: string[];
  finalOutput: unknown;
}

interface WorkflowState {
  nodelist: any[];
  nodes: Nodedefine[];
  edges: Edge[];
  workflowId: string | null;
  workflowTitle: string;
  selectedNodeId: string | null;
  open: boolean;
  isSaving: boolean;
  isRunning: boolean;
  statusMessage: { type: "success" | "error"; text: string } | null;
  token: string | null;
  username: string | null;

  setAuth: (token: string, username: string) => void;
  logout: () => void;
  fetchnodes: () => Promise<void>;
  addnodes: (cat: string, label: string) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, string>) => void;
  setWorkflowTitle: (title: string) => void;
  setStatusMessage: (msg: { type: "success" | "error"; text: string } | null) => void;
  saveWorkflow: () => Promise<{ id: string; message: string }>;
  loadWorkflow: (id: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  runWorkflow: () => Promise<ExecutionResultSummary | null>;
  clearcanvas: () => void;
  onNodesChange: (changes: NodeChange<Nodedefine>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (connection: Connection) => void;
  setSelectedNode: (node: Nodedefine | null) => void;
  closeSelectedNode: () => void;
}

function updateNodeExecution(
  nodes: Nodedefine[],
  nodeId: string,
  execution: NodeExecutionState
): Nodedefine[] {
  return nodes.map((n) =>
    n.id === nodeId ? { ...n, data: { ...n.data, execution } } : n
  )
}

export const useWorkflowstore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      nodelist: [],
      nodes: [createManualTriggerNode()],
      edges: [],
      workflowId: null,
      workflowTitle: "New Workflow",
      selectedNodeId: null,
      open: false,
      isSaving: false,
      isRunning: false,
      statusMessage: null,
      token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
      username: typeof window !== "undefined" ? localStorage.getItem("username") : null,

      setAuth: (token: string, username: string) => {
        localStorage.setItem("token", token)
        localStorage.setItem("username", username)
        set({ token, username })
      },

      logout: () => {
        localStorage.removeItem("token")
        localStorage.removeItem("username")
        set({ token: null, username: null })
      },

      fetchnodes: async () => {
        const response = await axios.get(`${API_BASE}/nodes`)
        set({
          nodelist: response.data.nodelist ?? []
        })
      },

      addnodes: (cat: string, label: string) => {
        const currentNodes = get().nodes
        if (cat === "trigger" && currentNodes.some((n) => n.type === "trigger")) {
          set({
            statusMessage: {
              type: "error",
              text: "Only one trigger node is allowed per workflow.",
            },
          })
          return
        }

        const initialConfig = getDefaultConfig(label)
        set((state) => ({
          nodes: [
            ...state.nodes,
            {
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
              type: cat,
              position: { x: 140 + state.nodes.length * 60, y: 120 + state.nodes.length * 30 },
              data: {
                config: initialConfig,
                label: label,
                execution: { status: "idle" },
              },
            }
          ]
        }))
      },

      updateNodeConfig: (nodeId: string, config: Record<string, string>) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    config: { ...config }
                  }
                }
              : node
          )
        }))
      },

      setWorkflowTitle: (title: string) => set({ workflowTitle: title }),

      setStatusMessage: (msg) => set({ statusMessage: msg }),

      saveWorkflow: async () => {
        const { nodes, edges, workflowId, workflowTitle } = get()
        const token = localStorage.getItem("token")
        if (!token) {
          throw new Error("No auth token found. Please log in before saving to the server.")
        }

        const cleanNodes = nodes.map((n) => ({
          ...n,
          data: {
            label: n.data.label,
            config: n.data.config ?? {},
          },
        }))

        set({ isSaving: true })
        try {
          const payload = {
            title: workflowTitle.trim() || "New Workflow",
            nodes: cleanNodes,
            edges,
          }
          const headers = { Authorization: `Bearer ${token}` }
          const response = workflowId
            ? await axios.put(`${API_BASE}/workflows/${workflowId}`, payload, { headers })
            : await axios.post(`${API_BASE}/workflows`, payload, { headers })

          if (response.data?.success === false) {
            throw new Error(response.data?.message || "Failed to save workflow")
          }

          const savedId = response.data?.workflow?._id ?? workflowId
          set({ workflowId: savedId ?? null })
          return {
            id: savedId,
            message: response.data?.message || "Workflow saved!",
          }
        } finally {
          set({ isSaving: false })
        }
      },

      loadWorkflow: async (id: string) => {
        const token = localStorage.getItem("token")
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const response = await axios.get(`${API_BASE}/workflows/${id}`, { headers })
        if (!response.data?.success || !response.data?.workflow) {
          throw new Error(response.data?.message || "Workflow not found")
        }
        const wf = response.data.workflow
        const loadedNodes: Nodedefine[] = Array.isArray(wf.nodes) ? wf.nodes : []
        set({
          workflowId: wf._id,
          workflowTitle: wf.title || "New Workflow",
          nodes: loadedNodes.length > 0 ? loadedNodes : [createManualTriggerNode()],
          edges: Array.isArray(wf.edges) ? wf.edges : [],
          selectedNodeId: null,
          open: false,
          statusMessage: null,
        })
      },

      deleteWorkflow: async (id: string) => {
        const token = get().token || localStorage.getItem("token")
        if (!token) {
          throw new Error("No auth token found. Please log in.")
        }
        await axios.delete(`${API_BASE}/workflows/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (get().workflowId === id) {
          get().clearcanvas()
        }
      },

      runWorkflow: async () => {
        const { nodes, edges, isRunning } = get()
        if (isRunning) return null

        const triggerNode = nodes.find((n) => n.type === "trigger")
        if (!triggerNode) {
          set({
            statusMessage: {
              type: "error",
              text: "Every workflow must have a Trigger node (Manual or Schedule).",
            },
          })
          return null
        }

        if (edges.length === 0) {
          set({
            statusMessage: {
              type: "error",
              text: "Connect the Trigger node to at least one node with an edge before running.",
            },
          })
          return null
        }

        // Mark nodes reachable from Trigger as pending; disconnected nodes stay idle
        const outgoing = new Map<string, string[]>()
        for (const edge of edges) {
          const list = outgoing.get(edge.source) ?? []
          list.push(edge.target)
          outgoing.set(edge.source, list)
        }
        const reachable = new Set<string>([triggerNode.id])
        const bfs = [triggerNode.id]
        while (bfs.length > 0) {
          const id = bfs.shift()!
          for (const next of outgoing.get(id) ?? []) {
            if (!reachable.has(next)) {
              reachable.add(next)
              bfs.push(next)
            }
          }
        }

        if (reachable.size <= 1) {
          set({
            statusMessage: {
              type: "error",
              text: "No nodes are connected downstream from the Trigger node.",
            },
          })
          return null
        }

        const sanitizedNodes = nodes.map((n) => ({
          id: n.id,
          type: n.type,
          data: {
            label: n.data.label,
            config: n.data.config ?? {},
          },
        }))

        set({
          isRunning: true,
          statusMessage: { type: "success", text: "Running workflow..." },
          nodes: nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              execution: { status: reachable.has(n.id) ? "pending" : "idle" },
            },
          })),
        })

        let finalResult: ExecutionResultSummary | null = null

        try {
          const token = get().token || localStorage.getItem("token")
          const response = await fetch(`${API_BASE}/workflows/execute?stream=1`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ nodes: sanitizedNodes, edges }),
          })

          if (!response.ok || !response.body) {
            const errText = await response.text()
            let errMessage = errText
            try {
              const parsed = JSON.parse(errText) as { message?: string }
              if (parsed?.message) errMessage = parsed.message
            } catch {
              // Keep raw error text
            }
            if (response.status === 401) {
              errMessage = "Please log in to execute workflows."
            }
            throw new Error(errMessage || `Execution failed (${response.status})`)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const chunks = buffer.split("\n\n")
            buffer = chunks.pop() ?? ""

            for (const chunk of chunks) {
              const dataLine = chunk
                .split("\n")
                .find((line) => line.startsWith("data:"))
              if (!dataLine) continue

              const event = JSON.parse(dataLine.slice(5).trim())
              if (event.type === "node_start") {
                set((state) => ({
                  nodes: updateNodeExecution(state.nodes, event.nodeId, {
                    status: "executing",
                  }),
                }))
              } else if (event.type === "node_success") {
                set((state) => ({
                  nodes: updateNodeExecution(state.nodes, event.nodeId, {
                    status: "success",
                    output: event.output,
                  }),
                }))
              } else if (event.type === "node_error") {
                set((state) => ({
                  nodes: updateNodeExecution(state.nodes, event.nodeId, {
                    status: "failed",
                    error: event.error,
                  }),
                }))
              } else if (event.type === "node_skipped") {
                set((state) => ({
                  nodes: updateNodeExecution(state.nodes, event.nodeId, {
                    status: "skipped",
                  }),
                }))
              } else if (event.type === "done") {
                finalResult = event.result as ExecutionResultSummary
              } else if (event.type === "error") {
                throw new Error(event.message || "Workflow execution failed")
              }
            }
          }

          if (finalResult) {
            if (finalResult.success) {
              set({
                statusMessage: {
                  type: "success",
                  text: `Workflow completed (${finalResult.executionOrder.length} nodes). Double-click any node to inspect its output.`,
                },
              })
            } else {
              const failed = Object.values(finalResult.nodeResults).find(
                (r) => r.status === "failed"
              )
              set({
                statusMessage: {
                  type: "error",
                  text: failed
                    ? `Node "${failed.label}" failed: ${failed.error}`
                    : "Workflow execution failed.",
                },
              })
            }
          }

          return finalResult
        } catch (err: any) {
          set({
            statusMessage: {
              type: "error",
              text: err?.message || "Failed to execute workflow",
            },
          })
          return null
        } finally {
          set({ isRunning: false })
        }
      },

      clearcanvas: () => {
        set({
          nodes: [createManualTriggerNode()],
          edges: [],
          workflowId: null,
          workflowTitle: "New Workflow",
          selectedNodeId: null,
          open: false,
          statusMessage: null,
        })
      },

      onNodesChange: (changes) =>
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes),
        })),

      onEdgesChange: (changes) =>
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
        })),

      onConnect: (connection) =>
        set((state) => ({
          edges: addEdge(connection, state.edges),
        })),

      setSelectedNode: (node) => {
        set({
          selectedNodeId: node?.id ?? null,
          open: Boolean(node),
        })
      },

      closeSelectedNode: () => {
        set({
          selectedNodeId: null,
          open: false,
        })
      },
    }),
    {
      name: "ai-workflow-storage",
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        workflowId: state.workflowId,
        workflowTitle: state.workflowTitle,
      }),
    }
  )
)
