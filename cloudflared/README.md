# Cloudflare Tunnel

Moji is served from a single container on port `3000`. A Cloudflare Tunnel
exposes it publicly without opening inbound ports.

## Token-based tunnel (recommended, used by docker-compose)

1. In the Cloudflare **Zero Trust** dashboard → **Networks → Tunnels**, create a
   tunnel and copy its **token**.
2. Add a **Public Hostname** to the tunnel:
   - Subdomain/domain: e.g. `moji.example.com`
   - Service: `HTTP` → `moji:3000` (the compose service name + port)
   - Under **Additional application settings → HTTP**, enable **WebSockets**
     (Socket.IO needs the WebSocket upgrade).
3. Put the token in `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ... 
   ```
4. Bring everything up:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

The `cloudflared` service connects out to Cloudflare and forwards traffic to the
`moji` container. No `*.json` credentials file is needed for token-based tunnels.

## Notes
- WebSockets must be enabled on the public hostname or live guessing won't work.
- Set `PUBLIC_ORIGIN` in `.env` to your public URL (e.g. `https://moji.example.com`)
  so Socket.IO CORS is correct in production.
- For a credentials-file (named) tunnel instead of a token, mount the tunnel
  JSON here and reference it in a `config.yml`; the token flow above is simpler
  for most deploys.
