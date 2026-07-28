# Multi-architecture control-plane container stub (WS-E / AC-11).
# Runner still executes beside the repository — this image is control plane only.

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HUDDLE_HOST=0.0.0.0 \
    HUDDLE_PORT=8080 \
    HUDDLE_DATABASE_URL=sqlite:///data/huddle.db \
    HUDDLE_DATA_DIR=/data \
    HUDDLE_TELEMETRY=off

RUN mkdir -p /data \
  && printf '%s\n' \
    'const http = require("node:http");' \
    'const port = Number(process.env.HUDDLE_PORT || 8080);' \
    'const host = process.env.HUDDLE_HOST || "0.0.0.0";' \
    'const server = http.createServer((req, res) => {' \
    '  if (req.url === "/healthz" || req.url === "/readyz") {' \
    '    res.writeHead(200, { "content-type": "application/json" });' \
    '    res.end(JSON.stringify({ ok: true, stub: true }));' \
    '    return;' \
    '  }' \
    '  res.writeHead(200, { "content-type": "text/plain" });' \
    '  res.end("huddle control-plane stub\\n");' \
    '});' \
    'server.listen(port, host, () => {' \
    '  console.log(`huddle control-plane stub listening on ${host}:${port}`);' \
    '});' \
    > /app/server.js

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HUDDLE_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/server.js"]
