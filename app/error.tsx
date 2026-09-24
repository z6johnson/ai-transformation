"use client";

/** Root error boundary. Catches unhandled failures from Server Components (e.g. GitHub
 * Contents API errors) so the app shows a legible message instead of a bare digest. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="stack-lg">
      <header className="stack">
        <h1 className="t-display">Something went wrong</h1>
      </header>
      <div className="notice stack">
        <strong>{error.message || "An unexpected error occurred."}</strong>
        {error.digest && <p className="t-faint">Error ID: {error.digest}</p>}
      </div>
      <div className="row">
        <button className="btn btn--primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
