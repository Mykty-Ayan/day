# Build stage — Vite bakes VITE_* into the bundle, so the API URL is a build arg.
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# "on" shows AI import in the menu; leave it unset until the ai-service is deployed.
ARG VITE_AI_IMPORT
ENV VITE_AI_IMPORT=$VITE_AI_IMPORT
# Microsoft Clarity on the guest pages (heatmaps, recordings); unset, it never loads.
ARG VITE_CLARITY_ID
ENV VITE_CLARITY_ID=$VITE_CLARITY_ID
RUN npm run build

# Serve stage
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
# Link previews ask the API by its public origin (https://api.example.com from
# https://api.example.com/api/v1); without one, the compose service's name.
ARG VITE_API_URL
RUN origin="$(printf '%s' "$VITE_API_URL" | sed -nE 's#^(https?://[^/]+).*#\1#p')"; \
    sed -i "s#__API_ORIGIN__#${origin:-http://backend:8000}#" /etc/nginx/conf.d/default.conf
# Fail the build, not the deploy, on a config nginx cannot load.
RUN nginx -t

EXPOSE 80

# 127.0.0.1, not localhost: the container's /etc/hosts maps localhost to ::1 as
# well, busybox wget tries that first, and nginx here listens on IPv4 only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
