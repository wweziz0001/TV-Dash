import type { SavedLayoutInput } from "@tv-dash/shared";
import {
  createLayout,
  deleteLayout,
  findOwnedLayout,
  listLayouts,
  updateLayout,
} from "./layout.repository.js";
import { mapPublicChannel } from "../channels/channel-mappers.js";

function mapLayoutChannels<TLayout extends { items: Array<{ channel: unknown | null }> }>(layout: TLayout) {
  return {
    ...layout,
    items: layout.items.map((item) => ({
      ...item,
      channel:
        item.channel && typeof item.channel === "object" && "id" in item.channel
          ? mapPublicChannel(item.channel as never)
          : item.channel,
    })),
  };
}

export function listUserLayouts(userId: string) {
  return listLayouts(userId).then((layouts) => layouts.map(mapLayoutChannels));
}

export function getOwnedLayout(id: string, userId: string) {
  return findOwnedLayout(id, userId);
}

export function createUserLayout(userId: string, payload: SavedLayoutInput) {
  return createLayout(userId, payload).then(mapLayoutChannels);
}

export function updateUserLayout(id: string, payload: SavedLayoutInput) {
  return updateLayout(id, payload).then(mapLayoutChannels);
}

export function deleteUserLayout(id: string) {
  return deleteLayout(id);
}
