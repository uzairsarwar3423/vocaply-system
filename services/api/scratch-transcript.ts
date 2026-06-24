import { env } from './src/config/env'

async function main() {
  const botId = '2089a537-bae9-488b-b3dc-f8dbfb21cfb4'
  const url = `https://ap-northeast-1.recall.ai/api/v1/bot/${botId}/transcript/`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${env.RECALL_API_KEY}`,
      'Accept': 'application/json',
    }
  })
  
  if (!response.ok) {
    console.error('Failed to fetch transcript:', response.status, await response.text())
    return
  }
  
  const data = await response.json()
  console.log('Transcript length:', data.length || (data.transcript && data.transcript.length))
  console.log('First entry:', data[0] || (data.transcript && data.transcript[0]))
}

main().catch(console.error)
