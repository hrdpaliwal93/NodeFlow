import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriggerNode, OrdinaryNode } from './CustomNode';
import Triggersheet from './Triggersheet';
import { Button } from './ui/button';
import { useWorkflowstore } from '@/store';
import { Config } from './Config';

const nodeTypes = {
  trigger: TriggerNode,
  ordinary: OrdinaryNode,
  condition: OrdinaryNode,
};

export default function Createworkflow() {
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchnodes = useWorkflowstore((state) => state.fetchnodes);
  const nodes = useWorkflowstore((state) => state.nodes);
  const edges = useWorkflowstore((state) => state.edges);
  const workflowId = useWorkflowstore((state) => state.workflowId);
  const workflowTitle = useWorkflowstore((state) => state.workflowTitle);
  const setWorkflowTitle = useWorkflowstore((state) => state.setWorkflowTitle);
  const selectedNodeId = useWorkflowstore((state) => state.selectedNodeId);
  const clearcanvas = useWorkflowstore((state) => state.clearcanvas);
  const onNodesChange = useWorkflowstore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowstore((state) => state.onEdgesChange);
  const onConnect = useWorkflowstore((state) => state.onConnect);
  const setSelectedNode = useWorkflowstore((state) => state.setSelectedNode);
  const closeSelectedNode = useWorkflowstore((state) => state.closeSelectedNode);
  const saveWorkflow = useWorkflowstore((state) => state.saveWorkflow);
  const loadWorkflow = useWorkflowstore((state) => state.loadWorkflow);
  const runWorkflow = useWorkflowstore((state) => state.runWorkflow);
  const isSaving = useWorkflowstore((state) => state.isSaving);
  const isRunning = useWorkflowstore((state) => state.isRunning);
  const statusMessage = useWorkflowstore((state) => state.statusMessage);
  const setStatusMessage = useWorkflowstore((state) => state.setStatusMessage);
  const open = useWorkflowstore((state) => state.open);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    fetchnodes().catch((err) => {
      console.error('Failed to fetch node definitions:', err);
    });
  }, [fetchnodes]);

  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl !== workflowId) {
      loadWorkflow(idFromUrl).catch((err) => {
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load workflow',
        });
      });
    }
  }, [searchParams, workflowId, loadWorkflow, setStatusMessage]);

  const handleSave = async () => {
    setStatusMessage(null);
    try {
      const result = await saveWorkflow();
      if (result.id) {
        setSearchParams({ id: result.id });
      }
      setStatusMessage({
        type: 'success',
        text: result.id ? `${result.message} (ID: ${result.id})` : result.message,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Failed to save workflow',
      });
    }
  };

  const handleClear = () => {
    clearcanvas();
    setSearchParams({});
  };

  return (
    <div className="flex h-[calc(100vh-65px)] w-screen flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2">
        <Triggersheet />

        <input
          type="text"
          value={workflowTitle}
          onChange={(e) => setWorkflowTitle(e.target.value)}
          placeholder="Workflow title"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        />

        <Button variant="default" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : workflowId ? 'Update Workflow' : 'Save Workflow'}
        </Button>

        <Button variant="secondary" onClick={() => void runWorkflow()} disabled={isRunning || nodes.length === 0}>
          {isRunning ? 'Running...' : 'Run Workflow'}
        </Button>

        <Button variant="outline" onClick={handleClear}>
          Clear Canvas
        </Button>

        {statusMessage && (
          <span
            className={`text-sm ${
              statusMessage.type === 'error' ? 'font-medium text-red-600' : 'text-green-600'
            }`}
          >
            {statusMessage.text}
          </span>
        )}
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onNodeDoubleClick={(_event, node) => setSelectedNode(node)}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      <Config node={selectedNode} open={open} onclose={closeSelectedNode} />
    </div>
  );
}
