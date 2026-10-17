"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe diagnostic event label without raw error details, stack traces, or sensitive user data
    if (error?.digest) {
      console.error("Route error boundary caught error segment exception", `(digest: ${error.digest})`);
    } else {
      console.error("Route error boundary caught error segment exception");
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 1.5rem",
        backgroundColor: "var(--ca-canvas-0, #0B0F17)",
        color: "var(--ca-text-primary, #F3F4F6)",
      }}
    >
      <div
        style={{
          maxWidth: "36rem",
          width: "100%",
          textAlign: "center",
          backgroundColor: "var(--ca-surface-1, #111827)",
          border: "1px solid var(--ca-border-subtle, #1F2937)",
          borderRadius: "1rem",
          padding: "3rem 2rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "4rem",
            height: "4rem",
            borderRadius: "50%",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#EF4444",
            marginBottom: "1.5rem",
          }}
        >
          <AlertTriangle size={32} />
        </div>

        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#EF4444",
            marginBottom: "0.5rem",
          }}
        >
          Something Went Wrong
        </p>

        <h1
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "var(--ca-text-primary, #FFFFFF)",
            marginBottom: "1rem",
          }}
        >
          Application Exception Encountered
        </h1>

        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "var(--ca-text-secondary, #9CA3AF)",
            marginBottom: "2rem",
          }}
        >
          An unexpected error occurred while rendering this section. You can try refreshing the page segment or return to the main homepage.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--ca-brand, #32CF91)",
              color: "#0B0F17",
              fontWeight: 700,
              fontSize: "0.9375rem",
              border: "none",
              cursor: "pointer",
              transition: "opacity 0.2s ease",
            }}
          >
            <RefreshCw size={16} />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              backgroundColor: "var(--ca-surface-2, #1F2937)",
              color: "var(--ca-text-primary, #F3F4F6)",
              border: "1px solid var(--ca-border-subtle, #374151)",
              fontWeight: 600,
              fontSize: "0.9375rem",
              textDecoration: "none",
              transition: "background-color 0.2s ease",
            }}
          >
            <Home size={16} />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
