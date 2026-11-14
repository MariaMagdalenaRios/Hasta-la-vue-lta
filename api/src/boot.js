import { pool } from "./db/client.js";
import { createTables } from "./db/migrate.js";
import { seedDatabase } from "./db/seed.js";
import { mongo } from "./db/mongo.js";
import { migrateLogs, verifyLogs } from "./db/migrate-logs.js";

const boot = async () => {
  try {
    await createTables();

    const result = await pool.query("select count(*)::int as count from users");

    if (result.rows[0].count === 0) {
      console.log("boot: tom databas – seedar");
      await seedDatabase();
    }
    // Connect MongoDB and keep the shared client open.
    await mongo.connect();

    // Run log migration only when explicitly enabled.
    if (process.env.MIGRATE_LOGS_ON_START === "1") {
      console.log("boot: running Postgres-to-MongoDB log migration");

      await migrateLogs();
      const verified = await verifyLogs();
      if (!verified) {
        throw new Error("Postgres-to-MongoDB verification failed");
      }
      console.log("boot: log migration verified");
    }

    await import("./index.js");
  } catch (err) {
    console.error("API kunde inte starta:", err);
    process.exit(1);
  }
};

boot();
