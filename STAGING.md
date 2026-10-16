# A test (staging) copy of the portal's backend

Why: the BPO Time app talks to the live backend, so anything you try while building a new feature (a clock-in, a
break, a shift change) is written to the real database and shows up for real people. A test copy lets you try things
without that. The BPO Time app can be pointed at it with one setting; see the app repo's `docs/testing.md`.

Set it up once. It costs nothing on the free tiers.

## Rules that keep production safe

1. **Its own, empty database.** Create a new Neon *project*. Do not make a branch of the production database:
   a branch starts with a copy of the real data (names, birthdays, attendance), and the test copy could then email
   real people.
2. **Never copy production data into it.** Make test accounts instead.
3. **Its own `JWT_SECRET`.** A login token from the real portal must not work on the test copy, and the other way round.
4. **No email, no file storage, no cron.** Leave `GMAIL_*`, `S3_*` and `CRON_SECRET` unset on the test project.
   Sending then fails with an error and nothing reaches a real inbox; the monthly reminder cron refuses to run.
5. **Never use `backend/.env` for this.** It may point at the production database. Make a separate file
   (`backend/.env.staging`, which is not committed) and load it only for staging work.
6. **Never deploy a preview of the production Vercel project.** Its build runs `prisma migrate deploy` against whatever
   database the project is set to, which is the real one.

## One-time setup

1. **Database.** In the Neon console create a project called `bpo-staging`. Copy its pooled connection string
   (`DATABASE_URL`) and its direct, non-pooled one (`DATABASE_URL_UNPOOLED`).
2. **Vercel project.** Create a second project in the same Vercel account:
   `npx vercel project add bpo-backend-staging`. Then look up its ids (`npx vercel project inspect bpo-backend-staging`
   shows the project id; the org id is in `backend/.vercel/project.json` as `orgId`).
3. **Environment variables** on that project only, one at a time:
   ```
   printf '%s' "<value>" | npx vercel env add DATABASE_URL production
   ```
   (run with the staging ids set, see step 4 for how). Set: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
   `JWT_SECRET` (a new one: `openssl rand -base64 48`), `CORS_ORIGIN` (`*` is fine for testing),
   `FRONTEND_URL` (the address you open the test portal at), and `RESTRICTED_HR_ONLY` unset. Do not add `GMAIL_*`,
   `S3_*` or `CRON_SECRET`.
   Careful: never run `vercel env rm` on anything here, and never against the real project. A removed shared variable
   can disappear from every environment (this happened once, see `HANDOFF.md`).
4. **Deploy to staging without touching the production link.** From `backend`, name the staging project for this one
   command instead of running `vercel link`, which would change which project the folder deploys to:
   ```
   VERCEL_ORG_ID=<org id> VERCEL_PROJECT_ID=<staging project id> npx vercel deploy --prod
   ```
   The build applies every migration to the staging database. Check the deploy log says `bpo-staging`'s database, not
   the real one, before you rely on it. Note the address it prints (`https://bpo-backend-staging-….vercel.app`).
5. **A test admin.** Seed the first account into the *staging* database only:
   ```
   cd backend
   DATABASE_URL=<staging url> ADMIN_EMAIL=test-admin@example.com ADMIN_PASSWORD=<a password> \
     ADMIN_FIRST_NAME=Test ADMIN_LAST_NAME=Admin npm run prisma:seed
   ```
   Then create a few test employees from the test portal. Use made-up names and addresses.

## Using it

- **The test portal.** Run the frontend locally against it: `cd frontend`, then
  `VITE_API_URL=https://<staging address>/api npm run dev`, and sign in as the test admin.
- **The BPO Time app.** In the app repo, copy `.env.staging.example` to `.env.staging`, put
  `BPO_API_BASE=https://<staging address>/api` in it, and run `npm run start:staging`. It shows an amber TEST pill and
  keeps its own sign-in folder. Press **Launch App** in the *test* portal to sign it in.
- **Releasing.** Test a backend change on staging first, then deploy it to production the normal way. Remember the
  production backend is shared with every installed copy of the app: keep changes additive (see the app repo's
  `docs/release.md`).

## What this does not cover

- The portal's website (GitHub Pages) has no staging copy; you run it locally for tests.
- Test accounts never receive email, so an activation or password link has to be copied from the database or the
  function log instead.
