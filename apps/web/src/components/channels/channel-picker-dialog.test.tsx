import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChannelPickerDialog } from "./channel-picker-dialog";

describe("ChannelPickerDialog", () => {
  it("filters channels by search and returns the selected channel id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ChannelPickerDialog
        channels={[
          {
            id: "channel-1",
            name: "News One",
            slug: "news-one",
            logoUrl: null,
            sourceMode: "MASTER_PLAYLIST",
            masterHlsUrl: "https://example.com/news.m3u8",
            playbackMode: "DIRECT",
            manualVariantCount: 0,
            groupId: "group-1",
            group: {
              id: "group-1",
              name: "News",
              slug: "news",
              sortOrder: 0,
              createdAt: "",
              updatedAt: "",
            },
            epgSourceId: null,
            epgChannelId: null,
            epgSource: null,
            isActive: true,
            sortOrder: 0,
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "channel-2",
            name: "Sports Live",
            slug: "sports-live",
            logoUrl: null,
            sourceMode: "MASTER_PLAYLIST",
            masterHlsUrl: "https://example.com/sports.m3u8",
            playbackMode: "PROXY",
            manualVariantCount: 0,
            groupId: "group-2",
            group: {
              id: "group-2",
              name: "Sports",
              slug: "sports",
              sortOrder: 0,
              createdAt: "",
              updatedAt: "",
            },
            epgSourceId: null,
            epgChannelId: null,
            epgSource: null,
            isActive: true,
            sortOrder: 1,
            createdAt: "",
            updatedAt: "",
          },
        ]}
        description="Find and switch channels fast."
        onClose={() => undefined}
        onSelect={onSelect}
        open
        title="Quick channel switch"
      />,
    );

    await user.type(screen.getByPlaceholderText("Search by channel, slug, or group"), "sports");

    expect(screen.queryByText("News One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sports live/i }));

    expect(onSelect).toHaveBeenCalledWith("channel-2");
  });

  it("locks body scrolling while the picker is open", () => {
    render(
      <ChannelPickerDialog
        channels={[]}
        description="Find and switch channels fast."
        onClose={() => undefined}
        onSelect={() => undefined}
        open
        title="Quick channel switch"
      />,
    );

    expect(document.body.style.overflow).toBe("hidden");
  });
});
