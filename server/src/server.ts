import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function start(): Promise<void> {
  try {
    await connectDatabase();
    app.listen(env.PORT, () => console.info(`AI Mystery Room API listening on port ${env.PORT}`));
  } catch (error) {
    console.error("Could not connect to MongoDB; server was not started.", { name: error instanceof Error ? error.name : "UnknownError" });
    process.exitCode = 1;
  }
}

void start();
