import { Client, OAuth2User } from 'splitwise-ts'

let _client: Client | null = null
let _tokenPromise: Promise<Client> | null = null

async function buildClient(): Promise<Client> {
  const clientId = import.meta.env.VITE_SPLITWISE_CLIENT_ID as string | undefined
  const clientSecret = import.meta.env.VITE_SPLITWISE_CLIENT_SECRET as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Splitwise credentials not configured. Set VITE_SPLITWISE_CLIENT_ID and VITE_SPLITWISE_CLIENT_SECRET.')
  }

  const user = new OAuth2User({ clientId, clientSecret })
  await user.requestAccessToken()
  return new Client(user)
}

export async function getSplitwiseClient(): Promise<Client> {
  if (_client) return _client
  if (!_tokenPromise) {
    _tokenPromise = buildClient().then((c) => {
      _client = c
      return c
    }).catch((err) => {
      _tokenPromise = null
      throw err
    })
  }
  return _tokenPromise
}

export function isSplitwiseConfigured(): boolean {
  return !!(import.meta.env.VITE_SPLITWISE_CLIENT_ID && import.meta.env.VITE_SPLITWISE_CLIENT_SECRET)
}
