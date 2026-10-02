/**
 * End-to-end check of Google sign-in sync against the Firebase emulators.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-fallow
 *   npm run test:sync
 *
 * Two "devices" (two browser ledgers) share one account: device A uploads, a
 * fresh device B swaps its demo for the account's garden, deletes sync both
 * ways, the security rules keep a second account out, text sync can be turned
 * on and off, and erasing clears the cloud copy.
 */
process.env.NEXT_PUBLIC_FIREBASE_EMULATOR = "1";

type Check = [string, boolean];
const checks: Check[] = [];
const ok = (name: string, pass: boolean) => {
  checks.push([name, pass]);
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
};

async function main() {
  const { firebase } = await import("../src/client/account");
  const { BrowserLedger } = await import("../src/client/ledger");
  const { FirestoreRemote } = await import("../src/client/remote");
  const { SyncEngine } = await import("../src/client/sync");
  const { emptyLedger } = await import("../src/core/ledger");

  const kit = await firebase();
  const { a, f, auth, db } = kit;

  // wipe the emulator's data for this project between runs
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-fallow/databases/(default)/documents", { method: "DELETE" });
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-fallow/accounts", { method: "DELETE" });

  const signInAs = async (sub: string, email: string) => {
    const cred = a.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name: sub }));
    return (await a.signInWithCredential(auth, cred)).user;
  };

  const userA = await signInAs("user-a", "a@example.com");
  ok("signs in through the Google provider", !!userA.uid);

  const demo = emptyLedger();
  demo.events = [{ id: "demo-1", ts: "2026-08-01T10:00:00.000Z", source: "seed", domains: [{ id: "recall", weight: 1 }], icap: "passive", askType: "answer", actor: "ai" }];

  // device A: its own garden
  const devA = new BrowserLedger();
  const remoteA = new FirestoreRemote(userA.uid);
  const engA = new SyncEngine(devA, remoteA);
  engA.start();
  await devA.logPrompt({ text: "write my cover letter for the internship", source: "gate", ts: "2026-09-02T15:00:00.000Z" });
  await devA.logPrompt({ text: "what is 17% of 2340, show the steps", source: "gate", ts: "2026-10-01T09:00:00.000Z", actor: "self" });
  await devA.updateSettings({ intensity: "firm", keepList: ["composition", "recall"] });
  const r1 = await engA.fullSync();
  ok("device A uploads its garden", r1.uploaded === 2);

  const pulled = await remoteA.pull();
  const months = Object.keys(pulled.months).sort();
  ok("cloud holds one document per month", months.join(",") === "2026-09,2026-10");
  const anyEvent = Object.values(pulled.months["2026-09"].events ?? {})[0];
  ok("ask text stays on the device by default", !!anyEvent && anyEvent.excerpt === undefined);
  ok("settings went up", pulled.settings?.intensity === "firm" && pulled.settingsAt > 0);

  // device B: a first visit with the demo, then sign-in
  const devB = new BrowserLedger(async () => structuredClone(demo));
  ok("device B starts on the demo", await devB.isDemo());
  const engB = new SyncEngine(devB, new FirestoreRemote(userA.uid));
  engB.start();
  const r2 = await engB.fullSync();
  const lb = await devB.load();
  ok("device B swaps the demo for the account's garden", r2.added === 2 && lb.events.length === 2 && !lb.events.some((e) => e.id === "demo-1"));
  ok("device B picks up the settings", lb.settings.intensity === "firm" && lb.settings.keepList.join(",") === "composition,recall");
  ok("device B is no longer a demo", !(await devB.isDemo()));
  const afterB = await remoteA.pull();
  ok("the demo never reached the cloud", !Object.values(afterB.months).some((m) => m.events && "demo-1" in m.events));

  // a delete on B reaches A
  const victim = lb.events[0].id;
  await devB.deleteEvent(victim);
  await engB.flush();
  await engA.fullSync();
  const la = await devA.load();
  ok("a delete on one device reaches the other", !la.events.some((e) => e.id === victim) && la.events.length === 1);

  // a new ask on A shows up on B, a settings change on B shows up on A
  await devA.logPrompt({ text: "plan my week around three exams", source: "gate", ts: "2026-10-01T11:00:00.000Z" });
  await engA.flush();
  await devB.updateSettings({ intensity: "gentle" });
  await engB.flush();
  await engB.fullSync();
  await engA.fullSync();
  ok("new asks travel A to B", (await devB.load()).events.length === 2);
  ok("settings travel B to A, newest wins", (await devA.load()).settings.intensity === "gentle");
  ok("the deleted ask stays deleted", !(await devA.load()).events.some((e) => e.id === victim));

  // text sync on, then off again
  await devA.updateSettings({ syncText: true });
  await engA.flush();
  await engA.rewriteAll();
  const withText = await remoteA.pull();
  const texts = Object.values(withText.months).flatMap((m) => Object.values(m.events ?? {})).map((e) => e.excerpt);
  ok("turning text sync on uploads the ask text", texts.length > 0 && texts.every((t) => typeof t === "string" && t.length > 0));
  await devA.updateSettings({ syncText: false });
  await engA.flush();
  await engA.rewriteAll();
  const noText = await remoteA.pull();
  ok("turning it off removes the text from the cloud", Object.values(noText.months).flatMap((m) => Object.values(m.events ?? {})).every((e) => e.excerpt === undefined));
  ok("tombstones survive a rewrite", Object.values(noText.months).some((m) => m.deleted && victim in m.deleted));

  // another account cannot read or write A's garden
  await signInAs("user-b", "b@example.com");
  let readDenied = false;
  try {
    await f.getDoc(f.doc(db, "users", userA.uid));
  } catch (e) {
    readDenied = (e as { code?: string }).code === "permission-denied";
  }
  ok("rules: a second account cannot read the first", readDenied);
  let writeDenied = false;
  try {
    await f.setDoc(f.doc(db, "users", userA.uid, "months", "2026-10"), { events: {} }, { merge: true });
  } catch (e) {
    writeDenied = (e as { code?: string }).code === "permission-denied";
  }
  ok("rules: a second account cannot write the first", writeDenied);
  let badMonth = false;
  try {
    await f.setDoc(f.doc(db, "users", auth.currentUser!.uid, "months", "not-a-month"), { events: {} });
  } catch (e) {
    badMonth = (e as { code?: string }).code === "permission-denied";
  }
  ok("rules: month documents must be named YYYY-MM", badMonth);

  // erase, as user A again
  await signInAs("user-a", "a@example.com");
  await engA.eraseRemote();
  const erased = await remoteA.pull();
  ok("erasing clears the cloud copy", erased.settings === null && Object.keys(erased.months).length === 0);

  engA.stop();
  engB.stop();
  const failed = checks.filter(([, p]) => !p);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
