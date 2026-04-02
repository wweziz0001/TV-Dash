import { deleteFavorite, listFavorites, upsertFavorite } from "./favorite.repository.js";

export function listUserFavorites(userId: string) {
  return listFavorites(userId);
}

export function saveFavorite(userId: string, channelId: string) {
  return upsertFavorite(userId, channelId);
}

export function removeFavorite(userId: string, channelId: string) {
  return deleteFavorite(userId, channelId);
}
