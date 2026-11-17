import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "./ui/button"
import { useWorkflowstore } from "../store"

export default function Triggersheet() {
  const nodelist = useWorkflowstore((state) => state.nodelist)
  const nodes = useWorkflowstore((state) => state.nodes)

  const hasTrigger = nodes.some((n) => n.type === "trigger")
  const triggernodes = nodelist.filter((n: any) => n.type === "trigger")
  const availableTriggers =
    triggernodes.length > 0
      ? triggernodes
      : [
          {
            _id: "default-manual",
            label: "Manual Trigger",
            description: "Click to manually execute the workflow.",
          },
          {
            _id: "default-schedule",
            label: "Schedule Trigger",
            description: "Run workflow automatically on a recurring cron schedule.",
          },
        ]

  const actionnodes = nodelist.filter((n: any) => n.type === "action")
  const conditionnodes = nodelist.filter((n: any) => n.type === "condition")

  const addnode = useWorkflowstore((state) => state.addnodes)

  if (nodelist.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading nodes...</p>
  }

  return (
    <div>
      <Sheet>
        <SheetTrigger render={<Button variant="outline">Add Node</Button>} />
        <SheetContent className="overflow-auto px-4">
          <SheetHeader>
            <SheetTitle>Select Node</SheetTitle>
            <SheetDescription>Pick a node to build your workflow.</SheetDescription>
          </SheetHeader>

          <SheetHeader>
            <SheetTitle className="font-bold">Trigger Nodes</SheetTitle>
            <SheetDescription>
              Every workflow starts with one Trigger node (Manual or Scheduled).
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-2">
            {availableTriggers.map((t: any) => (
              <div
                key={t._id || t.label}
                className={`rounded-md border p-2 ${
                  hasTrigger
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-accent"
                }`}
                onClick={() => {
                  if (!hasTrigger) {
                    addnode("trigger", t.label)
                  }
                }}
              >
                <h4 className="font-medium">
                  {t.label}
                  {hasTrigger ? " (Canvas already has trigger)" : ""}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t.description || "Start workflow execution."}
                </p>
              </div>
            ))}
          </div>

          <SheetHeader>
            <SheetTitle className="font-bold">Action Nodes</SheetTitle>
            <SheetDescription>Pick an action node to add.</SheetDescription>
          </SheetHeader>

          <div className="space-y-2">
            {actionnodes.map((n: any) => (
              <div
                key={n._id}
                className="cursor-pointer rounded-md border p-2 hover:bg-accent"
                onClick={() => addnode("ordinary", n.label)}
              >
                <h4 className="font-medium">{n.label}</h4>
                <p className="text-xs text-muted-foreground">{n.description}</p>
              </div>
            ))}
          </div>

          {conditionnodes.length > 0 && (
            <>
              <SheetHeader>
                <SheetTitle className="font-bold">Conditional Nodes</SheetTitle>
                <SheetDescription>Pick a conditional node to add.</SheetDescription>
              </SheetHeader>

              <div className="space-y-2">
                {conditionnodes.map((n: any) => (
                  <div
                    key={n._id}
                    className="cursor-pointer rounded-md border p-2 hover:bg-accent"
                    onClick={() => addnode("ordinary", n.label)}
                  >
                    <h4 className="font-medium">{n.label}</h4>
                    <p className="text-xs text-muted-foreground">{n.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <SheetFooter>
            <SheetClose render={<Button variant="default">Close</Button>} />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
