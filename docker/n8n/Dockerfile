ARG N8N_VERSION=2.44.5
FROM n8nio/n8n:${N8N_VERSION}

USER node

RUN mkdir -p /home/node/.n8n/nodes
COPY --chown=node:node docker/n8n/artifacts/n8n-nodes-acmecrm.tgz /tmp/n8n-nodes-acmecrm.tgz
RUN cd /home/node/.n8n/nodes \
    && npm init --yes \
    && npm install --omit=dev --legacy-peer-deps --offline --no-audit --no-fund --ignore-scripts /tmp/n8n-nodes-acmecrm.tgz \
    && rm /tmp/n8n-nodes-acmecrm.tgz
