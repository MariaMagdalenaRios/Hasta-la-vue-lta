FROM node:22-alpine

# Pull in security fixes released after the base image was built
RUN apk upgrade --no-cache

ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/

RUN npm ci --workspace=api --omit=dev

# The app runs with `node`, never `npm`. Removing npm drops its bundled
# packages (tar, brace-expansion, ...) from the image, and their vulnerabilities.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY api ./api
COPY shared ./shared

WORKDIR /app/api

EXPOSE 4000

USER node

CMD ["node", "src/boot.js"]