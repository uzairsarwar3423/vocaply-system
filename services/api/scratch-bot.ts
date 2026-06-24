import { env } from './src/config/env'

async function main() {
  const botId = '2089a537-bae9-488b-b3dc-f8dbfb21cfb4'
  const url = `https://ap-northeast-1.recall.ai/api/v1/bot/${botId}/`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${env.RECALL_API_KEY}`,
      'Accept': 'application/json',
    }
  })
  
  const data = await response.json()
  console.log('Bot details keys:', Object.keys(data))
  
  // See if there's a transcript or meeting metadata
  if (data.meeting_metadata) {
    console.log('Meeting metadata keys:', Object.keys(data.meeting_metadata))
    if (data.meeting_metadata.transcript) {
        console.log('Transcript length (metadata):', data.meeting_metadata.transcript.length)
    }
  }
  
  if (data.transcript) {
     console.log('Transcript length (bot):', data.transcript.length)
  }
  
  // also check V2 bot transcript endpoint
  const v2Url = `https://ap-northeast-1.recall.ai/api/v2/bot/${botId}/transcript/`
  const v2Resp = await fetch(v2Url, {
    headers: { 'Authorization': `Token ${env.RECALL_API_KEY}` }
  })
  if (v2Resp.ok) {
     const v2Data = await v2Resp.json()
     console.log('V2 transcript type:', typeof v2Data, Array.isArray(v2Data) ? v2Data.length : 'not array')
  } else {
     console.log('V2 transcript failed:', v2Resp.status)
  }
}

main().catch(console.error)
