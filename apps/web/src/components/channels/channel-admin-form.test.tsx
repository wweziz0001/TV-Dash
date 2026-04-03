import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChannelAdminFormFields } from "./channel-admin-form";
import {
  createEmptyManualVariantFormValue,
  emptyChannelForm,
  type ChannelAdminFormValue,
} from "./channel-admin-form-state";

function Harness({ initialForm = emptyChannelForm }: { initialForm?: ChannelAdminFormValue }) {
  const [form, setForm] = useState<ChannelAdminFormValue>(initialForm);

  return (
    <ChannelAdminFormFields
      form={form}
      groups={[]}
      onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
    />
  );
}

describe("ChannelAdminFormFields", () => {
  it("switches modes and supports preset, duplicate, and auto-sort workflows", async () => {
    const user = userEvent.setup();

    render(<Harness initialForm={{ ...emptyChannelForm, name: "Ops Feed", slug: "ops-feed" }} />);

    expect(screen.getByText("Master HLS URL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add row" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manual quality variants" }));

    expect(screen.queryByText("Master HLS URL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add row" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add 720p" }));

    const labelInputsAfterPreset = screen.getAllByLabelText("Label");
    const heightInputsAfterPreset = screen.getAllByLabelText("Height");
    const bandwidthInputsAfterPreset = screen.getAllByLabelText("Bandwidth");

    expect(labelInputsAfterPreset[1]).toHaveValue("720p");
    expect(heightInputsAfterPreset[1]).toHaveValue(720);
    expect(bandwidthInputsAfterPreset[1]).toHaveValue(2800000);

    await user.click(screen.getByRole("button", { name: "Duplicate variant 2" }));

    const labelInputsAfterDuplicate = screen.getAllByLabelText("Label");
    const urlInputsAfterDuplicate = screen.getAllByLabelText("Playlist URL");

    expect(labelInputsAfterDuplicate[2]).toHaveValue("720p copy");
    expect(urlInputsAfterDuplicate[2]).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Add Low/Medium/High" }));
    await user.click(screen.getByRole("button", { name: "Auto-sort" }));

    const sortedLabels = screen.getAllByLabelText("Label").map((input) => (input as HTMLInputElement).value);

    expect(sortedLabels.slice(0, 4)).toEqual(["low", "medium", "720p", "high"]);

    await user.click(screen.getByRole("button", { name: "Master playlist URL" }));

    expect(screen.getByText("Master HLS URL")).toBeInTheDocument();
  });

  it("infers labels from URL patterns and shows duplicate validation feedback inline", async () => {
    const user = userEvent.setup();

    render(
      <Harness
        initialForm={{
          ...emptyChannelForm,
          name: "Ops Feed",
          slug: "ops-feed",
          sourceMode: "MANUAL_VARIANTS",
          masterHlsUrl: "",
          manualVariants: [
            {
              label: "720p",
              sortOrder: 0,
              playlistUrl: "https://example.com/live/720/index.m3u8",
              width: "1280",
              height: "720",
              bandwidth: "2800000",
              codecs: "",
              isActive: true,
            },
            createEmptyManualVariantFormValue(1),
          ],
        }}
      />,
    );

    const urlInputs = screen.getAllByLabelText("Playlist URL");
    const labelInputs = screen.getAllByLabelText("Label");
    const orderInputs = screen.getAllByLabelText("Order");
    const bandwidthInputs = screen.getAllByLabelText("Bandwidth");

    await user.type(urlInputs[1], "https://backup.example.com/live/720/playlist.m3u8");
    await user.tab();

    expect(labelInputs[1]).toHaveValue("720p");
    expect(bandwidthInputs[1]).toHaveValue(2800000);

    await user.clear(orderInputs[1]);
    await user.type(orderInputs[1], "0");

    expect(screen.getAllByText("Manual variant labels must be unique").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manual variant sort orders must be unique").length).toBeGreaterThan(0);
    expect(screen.getByText("2 issues")).toBeInTheDocument();
  });
});
