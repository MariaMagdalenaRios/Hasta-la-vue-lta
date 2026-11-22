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
# The "unprivileged" image runs nginx as the non-root user `nginx` and listens
# on 8080, because a non-root user cannot bind port 80.
# mainline, not stable: the stable line (1.30.6) still had critical nginx CVEs
# fixed in 1.30.7 when this was written. Switch back to stable when it catches up.
FROM nginxinc/nginx-unprivileged:mainline-alpine

# apk needs root, so switch for this one step and back again
USER root
# Pull in security fixes released after the base image was built
RUN apk upgrade --no-cache
USER nginx

ENV API_UPSTREAM=http://api:4000
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY client/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 8080
