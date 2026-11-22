FROM node:22-alpine

ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/

RUN npm ci --workspace=api --omit=dev

COPY api ./api
COPY shared ./shared

WORKDIR /app/api

EXPOSE 4000

USER node

CMD ["node", "src/boot.js"]