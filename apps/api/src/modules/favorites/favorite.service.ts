import { deleteFavorite, listFavorites, upsertFavorite } from "./favorite.repository.js";
import { mapPublicChannel } from "../channels/channel-mappers.js";

export function listUserFavorites(userId: string) {
  return listFavorites(userId).then((favorites) =>
    favorites.map((favorite) => ({
      ...favorite,
      channel: mapPublicChannel(favorite.channel),
    })),
  );
}

export function saveFavorite(userId: string, channelId: string) {
  return upsertFavorite(userId, channelId).then((favorite) => ({
    ...favorite,
    channel: mapPublicChannel(favorite.channel),
  }));
}

export function removeFavorite(userId: string, channelId: string) {
  return deleteFavorite(userId, channelId);
}
