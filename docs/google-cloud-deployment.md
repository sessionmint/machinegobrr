# MachineGoBrrr Deployment (Firebase App Hosting)

This repo is a **Next.js App Router** app intended to be deployed with **Firebase App Hosting**.

App Hosting builds and runs your Next.js app on Cloud Run for you and provides a hosted domain like:

`https://<backendId>--<projectId>.<region>.hosted.app`

This repo also includes:

- `firebase.json` with an `apphosting` backend config
- `apphosting.yaml` for runtime sizing and env/secrets

## 1. Preconditions

- Billing enabled on the Firebase/GCP project
- Firestore enabled (Native mode)

## 2. Create Or Select An App Hosting Backend

If you have not created a backend yet:

```bash
firebase apphosting:backends:create \
  --project sessionmint-live \
  --backend machinegobrrr \
  --primary-region us-central1 \
  --root-dir .
```

To view backend URL:

```bash
firebase apphosting:backends:get machinegobrrr --project sessionmint-live
```

## 3. Configure Env Vars And Secrets

Put sensitive values in App Hosting secrets (Cloud Secret Manager under the hood) and reference them in `apphosting.yaml`.

Non-sensitive public config can be set as plaintext env vars in `apphosting.yaml`.

## 4. Deploy

You have two options:

1) Connect a GitHub repo in the Firebase Console for automatic rollouts.
2) Deploy local source with the CLI:

```bash
firebase deploy --only apphosting:machinegobrrr --project sessionmint-live
```

## 5. Custom Domain

Configure the custom domain on the App Hosting backend (Firebase Console) and update DNS as instructed.

## 6. Queue/device scheduler

Create a Cloud Scheduler job that calls:

- `GET https://<your-domain>/api/device/tick`
- Header: `Authorization: Bearer <CRON_SECRET>`
- Frequency: every 1 minute

## 7. Post-deploy checks

- `npm run build` passes
- Connect Phantom from `/machinegobrrr`
- SSE works: `GET /api/state/stream`
