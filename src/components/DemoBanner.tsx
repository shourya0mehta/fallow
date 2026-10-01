import Link from "next/link";

export function DemoBanner() {
  return (
    <p className="notice" style={{ marginTop: 8 }}>
      You are looking at a demo ledger: ninety days of a student developer's asks. Drop your own ChatGPT or Claude export on the{" "}
      <Link href="/import" style={{ textDecoration: "underline" }}>
        Import
      </Link>{" "}
      page to see your field instead. It is parsed in this browser and nothing is uploaded anywhere. Or start clean from{" "}
      <Link href="/settings" style={{ textDecoration: "underline" }}>
        Settings
      </Link>
      .
    </p>
  );
}
