export default function SignupPage() {
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "320px" }}>
        <h1>Sign Up</h1>
        <input type="text" placeholder="Username" />
        <input type="email" placeholder="Email" />
        <input type="password" placeholder="Password" />
        <button type="submit">Create Account</button>
        <p>
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>
    </main>
  );
}

