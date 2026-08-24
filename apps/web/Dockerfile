FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json ./package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Browser uses same-origin /api and /ws; Next rewrites to the API service.
ARG API_PROXY_ORIGIN=http://api:8000
ENV API_PROXY_ORIGIN=$API_PROXY_ORIGIN
ENV NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_WS_BASE_URL=
RUN npm --workspace apps/web run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG API_PROXY_ORIGIN=http://api:8000
ENV API_PROXY_ORIGIN=$API_PROXY_ORIGIN
ENV NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_WS_BASE_URL=
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "--workspace", "apps/web", "run", "start"]
