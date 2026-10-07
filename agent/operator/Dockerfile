# Roblette operator services (round operator + price relay). One image, PROCESS selects which one runs.
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY abi ./abi
COPY src ./src
COPY start.sh ./
# The round operator keeps server seeds here; mount a persistent volume at /data.
ENV STATE_DIR=/data NODE_ENV=production
# The rounds service serves POST /wake and GET /health on $PORT (Railway injects it).
EXPOSE 8080
CMD ["sh", "./start.sh"]
