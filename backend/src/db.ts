import 'dotenv/config'
import mongoose, { Schema } from 'mongoose'

const mongoUri = process.env.MONGO_URI
if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is required")
}
mongoose.connect(mongoUri).then(() => console.log("db connected!")).catch((e) => console.error(e.message))

const workflowSchema = new mongoose.Schema({
    userID :{type:mongoose.Schema.Types.ObjectId, ref:"User"},
    title: { type: String, default: "New Workflow" },
    nodes: {type:[Schema.Types.Mixed], default:[]},
    edges: {type:[Schema.Types.Mixed], default:[]},
   
},{timestamps:true})


const userSchema = new mongoose.Schema({
    username: { type: String, unique:true },
    password: { type: String },
})



const nodeDefineSchema = new mongoose.Schema({
    type: { type: String, enum: ["trigger", "action", "condition"] },
    label: String,
    description: String,
    
})


export const userModel = mongoose.model("User", userSchema)
export const nodeModel = mongoose.model("Nodes", nodeDefineSchema)
export const workflowModel = mongoose.model("workflows", workflowSchema)
