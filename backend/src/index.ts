import express, { type NextFunction, type Request, type Response } from 'express'
import 'dotenv/config'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { userModel, nodeModel , workflowModel} from './db.js'
import Auth from './auth.js'
import { executeWorkflow, type ExecutionProgressEvent, type WorkflowEdge, type WorkflowNode } from './executor.js'
const app = express()

const allowedOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

app.use(express.json())
app.use(
    cors(
        allowedOrigins.length > 0
            ? { origin: allowedOrigins }
            : undefined
    )
)

app.get("/", (req,res)=>{
    res.send("server!!")
})

app.get("/health", (_req, res) => {
    res.json({ ok: true })
})

app.post('/signup', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
        res.json({ message: "Username and password are required", success: false })
        return
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        await userModel.create({ username, password: hashedPassword })
        res.json({ message: "signup successful", success: true })
    } catch (e: any) {
        res.json({ message: e.message, success: false })
    }

})


app.post('/login', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
        res.json({ message: "Username and password are required", success: false })
        return
    }
    try {
        const user = await userModel.findOne({ username })
        if (!user || !user.password) {
            res.json({ message: "Invalid username or password", success: false })
            return
        }

        const isHashed = user.password.startsWith('$2')
        const passwordValid = isHashed
            ? await bcrypt.compare(password, user.password)
            : user.password === password

        if (!passwordValid) {
            res.json({ message: "Invalid username or password", success: false })
            return
        }

        if (!isHashed) {
            user.password = await bcrypt.hash(password, 10)
            await user.save()
        }

        const token = jwt.sign({ id: user._id.toString() }, `${process.env.jwt_secret}`)
        res.json({ message: "login successful", token: token, username: user.username, success: true})
    } catch (e: any) {
        res.json({ message: e.message, success: false })
    }
})



app.get('/nodes', async (req,res)=>{
    try{
        const nodes = await nodeModel.find();
        if(!nodes){
            res.json({message:"error in getting all nodes", success:false})
            return
        }
        // Only expose a single Manual Trigger for trigger nodes
        let seenManualTrigger = false
        const filteredNodes = nodes.filter((n) => {
            if (n.type !== "trigger") return true
            if (!/manual/i.test(n.label ?? "") || seenManualTrigger) return false
            seenManualTrigger = true
            return true
        })
        if (!filteredNodes.some((n) => n.label === "Display Output")) {
            filteredNodes.push({
                _id: "builtin-display-output",
                type: "action",
                label: "Display Output",
                description: "Displays a configured value/template or the previous node's output directly on the node.",
            } as any)
        }
        res.json({message:"all nodes", success:true, nodelist:filteredNodes})
    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }

})

app.get('/workflows',Auth,  async (req,res)=>{
    const userID = req.id as string;
    try{
        const workflows = await workflowModel.find({userID:userID})
        if(!workflows){
            res.json({message:"not found any workflows", success:false});return 
        }
        res.json({message:"all workflows", success:true, workflows:workflows})
    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }
})

app.get('/workflows/:id', Auth, async (req,res)=>{
    const userID = req.id as string;
    const workflowId = String(req.params.id ?? '');
    if (!mongoose.isValidObjectId(workflowId)) {
        res.status(404).json({message:"workflow not found", success:false})
        return
    }
    try{
        const workflow = await workflowModel.findOne({ _id: workflowId, userID })
        if(!workflow){
            res.status(404).json({message:"workflow not found or unauthorized", success:false})
            return
        }
        res.json({message:"workflow fetched", success:true, workflow})
    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }
})


app.post('/workflows', Auth, async (req,res)=>{
    const userID = req.id as string
    const workflow = req.body
    try{
        const w = await workflowModel.create({
            userID,
            title: workflow.title || "New Workflow",
            nodes: workflow.nodes ?? [],
            edges: workflow.edges ?? []
        })
        res.json({message:"workflow saved !", success:true, workflow:w})

    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }
})

app.put('/workflows/:id', Auth, async (req,res)=>{
    const userID = req.id as string
    const workflowId = String(req.params.id ?? '')
    if (!mongoose.isValidObjectId(workflowId)) {
        res.status(404).json({message:"workflow not found", success:false})
        return
    }
    const workflow = req.body
    try{
        const updated = await workflowModel.findOneAndUpdate(
            { _id: workflowId, userID },
            {
                title: workflow.title || "New Workflow",
                nodes: workflow.nodes ?? [],
                edges: workflow.edges ?? []
            },
            { new: true }
        )
        if(!updated){
            res.status(404).json({message:"workflow not found or unauthorized", success:false})
            return
        }
        res.json({message:"workflow updated !", success:true, workflow:updated})
    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }
})

app.delete('/workflows/:id', Auth, async (req,res)=>{
    const userID = req.id as string
    const workflowId = String(req.params.id ?? '')
    if (!mongoose.isValidObjectId(workflowId)) {
        res.status(404).json({message:"workflow not found", success:false})
        return
    }
    try{
        const deleted = await workflowModel.findOneAndDelete({ _id: workflowId, userID })
        if(!deleted){
            res.status(404).json({message:"workflow not found or unauthorized", success:false})
            return
        }
        res.json({message:"workflow deleted !", success:true})
    }catch(e:any){
        console.error(e.message)
        res.status(500).json({message:e.message, success:false})
    }
})

function executeAuthGate(req: Request, res: Response, next: NextFunction) {
    const requireAuth =
        process.env.REQUIRE_AUTH_FOR_EXECUTE === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.REQUIRE_AUTH_FOR_EXECUTE !== 'false')
    if (requireAuth) {
        Auth(req, res, next)
        return
    }
    next()
}

app.post('/workflows/execute', executeAuthGate, async (req,res)=>{
    const { nodes, edges, input } = req.body as {
        nodes?: WorkflowNode[];
        edges?: WorkflowEdge[];
        input?: unknown;
    }
    const wantsStream =
        req.query.stream === '1' ||
        req.headers.accept?.includes('text/event-stream')

    if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders?.()

        const sendEvent = (event: ExecutionProgressEvent | { type: 'error'; message: string }) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`)
        }

        try {
            await executeWorkflow(nodes ?? [], edges ?? [], input ?? null, sendEvent)
        } catch (e: any) {
            sendEvent({ type: 'error', message: e.message || 'Execution failed' })
        } finally {
            res.end()
        }
        return
    }

    try{
        const result = await executeWorkflow(nodes ?? [], edges ?? [], input ?? null)
        res.json({ success: result.success, result })
    }catch(e:any){
        console.error(e.message)
        res.status(400).json({message:e.message, success:false})
    }
})

app.post('/workflows/:id/execute', Auth, async (req,res)=>{
    const userID = req.id as string
    const workflowId = String(req.params.id ?? '')
    if (!mongoose.isValidObjectId(workflowId)) {
        res.status(404).json({message:"workflow not found", success:false})
        return
    }
    try{
        const workflow = await workflowModel.findOne({ _id: workflowId, userID })
        if(!workflow){
            res.status(404).json({message:"workflow not found or unauthorized", success:false})
            return
        }
        const result = await executeWorkflow(
            (workflow.nodes as WorkflowNode[]) ?? [],
            (workflow.edges as WorkflowEdge[]) ?? [],
            req.body?.input ?? null
        )
        res.json({ success: result.success, result })
    }catch(e:any){
        console.error(e.message)
        res.status(400).json({message:e.message, success:false})
    }
})

const PORT = Number(process.env.PORT) || 8000
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
})
