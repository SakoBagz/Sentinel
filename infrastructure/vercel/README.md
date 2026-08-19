# Vercel frontend deployment

Create a Vercel Hobby project pointed at this repository with `apps/web` as the
root directory. Set:

```text
NEXT_PUBLIC_API_BASE_URL=https://<render-api-host>
NEXT_PUBLIC_WS_BASE_URL=wss://<render-api-host>
```

The frontend keeps MapLibre/OpenFreeMap as the map dependency and does not require a
paid tile provider. The backend remains responsible for hosted limits and analysis
quota enforcement.
