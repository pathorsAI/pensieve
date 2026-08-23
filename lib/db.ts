import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
// neon() already refuses an empty connection string at module load; failing here
// just says which variable is missing (and drops the non-null assertion).
if (!connectionString) throw new Error("DATABASE_URL is not set");

export const db = drizzle(neon(connectionString), { schema });
