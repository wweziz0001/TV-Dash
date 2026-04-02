import { useMemo, useState } from "react";
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
import { api } from "@/lib/api";
import type { Channel } from "@/lib/types";

export function DashboardPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("ALL");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

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

      if (!search.trim()) {
        return true;
      }

      const term = search.trim().toLowerCase();
      return channel.name.toLowerCase().includes(term) || channel.slug.toLowerCase().includes(term);
    });
  }, [channelsQuery.data, favoriteIds, groupId, search, showFavoritesOnly]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Browse"
        title="Channel operations dashboard"
        description="Filter by category, jump into a single channel, or send a feed straight into a multi-view wall."
        actions={
          <Button onClick={() => setShowFavoritesOnly((value) => !value)} variant="secondary">
            <Star className="h-4 w-4" />
            {showFavoritesOnly ? "Show all channels" : "Favorites only"}
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.7fr_0.5fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-11"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels by name or slug"
              value={search}
            />
          </div>
          <Select onChange={(event) => setGroupId(event.target.value)} value={groupId}>
            <option value="ALL">All groups</option>
            {(groupsQuery.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
          <Panel className="flex items-center gap-3 border-cyan-400/10 bg-cyan-500/5 p-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Visible</p>
              <p className="text-sm font-semibold text-white">{filteredChannels.length} channels</p>
            </div>
          </Panel>
        </div>
      </PageHeader>

      {favoritesQuery.data?.length ? (
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Favorites</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Pinned feeds for quick access</h2>
            </div>
            <p className="text-sm text-slate-400">{favoritesQuery.data.length} channel(s)</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {favoritesQuery.data.map((favorite) => (
              <Button
                key={favorite.id}
                onClick={() => favoriteMutation.mutate({ channel: favorite.channel, isFavorite: true })}
                variant="secondary"
              >
                <Star className="h-4 w-4 text-amber-300" />
                {favorite.channel.name}
              </Button>
            ))}
          </div>
        </Panel>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filteredChannels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
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
        <Panel className="text-center">
          <p className="text-lg font-semibold text-white">No channels matched the current filters.</p>
          <p className="mt-2 text-sm text-slate-400">Try a different group, clear the search, or disable favorites-only mode.</p>
        </Panel>
      ) : null}
    </div>
  );
}
