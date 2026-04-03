import { XMLParser } from "fast-xml-parser";

export interface XmltvChannel {
  id: string;
  displayNames: string[];
  iconUrl: string | null;
}

export interface XmltvProgramme {
  externalId: string | null;
  channelId: string;
  start: Date;
  stop: Date | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
}

function asArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return [] as T[];
  }

  return Array.isArray(value) ? value : [value];
}

function readNodeText(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && "#text" in value && typeof value["#text"] === "string") {
    return value["#text"].trim();
  }

  return "";
}

function readAttributeString(value: unknown, attributeName: string) {
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const attributeValue = objectValue[attributeName];

    if (typeof attributeValue === "string") {
      return attributeValue.trim();
    }
  }

  return "";
}

export function parseXmltvTimestamp(value: string) {
  const match = value.trim().match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-]\d{4}))?$/,
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, offset] = match;
  const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));

  if (!offset) {
    return utcDate;
  }

  const offsetHours = Number(offset.slice(0, 3));
  const offsetMinutes = Number(offset.slice(0, 1) + offset.slice(3));

  return new Date(utcDate.getTime() - (offsetHours * 60 + offsetMinutes) * 60_000);
}

export function parseXmltvDocument(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  });

  const parsed = parser.parse(xml) as {
    tv?: {
      channel?: Array<
        | { id?: string; "display-name"?: unknown; icon?: { src?: string } | Array<{ src?: string }> }
        | { id?: string; "display-name"?: unknown; icon?: { src?: string } | Array<{ src?: string }> }
      >;
      programme?: Array<{
        id?: string;
        channel?: string;
        start?: string;
        stop?: string;
        title?: unknown;
        subTitle?: unknown;
        desc?: unknown;
        category?: unknown;
        icon?: { src?: string } | Array<{ src?: string }>;
      }>;
      };
  };

  if (!parsed.tv || typeof parsed.tv !== "object") {
    throw new Error("Invalid XMLTV document");
  }

  const channels = asArray(parsed.tv?.channel)
    .flatMap((channel) => {
      if (!channel?.id) {
        return [];
      }

      const displayNames = asArray(channel["display-name"]).map(readNodeText).filter(Boolean);
      return [
        {
          id: channel.id,
          displayNames,
          iconUrl: readAttributeString(asArray(channel.icon)[0], "src") || null,
        } satisfies XmltvChannel,
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const programmes = asArray(parsed.tv?.programme)
    .flatMap((programme) => {
      if (!programme?.channel || !programme.start) {
        return [];
      }

      const start = parseXmltvTimestamp(programme.start);
      if (!start) {
        return [];
      }

      return [
        {
          externalId: programme.id?.trim() || null,
          channelId: programme.channel,
          start,
          stop: programme.stop ? parseXmltvTimestamp(programme.stop) : null,
          title: readNodeText(programme.title) || "Untitled programme",
          subtitle: readNodeText(programme.subTitle) || null,
          description: readNodeText(programme.desc) || null,
          category: asArray(programme.category).map(readNodeText).find(Boolean) ?? null,
          imageUrl: readAttributeString(asArray(programme.icon)[0], "src") || null,
        } satisfies XmltvProgramme,
      ];
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  return {
    channels,
    programmes,
  };
}

export function getNowNextProgramme(programmes: XmltvProgramme[], channelId: string, at = new Date()) {
  const channelProgrammes = programmes.filter((programme) => programme.channelId === channelId);

  const now =
    channelProgrammes.find((programme) => programme.start <= at && (!programme.stop || programme.stop > at)) ?? null;

  const next =
    channelProgrammes.find((programme) => programme.start > at && (!now || programme.start >= now.start)) ?? null;

  return {
    now,
    next,
  };
}
