import * as crypto from 'crypto'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
const LINE_API = 'https://api.line.me/v2/bot'

// ---- Signature verification ----
export function verifyLineSignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64')
  return hash === signature
}

// ---- Send messages ----
export async function replyMessage(replyToken: string, messages: object[]) {
  return linePost('/message/reply', { replyToken, messages })
}

export async function pushMessage(to: string, messages: object[]) {
  return linePost('/message/push', { to, messages })
}

export async function multicastMessage(to: string[], messages: object[]) {
  return linePost('/message/multicast', { to, messages })
}

// ---- Get user profile ----
export async function getProfile(userId: string) {
  const res = await fetch(`${LINE_API}/profile/${userId}`, {
    headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<{
    userId: string
    displayName: string
    pictureUrl: string
    statusMessage: string
  }>
}

// ---- Rich Menu ----
export async function createRichMenu(richMenu: object) {
  return linePost('/richmenu', richMenu)
}

export async function uploadRichMenuImage(richMenuId: string, imageBuffer: Uint8Array, contentType: string) {
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': contentType,
    },
    body: imageBuffer as unknown as BodyInit,
  })
  return res.ok
}

export async function setDefaultRichMenu(richMenuId: string) {
  const res = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
  })
  return res.ok
}

export async function deleteRichMenu(richMenuId: string) {
  const res = await fetch(`${LINE_API}/richmenu/${richMenuId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
  })
  return res.ok
}

// ---- Internal ----
async function linePost(path: string, body: object) {
  const res = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`LINE API error: ${JSON.stringify(data)}`)
  return data
}
