import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'graphql'
import { createUrqlClient } from './urql'
import { setToken } from './lib/token'

afterEach(() => {
  setToken(null)
  vi.unstubAllGlobals()
})

describe('URQL authentication', () => {
  it('includes the access token in GraphQL requests', async () => {
    setToken('test-token')

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { __typename: 'Query' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createUrqlClient()
    await client.query(parse('{ __typename }'), {}).toPromise()

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      authorization: 'Bearer test-token',
    })
  })

  it('does not add an authorization header when logged out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { __typename: 'Query' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createUrqlClient()
    await client.query(parse('{ __typename }'), {}).toPromise()

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('')
  })
})
