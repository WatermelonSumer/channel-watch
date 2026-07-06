FROM node:22-alpine AS web-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run web:build

FROM nginx:1.25.3-alpine-slim

ENV API_PROXY_TARGET=http://127.0.0.1:4176

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
