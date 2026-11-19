import { getToken } from './lib/token'
export const API_URL = '/api'

// Generisk: anroparen säger vilken typ svaret har – `get<Guide[]>('/guides')`.
// Typen kommer från @utpost/shared, samma fil som API:et använder.
export const get = async <T>(path: string): Promise<T> => {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`API svarade ${response.status}`)
  return response.json() as Promise<T>
}

// Används av inloggningen (Pinia-storen). Svarar med JSON även vid 401 – API:et skickar
// { error: '...' } då, och storen läser det. Kastar bara när svaret inte är JSON alls.
export const post = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return response.json() as Promise<T>
}
