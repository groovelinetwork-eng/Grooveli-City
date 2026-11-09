export default function LoginPage() {
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "320px" }}>
        <h1>Login</h1>
        <input type="email" placeholder="Email" />
        <input type="password" placeholder="Password" />
        <button type="submit">Login</button>
        <p>
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </form>
    </main>
  );
}

