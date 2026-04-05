import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";

export function OidcCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { consumeOidcLogin } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(() => searchParams.get("error"));

  useEffect(() => {
    if (errorMessage) {
      return;
    }

    let cancelled = false;

    async function finalizeLogin() {
      try {
        const nextPath = await consumeOidcLogin();

        if (!cancelled) {
          navigate(nextPath || "/", { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to complete SSO login");
        }
      }
    }

    void finalizeLogin();

    return () => {
      cancelled = true;
    };
  }, [consumeOidcLogin, errorMessage, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Panel className="w-full max-w-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Enterprise Sign-In</p>
        <h1 className="mt-3 text-2xl font-bold text-white">
          {errorMessage ? "SSO sign-in could not be completed" : "Finishing your SSO session"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          {errorMessage
            ? errorMessage
            : "TV-Dash is validating your OIDC callback and restoring your control room session."}
        </p>
        {errorMessage ? (
          <div className="mt-6">
            <Link className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200" to="/login">
              Return to login
            </Link>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
