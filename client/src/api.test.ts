import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_URL, get, post } from './api'

// fetch() does not reject on 404/500, so the caller has to check the response.
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('get', () => {
  it('fetches from the API URL and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([{ id: 1, slug: 'kebnekaise' }]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(get('/guides')).resolves.toEqual([{ id: 1, slug: 'kebnekaise' }])
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/guides`, { headers: {} })
  })

  it('throws with the status code when the API answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Not found' }, 404)))

    await expect(get('/guides/999')).rejects.toThrow('API svarade 404')
  })
})

describe('post', () => {
  it('sends the body as JSON with the right content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ token: 'abc' }))
    vi.stubGlobal('fetch', fetchMock)

    const body = { email: 'anna@example.com', password: 'secret' }
    await expect(post('/auth/login', body)).resolves.toEqual({ token: 'abc' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_URL}/auth/login`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual(body)
  })

  // The API answers with JSON on 401 too, and the login reads { error } from it.
  it('returns the error message on 401 instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'Wrong email or password' }, 401)),
    )

    await expect(post('/auth/login', {})).resolves.toEqual({ error: 'Wrong email or password' })
  })
})
