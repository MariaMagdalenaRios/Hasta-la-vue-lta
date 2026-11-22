import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    // Vite 6+ turns on the "development" export condition. `graphql` has a
    // separate __dev__ build for that condition, so our code got one copy of
    // GraphQLError and the externalized graphql-yoga got another. `instanceof`
    // failed and auth errors turned into INTERNAL_SERVER_ERROR. Inlining the
    // yoga stack makes Vite resolve `graphql` the same way for everyone.
    server: {
      deps: {
        inline: [/graphql-yoga/, /@graphql-tools/, /@envelop/, /@whatwg-node/],
      },
    },
  },
  ssr: {
    resolve: {
      conditions: ["node"],
    },
  },
});
