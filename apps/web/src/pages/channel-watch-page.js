import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutTemplate, Tv } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { HlsPlayer } from "@/components/player/hls-player";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
export function ChannelWatchPage() {
    const { slug = "" } = useParams();
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [qualities, setQualities] = useState([{ value: "AUTO", label: "Auto", height: null }]);
    const [selectedQuality, setSelectedQuality] = useState("AUTO");
    const [playerStatus, setPlayerStatus] = useState("idle");
    const channelQuery = useQuery({
        queryKey: ["channel", slug, token],
        queryFn: async () => (await api.getChannelBySlug(slug, token)).channel,
        enabled: Boolean(token && slug),
    });
    const favoritesQuery = useQuery({
        queryKey: ["favorites", token],
        queryFn: async () => (await api.listFavorites(token)).favorites,
        enabled: Boolean(token),
    });
    const favoriteMutation = useMutation({
        mutationFn: async (isFavorite) => {
            if (!token || !channelQuery.data) {
                throw new Error("Missing channel context");
            }
            if (isFavorite) {
                await api.removeFavorite(channelQuery.data.id, token);
            }
            else {
                await api.addFavorite(channelQuery.data.id, token);
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["favorites", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to update favorites");
        },
    });
    const isFavorite = useMemo(() => {
        return (favoritesQuery.data ?? []).some((favorite) => favorite.channelId === channelQuery.data?.id);
    }, [channelQuery.data?.id, favoritesQuery.data]);
    if (!channelQuery.data) {
        return (_jsx(Panel, { children: _jsx("p", { className: "text-sm text-slate-400", children: "Loading channel..." }) }));
    }
    const channel = channelQuery.data;
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PageHeader, { eyebrow: "Single View", title: channel.name, description: "Real HLS playback with manual quality switching while keeping Auto mode available.", actions: _jsxs(_Fragment, { children: [_jsxs(Button, { onClick: () => favoriteMutation.mutate(isFavorite), variant: isFavorite ? "primary" : "secondary", children: [_jsx(Heart, { className: isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4" }), isFavorite ? "Favorited" : "Add favorite"] }), _jsx(Link, { to: `/multiview?channels=${channel.id}`, children: _jsxs(Button, { variant: "secondary", children: [_jsx(LayoutTemplate, { className: "h-4 w-4" }), "Open in Multi-View"] }) })] }) }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-[1.5fr_0.5fr]", children: [_jsx(Panel, { className: "p-3", children: _jsx("div", { className: "h-[68vh]", children: _jsx(HlsPlayer, { autoPlay: true, muted: false, onQualityOptionsChange: setQualities, onSelectedQualityChange: setSelectedQuality, onStatusChange: setPlayerStatus, preferredQuality: selectedQuality, src: channel.masterHlsUrl, title: channel.name }) }) }), _jsxs("div", { className: "space-y-6", children: [_jsxs(Panel, { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Playback Controls" }), _jsxs("div", { className: "mt-4 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "quality", children: "Quality" }), _jsx(Select, { id: "quality", onChange: (event) => setSelectedQuality(event.target.value), value: selectedQuality, children: qualities.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsxs("div", { className: "rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4", children: [_jsx("p", { className: "text-sm font-semibold text-white", children: "Current state" }), _jsx("p", { className: "mt-2 text-sm text-slate-400", children: playerStatus })] })] })] }), _jsxs(Panel, { children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Tv, { className: "h-5 w-5 text-accent" }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold text-white", children: channel.group?.name ?? "Ungrouped" }), _jsxs("p", { className: "text-sm text-slate-400", children: ["Slug: ", channel.slug] })] })] }), _jsxs("div", { className: "mt-4 space-y-3 text-sm text-slate-400", children: [_jsx("p", { children: "Master HLS URL" }), _jsx("p", { className: "rounded-2xl bg-slate-950/80 p-3 font-mono text-xs text-slate-300", children: channel.masterHlsUrl })] })] })] })] })] }));
}
