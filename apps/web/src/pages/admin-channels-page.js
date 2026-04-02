import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, PlayCircle, TestTube2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { HlsPlayer } from "@/components/player/hls-player";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
const emptyForm = {
    name: "",
    slug: "",
    logoUrl: "",
    groupId: "",
    masterHlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    isActive: true,
    sortOrder: 0,
};
export function AdminChannelsPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [editingChannelId, setEditingChannelId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [previewQualities, setPreviewQualities] = useState([
        { value: "AUTO", label: "Auto", height: null },
    ]);
    const [previewSelectedQuality, setPreviewSelectedQuality] = useState("AUTO");
    const [streamResult, setStreamResult] = useState(null);
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
    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!token) {
                throw new Error("Missing session");
            }
            const payload = {
                ...form,
                groupId: form.groupId || null,
                sortOrder: Number(form.sortOrder),
            };
            if (editingChannelId) {
                return api.updateChannel(editingChannelId, payload, token);
            }
            return api.createChannel(payload, token);
        },
        onSuccess: () => {
            toast.success(editingChannelId ? "Channel updated" : "Channel created");
            setEditingChannelId(null);
            setForm(emptyForm);
            setStreamResult(null);
            void queryClient.invalidateQueries({ queryKey: ["channels", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save channel");
        },
    });
    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            if (!token) {
                throw new Error("Missing session");
            }
            await api.deleteChannel(id, token);
        },
        onSuccess: () => {
            toast.success("Channel deleted");
            void queryClient.invalidateQueries({ queryKey: ["channels", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to delete channel");
        },
    });
    const streamTestMutation = useMutation({
        mutationFn: async () => {
            if (!token) {
                throw new Error("Missing session");
            }
            return api.testStream(form.masterHlsUrl, token);
        },
        onSuccess: (response) => {
            setStreamResult(response.result);
            toast.success("Stream test completed");
        },
        onError: (error) => {
            setStreamResult(null);
            toast.error(error instanceof Error ? error.message : "Stream test failed");
        },
    });
    const sortedChannels = useMemo(() => [...(channelsQuery.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder), [channelsQuery.data]);
    function editChannel(channel) {
        setEditingChannelId(channel.id);
        setForm({
            name: channel.name,
            slug: channel.slug,
            logoUrl: channel.logoUrl ?? "",
            groupId: channel.groupId ?? "",
            masterHlsUrl: channel.masterHlsUrl,
            isActive: channel.isActive,
            sortOrder: channel.sortOrder,
        });
        setStreamResult(null);
    }
    async function moveChannel(channel, direction) {
        if (!token) {
            return;
        }
        const currentIndex = sortedChannels.findIndex((entry) => entry.id === channel.id);
        const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        const target = sortedChannels[swapIndex];
        if (currentIndex < 0 || !target) {
            return;
        }
        try {
            await api.updateChannel(channel.id, {
                ...channel,
                sortOrder: target.sortOrder,
            }, token);
            await api.updateChannel(target.id, {
                ...target,
                groupId: target.groupId,
                sortOrder: channel.sortOrder,
            }, token);
            toast.success("Channel order updated");
            void queryClient.invalidateQueries({ queryKey: ["channels", token] });
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to reorder channels");
        }
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PageHeader, { eyebrow: "Admin", title: "Channel management", description: "Store each channel as one logical feed backed by a master HLS URL. Operators pick quality inside the player, not via duplicate channel rows." }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-[0.85fr_1.15fr]", children: [_jsxs(Panel, { className: "space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: editingChannelId ? "Edit Channel" : "Create Channel" }), _jsx("p", { className: "mt-2 text-sm text-slate-400", children: "Master playlist URL only. Quality variants are discovered by HLS.js." })] }), _jsxs(Button, { onClick: () => streamTestMutation.mutate(), variant: "secondary", children: [_jsx(TestTube2, { className: "h-4 w-4" }), "Test stream"] })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(Field, { label: "Name", children: _jsx(Input, { onChange: (event) => setForm((current) => ({ ...current, name: event.target.value })), value: form.name }) }), _jsx(Field, { label: "Slug", children: _jsx(Input, { onChange: (event) => setForm((current) => ({ ...current, slug: event.target.value })), value: form.slug }) }), _jsx(Field, { label: "Logo URL", children: _jsx(Input, { onChange: (event) => setForm((current) => ({ ...current, logoUrl: event.target.value })), value: form.logoUrl }) }), _jsx(Field, { label: "Group", children: _jsxs(Select, { onChange: (event) => setForm((current) => ({ ...current, groupId: event.target.value })), value: form.groupId, children: [_jsx("option", { value: "", children: "Ungrouped" }), (groupsQuery.data ?? []).map((group) => (_jsx("option", { value: group.id, children: group.name }, group.id)))] }) })] }), _jsx(Field, { label: "Master HLS URL", children: _jsx(Input, { onChange: (event) => setForm((current) => ({ ...current, masterHlsUrl: event.target.value })), value: form.masterHlsUrl }) }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(Field, { label: "Sort order", children: _jsx(Input, { onChange: (event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) })), type: "number", value: form.sortOrder }) }), _jsx(Field, { label: "Status", children: _jsxs(Select, { onChange: (event) => setForm((current) => ({ ...current, isActive: event.target.value === "true" })), value: String(form.isActive), children: [_jsx("option", { value: "true", children: "Active" }), _jsx("option", { value: "false", children: "Inactive" })] }) })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { className: "flex-1", onClick: () => saveMutation.mutate(), children: editingChannelId ? "Update channel" : "Create channel" }), editingChannelId ? (_jsx(Button, { className: "flex-1", onClick: () => {
                                            setEditingChannelId(null);
                                            setForm(emptyForm);
                                            setStreamResult(null);
                                        }, variant: "secondary", children: "Cancel" })) : null] }), streamResult ? (_jsxs("div", { className: "rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4", children: [_jsx("p", { className: "text-sm font-semibold text-white", children: "Stream test result" }), _jsxs("p", { className: "mt-2 text-sm text-slate-400", children: [streamResult.isMasterPlaylist ? "Master playlist detected" : "No variants detected", " \u00B7", " ", streamResult.variantCount, " variant(s)"] }), _jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: streamResult.variants.map((variant) => (_jsx("span", { className: "rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100", children: variant.label }, `${variant.label}-${variant.bandwidth}`))) })] })) : null, _jsxs("div", { children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-semibold text-white", children: "Preview player" }), _jsx(Select, { className: "max-w-[180px]", onChange: (event) => setPreviewSelectedQuality(event.target.value), value: previewSelectedQuality, children: previewQualities.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsx("div", { className: "h-[280px]", children: _jsx(HlsPlayer, { autoPlay: true, muted: true, onQualityOptionsChange: setPreviewQualities, onSelectedQualityChange: setPreviewSelectedQuality, preferredQuality: previewSelectedQuality, src: form.masterHlsUrl, title: form.name || "Preview" }) })] })] }), _jsxs(Panel, { children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Current Channels" }), _jsxs("h2", { className: "mt-2 text-xl font-semibold text-white", children: [sortedChannels.length, " logical channel(s)"] })] }), _jsx("div", { className: "rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300", children: "Sorted for operator browse order" })] }), _jsx("div", { className: "mt-5 space-y-3", children: sortedChannels.map((channel) => (_jsx("div", { className: "rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4", children: _jsxs("div", { className: "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold text-white", children: channel.name }), _jsxs("p", { className: "mt-1 text-sm text-slate-400", children: [channel.group?.name ?? "Ungrouped", " \u00B7 order ", channel.sortOrder, " \u00B7 ", channel.isActive ? "active" : "inactive"] }), _jsx("p", { className: "mt-2 text-xs text-slate-500", children: channel.masterHlsUrl })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx(Button, { onClick: () => moveChannel(channel, "up"), variant: "secondary", children: _jsx(ArrowUp, { className: "h-4 w-4" }) }), _jsx(Button, { onClick: () => moveChannel(channel, "down"), variant: "secondary", children: _jsx(ArrowDown, { className: "h-4 w-4" }) }), _jsx(Button, { onClick: () => editChannel(channel), variant: "secondary", children: "Edit" }), _jsx(Button, { onClick: () => deleteMutation.mutate(channel.id), variant: "danger", children: "Delete" }), _jsxs(Button, { onClick: () => {
                                                            setForm({
                                                                name: channel.name,
                                                                slug: channel.slug,
                                                                logoUrl: channel.logoUrl ?? "",
                                                                groupId: channel.groupId ?? "",
                                                                masterHlsUrl: channel.masterHlsUrl,
                                                                isActive: channel.isActive,
                                                                sortOrder: channel.sortOrder,
                                                            });
                                                        }, variant: "ghost", children: [_jsx(PlayCircle, { className: "h-4 w-4" }), "Preview"] })] })] }) }, channel.id))) })] })] })] }));
}
function Field({ label, children }) {
    return (_jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", children: label }), children] }));
}
