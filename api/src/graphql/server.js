import { createSchema, createYoga } from 'graphql-yoga';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/client.js';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { createLoaders } from './loaders.js';

const schema = createSchema({
  typeDefs,
  resolvers,
});

const createRequestDb = () => {
  const state = { count: 0 };

  return {
    get count() {
      return state.count;
    },
    query(sql, params) {
      state.count += 1;
      return pool.query(sql, params);
    },
  };
};

const useDatabaseQueryCount = {
  onExecute() {
    return {
      onExecuteDone({ args, result, setResult }) {
        const count = args.contextValue.db.count;
        setResult({
          ...result,
          extensions: {
            ...(result.extensions ?? {}),
            databasfragor: count,
          },
        });
      },
    };
  },
};

const userFromRequest = (request) => {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) return null;

  try {
    return jwt.verify(match[1], config.jwtSecret, {
      algorithms: ['HS256'],
    });
  } catch {
    return null;
  }
};

export const yoga = createYoga({
  schema,
  plugins: [useDatabaseQueryCount],
  graphqlEndpoint: '/graphql',
  graphiql: true,

  context: async ({ request }) => {
    const db = createRequestDb();

    return {
      user: userFromRequest(request),
      db,
      loaders: createLoaders(db),
    };
  },
});