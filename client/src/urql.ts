import { createClient, cacheExchange, fetchExchange } from '@urql/vue'
import { getToken } from './lib/token'

export const createUrqlClient = (url = '/graphql') =>
  createClient({
    url,
    exchanges: [cacheExchange, fetchExchange],
    preferGetMethod: false,
    fetchOptions: () => {
      const token = getToken()
      return {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      }
    },
  })

export const client = createUrqlClient()
