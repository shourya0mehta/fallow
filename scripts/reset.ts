import { clearLedger, dataPath } from "../src/core/store";

clearLedger()
  .then(() => console.log(`Emptied ${dataPath()}.`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
