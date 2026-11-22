# ---------- Build stage ----------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/

RUN npm ci --workspace=client

COPY client ./client
COPY shared ./shared

WORKDIR /app/client
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine

ENV API_UPSTREAM=http://api:4000
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY client/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
