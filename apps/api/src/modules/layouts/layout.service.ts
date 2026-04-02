import type { SavedLayoutInput } from "@tv-dash/shared";
import {
  createLayout,
  deleteLayout,
  findOwnedLayout,
  listLayouts,
  updateLayout,
} from "./layout.repository.js";

export function listUserLayouts(userId: string) {
  return listLayouts(userId);
}

export function getOwnedLayout(id: string, userId: string) {
  return findOwnedLayout(id, userId);
}

export function createUserLayout(userId: string, payload: SavedLayoutInput) {
  return createLayout(userId, payload);
}

export function updateUserLayout(id: string, payload: SavedLayoutInput) {
  return updateLayout(id, payload);
}

export function deleteUserLayout(id: string) {
  return deleteLayout(id);
}
