FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl netcat-openbsd wget

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 5002

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
