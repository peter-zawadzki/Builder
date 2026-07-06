import dotenv from "dotenv";
import { resolve } from "node:path";

// Load .env.local into process.env. Imported first (before db/clerk) so those
// modules see DATABASE_URL / CLERK_SECRET_KEY at evaluation time.
dotenv.config({ path: resolve(process.cwd(), ".env.local") });
