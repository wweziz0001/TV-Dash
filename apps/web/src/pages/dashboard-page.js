import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        queryFn: async () => (await api.listFavorites(token)).favorites,
        enabled: Boolean(token),
    });
    const favoriteMutation = useMutation({
        mutationFn: async ({ channel, isFavorite }) => {
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
    const favoriteIds = useMemo(() => new Set((favoritesQuery.data ?? []).map((favorite) => favorite.channelId)), [favoritesQuery.data]);
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PageHeader, { eyebrow: "Browse", title: "Channel operations dashboard", description: "Filter by category, jump into a single channel, or send a feed straight into a multi-view wall.", actions: _jsxs(Button, { onClick: () => setShowFavoritesOnly((value) => !value), variant: "secondary", children: [_jsx(Star, { className: "h-4 w-4" }), showFavoritesOnly ? "Show all channels" : "Favorites only"] }), children: _jsxs("div", { className: "grid gap-4 lg:grid-cols-[1.4fr_0.7fr_0.5fr]", children: [_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" }), _jsx(Input, { className: "pl-11", onChange: (event) => setSearch(event.target.value), placeholder: "Search channels by name or slug", value: search })] }), _jsxs(Select, { onChange: (event) => setGroupId(event.target.value), value: groupId, children: [_jsx("option", { value: "ALL", children: "All groups" }), (groupsQuery.data ?? []).map((group) => (_jsx("option", { value: group.id, children: group.name }, group.id)))] }), _jsxs(Panel, { className: "flex items-center gap-3 border-cyan-400/10 bg-cyan-500/5 p-3", children: [_jsx(Sparkles, { className: "h-5 w-5 text-accent" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.24em] text-slate-500", children: "Visible" }), _jsxs("p", { className: "text-sm font-semibold text-white", children: [filteredChannels.length, " channels"] })] })] })] }) }), favoritesQuery.data?.length ? (_jsxs(Panel, { children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Favorites" }), _jsx("h2", { className: "mt-2 text-xl font-semibold text-white", children: "Pinned feeds for quick access" })] }), _jsxs("p", { className: "text-sm text-slate-400", children: [favoritesQuery.data.length, " channel(s)"] })] }), _jsx("div", { className: "mt-5 flex flex-wrap gap-3", children: favoritesQuery.data.map((favorite) => (_jsxs(Button, { onClick: () => favoriteMutation.mutate({ channel: favorite.channel, isFavorite: true }), variant: "secondary", children: [_jsx(Star, { className: "h-4 w-4 text-amber-300" }), favorite.channel.name] }, favorite.id))) })] })) : null, _jsx("section", { className: "grid gap-4 md:grid-cols-2 2xl:grid-cols-3", children: filteredChannels.map((channel) => (_jsx(ChannelCard, { channel: channel, isFavorite: favoriteIds.has(channel.id), onToggleFavorite: (selectedChannel) => favoriteMutation.mutate({
                        channel: selectedChannel,
                        isFavorite: favoriteIds.has(selectedChannel.id),
                    }) }, channel.id))) }), !channelsQuery.isLoading && filteredChannels.length === 0 ? (_jsxs(Panel, { className: "text-center", children: [_jsx("p", { className: "text-lg font-semibold text-white", children: "No channels matched the current filters." }), _jsx("p", { className: "mt-2 text-sm text-slate-400", children: "Try a different group, clear the search, or disable favorites-only mode." })] })) : null] }));
}
