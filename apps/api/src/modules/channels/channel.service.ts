import type { ChannelInput } from "@tv-dash/shared";
import {
  createChannel,
  deleteChannel,
  findChannelById,
  findChannelBySlug,
  listChannels,
  updateChannel,
} from "./channel.repository.js";

export function listChannelCatalog(filters: { search?: string; groupId?: string; active?: string }) {
  return listChannels(filters);
}

export function getChannelById(id: string) {
  return findChannelById(id);
}

export function getChannelBySlug(slug: string) {
  return findChannelBySlug(slug);
}

export function createChannelRecord(payload: ChannelInput) {
  return createChannel(payload);
}

export function updateChannelRecord(id: string, payload: ChannelInput) {
  return updateChannel(id, payload);
}

export function deleteChannelRecord(id: string) {
  return deleteChannel(id);
}
