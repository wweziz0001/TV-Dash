import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChannelAdminFormFields, emptyChannelForm } from "./channel-admin-form";

function Harness() {
  const [form, setForm] = useState(emptyChannelForm);

  return (
    <ChannelAdminFormFields
      epgSources={[]}
      form={form}
      groups={[]}
      onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
    />
  );
}

describe("ChannelAdminFormFields", () => {
  it("switches between master and manual ingest modes and manages manual rows", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    expect(screen.getByText("Master HLS URL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add variant" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manual quality variants" }));

    expect(screen.queryByText("Master HLS URL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add variant" })).toBeInTheDocument();
    expect(screen.getByText("Variant 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add variant" }));

    expect(screen.getByText("Variant 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove variant 2" }));

    expect(screen.queryByText("Variant 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Master playlist URL" }));

    expect(screen.getByText("Master HLS URL")).toBeInTheDocument();
  });
});
