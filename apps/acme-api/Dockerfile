FROM node:24.19.0-alpine

ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=3001

WORKDIR /app

COPY docker/acme-api/artifacts/acme-api.tgz /tmp/acme-api.tgz
RUN tar -xzf /tmp/acme-api.tgz --strip-components=1 \
    && rm /tmp/acme-api.tgz \
    && chown -R node:node /app \
    && chmod -R u=rwX,go=rX /app

USER node
EXPOSE 3001

CMD ["node", "dist-bundle/server.cjs"]
