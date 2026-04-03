import { describe, expect, it } from "vitest";
import { getNowNextProgramme, parseXmltvDocument, parseXmltvTimestamp } from "./xmltv-parser.js";

const xmltv = `
  <tv>
    <channel id="news.one">
      <display-name>News One</display-name>
      <display-name>News 1 HD</display-name>
      <icon src="https://example.com/news.png" />
    </channel>
    <programme id="programme-1" channel="news.one" start="20260402090000 +0000" stop="20260402100000 +0000">
      <title>Morning Brief</title>
      <subTitle>Headlines</subTitle>
      <desc>Top stories.</desc>
      <category>News</category>
      <icon src="https://example.com/morning-brief.png" />
    </programme>
    <programme channel="news.one" start="20260402100000 +0000" stop="20260402110000 +0000">
      <title>Market Watch</title>
    </programme>
  </tv>
`;

describe("parseXmltvTimestamp", () => {
  it("parses XMLTV timestamps with UTC offsets", () => {
    expect(parseXmltvTimestamp("20260402093000 +0200")?.toISOString()).toBe("2026-04-02T07:30:00.000Z");
    expect(parseXmltvTimestamp("invalid")).toBeNull();
  });
});

describe("parseXmltvDocument", () => {
  it("extracts channels and programmes from XMLTV", () => {
    const document = parseXmltvDocument(xmltv);

    expect(document.channels).toEqual([
      {
        id: "news.one",
        displayNames: ["News One", "News 1 HD"],
        iconUrl: "https://example.com/news.png",
      },
    ]);

    expect(document.programmes).toHaveLength(2);
    expect(document.programmes[0]).toMatchObject({
      externalId: "programme-1",
      channelId: "news.one",
      title: "Morning Brief",
      subtitle: "Headlines",
      description: "Top stories.",
      category: "News",
      imageUrl: "https://example.com/morning-brief.png",
    });
  });
});

describe("getNowNextProgramme", () => {
  it("returns the current and next programme for a channel", () => {
    const { programmes } = parseXmltvDocument(xmltv);
    const result = getNowNextProgramme(programmes, "news.one", new Date("2026-04-02T09:30:00.000Z"));

    expect(result.now?.title).toBe("Morning Brief");
    expect(result.next?.title).toBe("Market Watch");
  });
});
