import type { ChannelGroupInput } from "@tv-dash/shared";
import { createGroup, deleteGroup, listGroups, updateGroup } from "./group.repository.js";

export function listChannelGroups() {
  return listGroups();
}

export function createChannelGroup(payload: ChannelGroupInput) {
  return createGroup(payload);
}

export function updateChannelGroup(id: string, payload: ChannelGroupInput) {
  return updateGroup(id, payload);
}

export function deleteChannelGroup(id: string) {
  return deleteGroup(id);
}
