import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Channel, ProgramEntry } from "@/types/api";
import { ChannelManualProgramManager } from "./channel-manual-program-manager";

afterEach(() => {
  cleanup();
});

function formatLocal(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const channels: Channel[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "News Desk",
    slug: "news-desk",
    logoUrl: null,
    sourceMode: "MASTER_PLAYLIST",
    masterHlsUrl: "https://example.com/live.m3u8",
    playbackMode: "DIRECT",
    manualVariantCount: 0,
    hasManualPrograms: true,
    groupId: null,
    group: null,
    epgSourceId: null,
    epgSourceChannelId: null,
    epgChannelId: null,
    epgSource: null,
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-04-03T08:00:00.000Z",
    updatedAt: "2026-04-03T08:00:00.000Z",
  },
];

function buildProgram(overrides: Partial<ProgramEntry> = {}): ProgramEntry {
  return {
    id: "manual-1",
    sourceKind: "MANUAL",
    channelId: channels[0].id,
    title: "Morning bulletin",
    subtitle: null,
    description: "Lead stories",
    category: "News",
    imageUrl: null,
    startAt: "2026-04-03T09:00:00.000Z",
    endAt: "2026-04-03T10:00:00.000Z",
    createdAt: "2026-04-03T08:55:00.000Z",
    updatedAt: "2026-04-03T08:55:00.000Z",
    channel: {
      id: channels[0].id,
      name: channels[0].name,
      slug: channels[0].slug,
      isActive: true,
    },
    ...overrides,
  };
}

function Harness({
  initialPrograms = [buildProgram()],
  onCreate = vi.fn().mockResolvedValue(undefined),
  onCreateMany = vi.fn().mockResolvedValue(undefined),
  onUpdate = vi.fn().mockResolvedValue(undefined),
  onDelete = vi.fn().mockResolvedValue(undefined),
}: {
  initialPrograms?: ProgramEntry[];
  onCreate?: ReturnType<typeof vi.fn>;
  onCreateMany?: ReturnType<typeof vi.fn>;
  onUpdate?: ReturnType<typeof vi.fn>;
  onDelete?: ReturnType<typeof vi.fn>;
}) {
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0].id);

  return (
    <ChannelManualProgramManager
      channels={channels}
      onCreate={onCreate}
      onCreateMany={onCreateMany}
      onDelete={onDelete}
      onSelectedChannelIdChange={setSelectedChannelId}
      onUpdate={onUpdate}
      programs={initialPrograms}
      selectedChannelId={selectedChannelId}
    />
  );
}

describe("ChannelManualProgramManager", () => {
  it("creates a manual programme from the selected channel workflow", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<Harness initialPrograms={[]} onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Title *"), "Afternoon desk");
    await user.type(screen.getByLabelText("Category / type"), "News");
    await user.type(screen.getByLabelText("Start *"), "2026-04-03T13:00");
    await user.type(screen.getByLabelText("End *"), "2026-04-03T14:00");
    await user.type(screen.getByLabelText("Description"), "Local coverage");
    await user.click(screen.getByRole("button", { name: "Save programme" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: channels[0].id,
        title: "Afternoon desk",
        category: "News",
        description: "Local coverage",
      }),
    );
  });

  it("loads an entry into the editor and updates it", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(<Harness onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const titleInput = screen.getByLabelText("Title *");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated bulletin");
    await user.click(screen.getByRole("button", { name: "Update programme" }));

    expect(onUpdate).toHaveBeenCalledWith(
      "manual-1",
      expect.objectContaining({
        title: "Updated bulletin",
      }),
    );
  });

  it("deletes an existing manual programme row", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(<Harness onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("manual-1");
  });

  it("shows overlap validation before save", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<Harness onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "New entry" }));
    await user.type(screen.getByLabelText("Title *"), "Overlap bulletin");
    await user.type(screen.getByLabelText("Start *"), formatLocal("2026-04-03T09:30:00.000Z"));
    await user.type(screen.getByLabelText("End *"), formatLocal("2026-04-03T10:15:00.000Z"));
    await user.click(screen.getByRole("button", { name: "Save programme" }));

    expect(
      screen.getByText("This time range overlaps another manual programme on the selected channel."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("generates recurring entries for selected weekdays", async () => {
    const user = userEvent.setup();
    const onCreateMany = vi.fn().mockResolvedValue(undefined);

    render(<Harness initialPrograms={[]} onCreateMany={onCreateMany} />);

    await user.click(screen.getByRole("button", { name: "Repeat on days" }));
    await user.type(screen.getByLabelText("Title *"), "Daily recap");
    await user.type(screen.getByLabelText("Repeat from *"), "2026-04-06");
    await user.type(screen.getByLabelText("Repeat until *"), "2026-04-12");
    await user.type(screen.getByLabelText("Start time *"), "18:00");
    await user.type(screen.getByLabelText("End time *"), "19:00");

    await user.click(screen.getByRole("button", { name: "Sun" }));
    await user.click(screen.getByRole("button", { name: "Tue" }));
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.click(screen.getByRole("button", { name: "Sat" }));

    expect(screen.getByText("This will generate 5 manual programme entries.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate programme entries" }));

    expect(onCreateMany).toHaveBeenCalledTimes(1);
    expect(onCreateMany.mock.calls[0][0]).toHaveLength(5);
    expect(onCreateMany.mock.calls[0][0][0]).toMatchObject({
      channelId: channels[0].id,
      title: "Daily recap",
    });
  });
});
