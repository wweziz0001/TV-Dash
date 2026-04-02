import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Maximize2, Save, Trash2, Volume2, VolumeX } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { HlsPlayer } from "@/components/player/hls-player";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { getLayoutDefinition, layoutDefinitions } from "@/lib/layouts";
import { cn } from "@/lib/utils";
function buildTileDefaults(layoutType, seededChannelIds = []) {
    const tileCount = getLayoutDefinition(layoutType).tileCount;
    return Array.from({ length: tileCount }, (_, index) => ({
        channelId: seededChannelIds[index] ?? null,
        preferredQuality: index === 0 ? "AUTO" : "LOWEST",
        isMuted: index !== 0,
    }));
}
function resizeTiles(layoutType, currentTiles) {
    const nextCount = getLayoutDefinition(layoutType).tileCount;
    const nextTiles = [...currentTiles];
    if (nextTiles.length < nextCount) {
        const startingIndex = nextTiles.length;
        for (let index = startingIndex; index < nextCount; index += 1) {
            nextTiles.push({
                channelId: null,
                preferredQuality: index === 0 ? "AUTO" : "LOWEST",
                isMuted: index !== 0,
            });
        }
    }
    return nextTiles.slice(0, nextCount);
}
export function MultiViewPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const initialChannelsApplied = useRef(false);
    const tileRefs = useRef([]);
    const [layoutType, setLayoutType] = useState("LAYOUT_2X2");
    const [layoutName, setLayoutName] = useState("Ops Layout");
    const [selectedLayoutId, setSelectedLayoutId] = useState(null);
    const [tiles, setTiles] = useState(buildTileDefaults("LAYOUT_2X2"));
    const [qualityOptionsByTile, setQualityOptionsByTile] = useState({});
    const channelsQuery = useQuery({
        queryKey: ["channels", token],
        queryFn: async () => (await api.listChannels(token)).channels,
        enabled: Boolean(token),
    });
    const layoutsQuery = useQuery({
        queryKey: ["layouts", token],
        queryFn: async () => (await api.listLayouts(token)).layouts,
        enabled: Boolean(token),
    });
    useEffect(() => {
        setTiles((current) => resizeTiles(layoutType, current));
    }, [layoutType]);
    useEffect(() => {
        if (!channelsQuery.data || initialChannelsApplied.current) {
            return;
        }
        const seededIds = searchParams.get("channels")?.split(",").filter(Boolean) ?? [];
        const fallbackIds = channelsQuery.data.slice(0, getLayoutDefinition(layoutType).tileCount).map((channel) => channel.id);
        setTiles(buildTileDefaults(layoutType, seededIds.length ? seededIds : fallbackIds));
        initialChannelsApplied.current = true;
    }, [channelsQuery.data, layoutType, searchParams]);
    const saveMutation = useMutation({
        mutationFn: async (mode) => {
            if (!token) {
                throw new Error("Missing session");
            }
            const payload = {
                name: layoutName,
                layoutType,
                configJson: {
                    activeAudioTile: tiles.findIndex((tile) => !tile.isMuted),
                },
                items: tiles.map((tile, index) => ({
                    tileIndex: index,
                    channelId: tile.channelId,
                    preferredQuality: tile.preferredQuality,
                    isMuted: tile.isMuted,
                })),
            };
            if (mode === "update" && selectedLayoutId) {
                return api.updateLayout(selectedLayoutId, payload, token);
            }
            return api.createLayout(payload, token);
        },
        onSuccess: async (response) => {
            const layoutId = "layout" in response ? response.layout.id : null;
            if (layoutId) {
                setSelectedLayoutId(layoutId);
            }
            toast.success(selectedLayoutId ? "Layout updated" : "Layout saved");
            await queryClient.invalidateQueries({ queryKey: ["layouts", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save layout");
        },
    });
    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!token || !selectedLayoutId) {
                throw new Error("Select a saved layout first");
            }
            await api.deleteLayout(selectedLayoutId, token);
        },
        onSuccess: async () => {
            toast.success("Layout deleted");
            setSelectedLayoutId(null);
            setLayoutName("Ops Layout");
            await queryClient.invalidateQueries({ queryKey: ["layouts", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to delete layout");
        },
    });
    const layoutDefinition = getLayoutDefinition(layoutType);
    const activeAudioIndex = tiles.findIndex((tile) => !tile.isMuted);
    const savedLayouts = layoutsQuery.data ?? [];
    const channels = channelsQuery.data ?? [];
    const channelMap = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
    function applySavedLayout(layoutId) {
        const layout = savedLayouts.find((entry) => entry.id === layoutId);
        if (!layout) {
            return;
        }
        setSelectedLayoutId(layout.id);
        setLayoutName(layout.name);
        setLayoutType(layout.layoutType);
        const nextTiles = resizeTiles(layout.layoutType, layout.items
            .sort((left, right) => left.tileIndex - right.tileIndex)
            .map((item, index) => ({
            channelId: item.channelId,
            preferredQuality: item.preferredQuality ?? (index === 0 ? "AUTO" : "LOWEST"),
            isMuted: item.isMuted,
        })));
        setTiles(nextTiles);
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PageHeader, { eyebrow: "Multi-View", title: "Split-screen channel wall", description: "Run several channels side by side, keep one audio source active, and save layouts for recurring monitoring setups.", actions: _jsxs(_Fragment, { children: [_jsxs(Button, { onClick: () => saveMutation.mutate(selectedLayoutId ? "update" : "create"), children: [_jsx(Save, { className: "h-4 w-4" }), selectedLayoutId ? "Update layout" : "Save layout"] }), _jsxs(Button, { onClick: () => deleteMutation.mutate(), variant: "secondary", children: [_jsx(Trash2, { className: "h-4 w-4" }), "Delete"] })] }), children: _jsxs("div", { className: "grid gap-4 xl:grid-cols-[0.5fr_0.25fr_0.25fr]", children: [_jsx(Input, { onChange: (event) => setLayoutName(event.target.value), placeholder: "Layout name", value: layoutName }), _jsx(Select, { onChange: (event) => setLayoutType(event.target.value), value: layoutType, children: layoutDefinitions.map((layout) => (_jsxs("option", { value: layout.type, children: [layout.label, " \u00B7 ", layout.description] }, layout.type))) }), _jsxs(Select, { onChange: (event) => applySavedLayout(event.target.value), value: selectedLayoutId ?? "", children: [_jsx("option", { value: "", children: "Apply saved layout" }), savedLayouts.map((layout) => (_jsx("option", { value: layout.id, children: layout.name }, layout.id)))] })] }) }), _jsx(Panel, { children: _jsx("div", { className: cn("grid gap-4", layoutDefinition.containerClassName), children: tiles.map((tile, index) => {
                        const channel = tile.channelId ? channelMap.get(tile.channelId) ?? null : null;
                        const qualityOptions = qualityOptionsByTile[index] ?? [{ value: "AUTO", label: "Auto", height: null }];
                        return (_jsxs("div", { ref: (element) => {
                                tileRefs.current[index] = element;
                            }, className: cn("rounded-[1.9rem] border p-3 shadow-glow", tile.isMuted ? "border-slate-800/80 bg-slate-950/70" : "border-cyan-400/20 bg-cyan-500/5", layoutDefinition.tileClassNames[index]), children: [_jsxs("div", { className: "mb-3 flex flex-wrap gap-3", children: [_jsx("div", { className: "min-w-[220px] flex-1", children: _jsxs(Select, { onChange: (event) => setTiles((current) => current.map((entry, tileIndex) => tileIndex === index ? { ...entry, channelId: event.target.value || null } : entry)), value: tile.channelId ?? "", children: [_jsx("option", { value: "", children: "Select channel" }), channels.map((entry) => (_jsx("option", { value: entry.id, children: entry.name }, entry.id)))] }) }), _jsx("div", { className: "min-w-[160px]", children: _jsx(Select, { onChange: (event) => setTiles((current) => current.map((entry, tileIndex) => tileIndex === index ? { ...entry, preferredQuality: event.target.value } : entry)), value: tile.preferredQuality, children: qualityOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }) }), _jsxs(Button, { onClick: () => setTiles((current) => current.map((entry, tileIndex) => ({
                                                ...entry,
                                                isMuted: tileIndex === index ? !entry.isMuted : true,
                                            }))), variant: tile.isMuted ? "secondary" : "primary", children: [tile.isMuted ? _jsx(VolumeX, { className: "h-4 w-4" }) : _jsx(Volume2, { className: "h-4 w-4" }), tile.isMuted ? "Muted" : "Live audio"] }), _jsxs(Button, { onClick: () => tileRefs.current[index]?.requestFullscreen?.(), variant: "secondary", children: [_jsx(Maximize2, { className: "h-4 w-4" }), "Fullscreen"] })] }), _jsxs("div", { className: "mb-3 flex items-center justify-between gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold text-white", children: channel?.name ?? `Tile ${index + 1}` }), _jsx("p", { className: "text-slate-400", children: channel?.group?.name ?? "No channel selected" })] }), _jsx("div", { className: "rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-xs text-slate-300", children: activeAudioIndex === index ? "Audio owner" : "Background tile" })] }), _jsx("div", { className: "h-full", children: _jsx(HlsPlayer, { autoPlay: true, initialBias: tile.isMuted ? "LOWEST" : "AUTO", muted: tile.isMuted, onQualityOptionsChange: (options) => setQualityOptionsByTile((current) => ({
                                            ...current,
                                            [index]: options,
                                        })), preferredQuality: tile.preferredQuality, src: channel?.masterHlsUrl ?? null, title: channel?.name ?? `Tile ${index + 1}` }) })] }, index));
                    }) }) }), _jsx(Panel, { children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(LayoutTemplate, { className: "h-5 w-5 text-accent" }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold text-white", children: "Wall behavior" }), _jsx("p", { className: "text-sm text-slate-400", children: "Only one tile is unmuted at a time, and muted tiles bias toward lower startup quality to conserve resources." })] })] }) })] }));
}
