import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Sparkles, Star } from "lucide-react";
import { toast } from "react-hot-toast";
import { ChannelCard } from "@/components/channels/channel-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type { Channel } from "@/types/api";

export function DashboardPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("ALL");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["groups", token],
    queryFn: async () => (await api.listGroups(token)).groups,
    enabled: Boolean(token),
  });

  const favoritesQuery = useQuery({
    queryKey: ["favorites", token],
    queryFn: async () => (await api.listFavorites(token!)).favorites,
    enabled: Boolean(token),
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ channel, isFavorite }: { channel: Channel; isFavorite: boolean }) => {
      if (!token) {
        throw new Error("Missing session");
      }
      if (isFavorite) {
        await api.removeFavorite(channel.id, token);
        return;
      }
      await api.addFavorite(channel.id, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update favorites");
    },
  });

  const favoriteIds = useMemo(
    () => new Set((favoritesQuery.data ?? []).map((favorite) => favorite.channelId)),
    [favoritesQuery.data],
  );

  const filteredChannels = useMemo(() => {
    return (channelsQuery.data ?? []).filter((channel) => {
      if (groupId !== "ALL" && channel.groupId !== groupId) {
        return false;
      }

      if (showFavoritesOnly && !favoriteIds.has(channel.id)) {
        return false;
      }

      if (!deferredSearch.trim()) {
        return true;
      }

      const term = deferredSearch.trim().toLowerCase();
      return channel.name.toLowerCase().includes(term) || channel.slug.toLowerCase().includes(term);
    });
  }, [channelsQuery.data, deferredSearch, favoriteIds, groupId, showFavoritesOnly]);

  const nowNextQuery = useQuery({
    queryKey: ["dashboard-now-next", token, groupId, showFavoritesOnly, deferredSearch],
    queryFn: async () => {
      const channelIds = filteredChannels.map((channel) => channel.id);

      if (!token || !channelIds.length) {
        return [];
      }

      return (await api.getNowNext(channelIds, token)).items;
    },
    enabled: Boolean(token && filteredChannels.length),
  });

  const nowNextByChannelId = useMemo(
    () => new Map((nowNextQuery.data ?? []).map((item) => [item.channelId, item])),
    [nowNextQuery.data],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        density="compact"
        eyebrow="Browse"
        title="Channel operations dashboard"
        description="Filter by category, jump into a single channel, or send a feed straight into a multi-view wall."
        actions={
          <Button className="w-full sm:w-auto" onClick={() => setShowFavoritesOnly((value) => !value)} size="sm" variant="secondary">
            <Star className="h-4 w-4" />
            {showFavoritesOnly ? "Show all channels" : "Favorites only"}
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[1.5fr_0.7fr_0.45fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              uiSize="sm"
              className="pl-11"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels by name or slug"
              value={search}
            />
          </div>
          <Select onChange={(event) => setGroupId(event.target.value)} uiSize="sm" value={groupId}>
            <option value="ALL">All groups</option>
            {(groupsQuery.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
          <Panel className="flex items-center gap-2.5 border-cyan-400/10 bg-cyan-500/5 p-2.5 md:col-span-2 2xl:col-span-1" density="compact">
            <Sparkles className="h-4 w-4 text-accent" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Visible</p>
              <p className="text-[13px] font-semibold text-white">{filteredChannels.length} channels</p>
              <p className="text-[10px] text-slate-500">
                {nowNextQuery.isLoading ? "Refreshing guide context..." : "Guide context follows the visible list."}
              </p>
            </div>
          </Panel>
        </div>
      </PageHeader>

      {favoritesQuery.data?.length ? (
        <Panel density="compact">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Favorites</p>
              <h2 className="mt-1 text-base font-semibold text-white">Pinned feeds for quick access</h2>
            </div>
            <p className="text-[13px] text-slate-400">{favoritesQuery.data.length} channel(s)</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {favoritesQuery.data.map((favorite) => (
              <Button
                key={favorite.id}
                onClick={() => favoriteMutation.mutate({ channel: favorite.channel, isFavorite: true })}
                size="sm"
                variant="secondary"
              >
                <Star className="h-4 w-4 text-amber-300" />
                {favorite.channel.name}
              </Button>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel density="compact">
          <p className="text-base font-semibold text-white">No favorites pinned yet.</p>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Star the channels you switch to most often and they will stay one click away for this operator account.
          </p>
        </Panel>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredChannels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            guide={nowNextByChannelId.get(channel.id)}
            isFavorite={favoriteIds.has(channel.id)}
            onToggleFavorite={(selectedChannel) =>
              favoriteMutation.mutate({
                channel: selectedChannel,
                isFavorite: favoriteIds.has(selectedChannel.id),
              })
            }
          />
        ))}
      </section>

      {!channelsQuery.isLoading && filteredChannels.length === 0 ? (
        <Panel className="text-center" density="compact">
          <p className="text-base font-semibold text-white">No channels matched the current filters.</p>
          <p className="mt-1.5 text-[13px] text-slate-400">Try a different group, clear the search, or disable favorites-only mode.</p>
        </Panel>
      ) : null}
    </div>
  );
}
