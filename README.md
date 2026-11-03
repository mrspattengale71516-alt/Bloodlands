# Bloodlands Trader — manual order system starter

A Node.js website prototype for the Bloodlands PlayStation DayZ server. It includes a custom item catalog, cart, order submission, staff order queue, manual payment verification, and optional Discord webhook notifications. It does **not** connect to DayZ, spawn items, or deliver items on restart.

## Configured for Bloodlands
- Designated payment recipient shown at checkout: `PayHerFirst`
- Order notifications: configure a webhook from the private `#trader-orders` channel
- Payment: player uses `.b0ne` `/pay`; staff verifies transfer manually
- Fulfillment: staff meets the player in-game and trades items manually

## Important limitations before public launch
This is an early prototype, not a production-ready store. Before taking real player orders, it needs stronger authentication, Discord OAuth2 identity verification, request rate limits, a database, backups, and a security review. The current staff key is entered in the browser and sent with staff API requests; use HTTPS and keep the key private. Player-entered Discord IDs are not verified. No payment is automatically charged or verified. The Discord webhook only sends notifications. There is no .b0ne API integration in this project.

## Run locally
Requires Node.js 18 or newer.

1. Set the variables from `.env.example` in your terminal or development environment; the app does not automatically load a `.env` file. Never commit secrets.
2. Set `ADMIN_KEY` to a long random secret (32+ characters), generated with a password manager.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Deploy recommendation: Railway with a persistent volume
Railway supports long-running Node services, environment variables, and volumes. The app writes orders/catalog to a JSON file, so **a persistent volume is required** until we migrate it to a database.

1. Create a private GitHub repository and upload this project. Do not upload `.env`, Discord webhook URLs, admin keys, or `data.json` containing real player orders.
2. In Railway, create a project and deploy from that GitHub repository.
3. Set the service start command to `npm start` (Railway normally detects Node automatically).
4. Add a volume mounted at `/app/data`.
5. Set variables in Railway:
   - `NODE_ENV` = `production`
   - `TRADER_ACCOUNT` = `PayHerFirst`
   - `ADMIN_KEY` = a strong random secret, at least 32 characters
   - `DISCORD_WEBHOOK` = the webhook URL for the private `#trader-orders` channel
   - `DATA_FILE` = `/app/data/data.json`
6. Deploy and test with a fake item and a test order before inviting players.
7. Confirm the data survives a redeploy/restart, and make regular backups. Never use real player payments until the security items above are addressed.

Railway documentation: https://docs.railway.com/build-deploy, https://docs.railway.com/variables, https://docs.railway.com/volumes

## Create the Discord webhook
1. In Discord, open the private `#trader-orders` channel settings.
2. Go to Integrations → Webhooks → New Webhook.
3. Name it `Bloodlands Trader`, select `#trader-orders`, and copy the webhook URL.
4. Paste that URL into your host's `DISCORD_WEBHOOK` variable. Treat it like a password. If it leaks, delete/regenerate it.

## Payment workflow
1. Player submits an order; the website shows `PayHerFirst` and the total.
2. Player pays through `.b0ne` `/pay`.
3. Staff checks the transfer in Discord and marks payment verified in the dashboard.
4. Staff approves the order and meets the player in DayZ on PlayStation.
5. Staff hands over items manually and marks the order completed.

No automatic item delivery, server restart handling, or item spawning is included.
