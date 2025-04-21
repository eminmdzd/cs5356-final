Steps to set up the local dev environment:

1. Ensure that docker is running locally
2. Add a `.env` file (see `.env.example` for required env variables`
3. Execute `pnpm i` to install dependencies
4. Execute `pnpm run db:start` to have a postgres db running in a separate terminal window
5. Execute `pnpm run dev` to run the project in dev env. It will seed the database with dummy data (see `database/seed.ts`) 
