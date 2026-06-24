import crypto from 'crypto'

const rawKey = process.env.ENCRYPTION_KEY || 'vocaply_secret_key_fallback_12345'
// Ensure the key is exactly 32 bytes by hashing it, regardless of the env variable length
const ENCRYPTION_KEY = crypto.createHash('sha256').update(rawKey).digest()
const IV_LENGTH = 16 // For AES

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(':')
    if (textParts.length < 2) return text // fallback if not encrypted
    const iv = Buffer.from(textParts.shift()!, 'hex')
    const encryptedText = Buffer.from(textParts.join(':'), 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString()
  } catch (err) {
    // If decryption fails, return original text (useful for transition of unencrypted data)
    return text
  }
}
