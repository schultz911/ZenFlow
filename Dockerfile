# Node.js 22 LTS Base (Engine requirement for Firebase Admin 14+ / @google-cloud/firestore)
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/firebase-applet-config.json* ./

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
