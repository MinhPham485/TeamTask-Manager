FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
## no dev dependencies, only production dependencies
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
