FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json ./package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm --workspace apps/web run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "--workspace", "apps/web", "run", "start"]

