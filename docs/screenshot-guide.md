# Test the workflow and capture a screenshot

Run these steps on a machine with Node.js 24, npm 11, Docker, and Docker
Compose. The cloud runner described in the friction log cannot recreate the
full n8n image because its Docker VFS filesystem runs out of inodes.

## 1. Install and start ConnectorOps

```bash
git clone https://github.com/jherey/connectorops.git
cd connectorops
cp .env.example .env
npm ci
npm run dev
```

Keep that terminal open. In a second terminal, check the services:

```bash
npm run smoke
```

Open <http://localhost:5678>. Complete n8n's owner setup if this is the first
run.

## 2. Import and test the workflow

Import the AcmeCRM credential and versioned workflow:

```bash
ACME_API_KEY=connectorops-local-partner-key npm run workflow:bootstrap
```

Run the automated check before using the editor:

```bash
ACME_CONTROL_TOKEN=connectorops-local-control-token npm run workflow:execute
```

The command must print these values:

```json
{
	"status": "passed",
	"lastNodeExecuted": "Create Order",
	"attempts": 2,
	"ordersPersisted": 1,
	"outcomes": ["created", "replayed"],
	"stableIdempotencyKey": true
}
```

This output proves that n8n ran the custom node, the first request committed an
order and timed out, and the retry returned the same order.

## 3. Run it in the editor

The workflow uses the fixed run ID `cli-safe-retry`. Reset and prepare that run
before clicking the editor button:

```bash
curl --silent --output /dev/null \
  --request DELETE \
  --header 'Authorization: Bearer connectorops-local-control-token' \
  http://localhost:3001/__control/runs/cli-safe-retry

curl --fail --silent --show-error \
  --request POST \
  --header 'Authorization: Bearer connectorops-local-control-token' \
  --header 'Content-Type: application/json' \
  --data '{"runId":"cli-safe-retry","scenario":"timeout-after-commit","delayMs":400}' \
  http://localhost:3001/__control/runs
```

In n8n:

1. Open **ConnectorOps: AcmeCRM safe retry**.
2. Click **Test workflow**.
3. Wait for both nodes to show successful execution.
4. Select **Create Order** so the output panel shows the returned order.
5. Use **Fit view** so the workflow name and both nodes are readable.

## 4. Capture the image

Include the workflow title, the `Run certification` node, the `Create Order`
node, both successful execution marks, and the order output. Do not open the
credential panel. Crop out browser bookmarks, notifications, email addresses,
and unrelated tabs.

The strongest single screenshot shows the successful custom-node execution.
The repository link and generated blocked scorecard can explain the negative
control elsewhere in the application.

## 5. Stop the services

```bash
npm run down
```

This command keeps the PostgreSQL and n8n volumes for the next run.
