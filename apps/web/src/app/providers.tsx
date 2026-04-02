import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/features/auth/auth-context";

const queryClient = new QueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0f1726",
            color: "#e2e8f0",
            border: "1px solid rgba(51, 65, 85, 0.8)",
          },
        }}
      />
    </QueryClientProvider>
  );
}

