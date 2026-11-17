import 'dotenv/config'
import { nodeModel } from './dist/db.js'

const newNodes = [
  {
    type: 'action',
    label: 'Web Search',
    description: 'Searches the web using Tavily API to fetch relevant sources and content.',
  },
  {
    type: 'action',
    label: 'Telegram Bot',
    description: 'Sends message notifications or alerts to a specified Telegram chat or channel.',
  },
  {
    type: 'action',
    label: 'Notion',
    description: 'Creates pages or database records inside Notion.',
  },
  {
    type: 'action',
    label: 'AI Extractor',
    description: 'Extracts structured JSON fields from text using an AI model.',
  },
  {
    type: 'action',
    label: 'Data Extractor',
    description: 'Extracts URLs, email addresses, phone numbers, or custom regex matches from text.',
  },
  {
    type: 'action',
    label: 'Code Runner',
    description: 'Executes custom sandboxed JavaScript code to process and transform data.',
  },
  {
    type: 'action',
    label: 'Delay',
    description: 'Pauses workflow execution for a specified duration.',
  },
  {
    type: 'action',
    label: 'Display Output',
    description: 'Displays formatted text or previous node output directly on the canvas.',
  },
]

async function seed() {
  console.log('Connecting to MongoDB Atlas and checking nodes...')
  for (const node of newNodes) {
    const existing = await nodeModel.findOne({ label: node.label })
    if (existing) {
      existing.type = node.type
      existing.description = node.description
      await existing.save()
      console.log(`[Updated] ${node.label} (${existing._id})`)
    } else {
      const created = await nodeModel.create(node)
      console.log(`[Created] ${node.label} (${created._id})`)
    }
  }

  const all = await nodeModel.find().lean()
  console.log(`\nSuccessfully seeded! Total nodes in MongoDB: ${all.length}`)
  console.log(JSON.stringify(all, null, 2))
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
