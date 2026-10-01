import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: false,
  demo: false,
  session: null as null | { user: { id: string } },
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseConfig: () => mocks.configured,
  isDemoMode: () => mocks.demo,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mocks.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }),
    },
  }),
}));

import { AuthProvider, useAuth } from "./auth-provider";

function Status() {
  const { status } = useAuth();
  return <span>{status}</span>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mocks.configured = false;
    mocks.demo = false;
    mocks.session = null;
  });

  it("defaults to unauthenticated when Supabase is not configured", () => {
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    expect(screen.getByText("unauthenticated")).toBeInTheDocument();
  });

  it("lets an explicit development preview override local Supabase config", () => {
    mocks.configured = true;
    mocks.demo = true;
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    expect(screen.getByText("demo")).toBeInTheDocument();
  });

  it("restores an existing browser session", async () => {
    mocks.configured = true;
    mocks.session = { user: { id: "user-1" } };
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
  });
});
