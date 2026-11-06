import { APP_NAME } from "@grooveli/shared";

export default function Home() {
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <h1>{APP_NAME}</h1>
    </main>
  );
}
