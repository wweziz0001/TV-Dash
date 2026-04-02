import type { ChannelInput } from "@tv-dash/shared";
import {
  createChannel,
  deleteChannel,
  findChannelById,
  findChannelsForEpgLookup,
  findChannelConfigById,
  findChannelBySlug,
  findChannelStreamById,
  listChannels,
  updateChannel,
  updateChannelSortOrder,
} from "./channel.repository.js";
import { mapChannelConfig, mapPublicChannel } from "./channel-mappers.js";

export function listChannelCatalog(filters: { search?: string; groupId?: string; active?: string }) {
  return listChannels(filters).then((channels) => channels.map(mapPublicChannel));
}

export function getChannelById(id: string) {
  return findChannelById(id).then((channel) => (channel ? mapPublicChannel(channel) : null));
}

export function getChannelBySlug(slug: string) {
  return findChannelBySlug(slug).then((channel) => (channel ? mapPublicChannel(channel) : null));
}

export function getChannelConfigForAdmin(id: string) {
  return findChannelConfigById(id).then((channel) => (channel ? mapChannelConfig(channel) : null));
}

export function getChannelStreamDetails(id: string) {
  return findChannelStreamById(id);
}

export function getChannelsForEpgLookup(ids: string[]) {
  return findChannelsForEpgLookup(ids);
}

export function createChannelRecord(payload: ChannelInput) {
  return createChannel(payload).then(mapChannelConfig);
}

export function updateChannelRecord(id: string, payload: ChannelInput) {
  return updateChannel(id, payload).then(mapChannelConfig);
}

export function updateChannelSortOrderRecord(id: string, sortOrder: number) {
  return updateChannelSortOrder(id, sortOrder).then(mapPublicChannel);
}

export function deleteChannelRecord(id: string) {
  return deleteChannel(id);
}
