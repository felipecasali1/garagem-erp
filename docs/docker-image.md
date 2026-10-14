# Production image: application only

This guide covers the standalone GaragemERP application image from issue #15. It does not yet start Supabase self-hosted; coordinated application + Supabase startup is tracked separately in issue #16. The normal `npm run dev` workflow continues to use the Cloud settings in `.env`.

## Build

From the repository root, build the production image:

```bash
docker build --tag garagem-erp:local .
```

The image build uses the Node 22 production runtime, installs from the lockfile, builds the app, and keeps only production dependencies in the final image. The Docker build context excludes `.env` files, local credentials, and test snippets. The public Supabase values used during the build are placeholders; real connection settings are supplied when the container starts.

## Configure and run

Create a separate runtime environment file instead of passing the development `.env` to Docker:

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` and provide:

- `SUPABASE_URL`: endpoint reachable by server-side application code.
- `SUPABASE_PUBLISHABLE_KEY`: publishable/anon key for server-side Supabase client operations.
- `SUPABASE_SERVICE_KEY`: privileged server-only key. Never prefix it with `VITE_`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: public settings delivered to the browser at runtime. The URL must be reachable from the browser and may differ from `SUPABASE_URL` in a Compose network.

`.env.docker` is ignored by Git. Do not commit or share it. Start the app container bound to the notebook's loopback interface:

```bash
docker run --rm --name garagem-erp-app \
  --env-file .env.docker \
  --publish 127.0.0.1:3000:3000 \
  garagem-erp:local
```

Open <http://127.0.0.1:3000/login> in a browser. Stop the container with `Ctrl+C`.

## Configuration and secrets

The image does not contain the developer's `.env` or real Supabase credentials. The Node server validates required settings at startup and includes only the public Supabase URL and anon/publishable key in the HTML response. `SUPABASE_SERVICE_KEY` remains a runtime server environment variable and is not sent to the browser. A missing value produces an actionable startup error naming the required variable.

This standalone image does not configure persistent database storage or Supabase services. Use the later Compose setup issue for a complete self-hosted installation.
