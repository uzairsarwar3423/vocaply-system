import { getBotStatus } from './src/services/recall.service'

async function main() {
  const botId = '08ee8bfe-fe5a-4375-88cf-817e8dfcc3fb' // weekly commitment bot
  console.log('Fetching bot status for:', botId)
  
  try {
    const status = await getBotStatus(botId)
    console.log(JSON.stringify(status, null, 2))
  } catch (err) {
    console.error('Error fetching bot status:', err)
  }
}

main().catch(console.error)
