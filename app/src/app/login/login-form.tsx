"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { redirectTo?: unknown };
        const raw = typeof body.redirectTo === "string" ? body.redirectTo : "/";
        // Solo destinos internos: descarta URLs externas y protocol-relative (//host).
        const dest = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
        // Si el login quedó embebido en un iframe (sesión vencida dentro del shell
        // legacy), navega la ventana superior; si no, cargaríamos la Torre dentro
        // de la Torre. En top-level se mantiene el flujo normal con el router.
        let embedded = false;
        try {
          embedded = window.self !== window.top;
        } catch {
          embedded = true;
        }
        if (embedded && window.top) {
          window.top.location.replace(dest);
          return;
        }
        router.replace(dest);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo iniciar sesión");
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-error" role="alert">
        {error}
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
