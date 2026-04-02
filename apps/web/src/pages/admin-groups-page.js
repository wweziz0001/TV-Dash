import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
const emptyForm = {
    name: "",
    slug: "",
    sortOrder: 0,
};
export function AdminGroupsPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [form, setForm] = useState(emptyForm);
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
                sortOrder: Number(form.sortOrder),
            };
            if (editingGroupId) {
                return api.updateGroup(editingGroupId, payload, token);
            }
            return api.createGroup(payload, token);
        },
        onSuccess: () => {
            toast.success(editingGroupId ? "Group updated" : "Group created");
            setEditingGroupId(null);
            setForm(emptyForm);
            void queryClient.invalidateQueries({ queryKey: ["groups", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save group");
        },
    });
    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            if (!token) {
                throw new Error("Missing session");
            }
            await api.deleteGroup(id, token);
        },
        onSuccess: () => {
            toast.success("Group deleted");
            if (editingGroupId) {
                setEditingGroupId(null);
                setForm(emptyForm);
            }
            void queryClient.invalidateQueries({ queryKey: ["groups", token] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to delete group");
        },
    });
    const totalChannels = useMemo(() => (groupsQuery.data ?? []).reduce((total, group) => total + (group._count?.channels ?? 0), 0), [groupsQuery.data]);
    function editGroup(group) {
        setEditingGroupId(group.id);
        setForm({
            name: group.name,
            slug: group.slug,
            sortOrder: group.sortOrder,
        });
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(PageHeader, { eyebrow: "Admin", title: "Channel group management", description: "Organize feeds into business-friendly categories for browse filters and operator workflows." }), _jsxs("div", { className: "grid gap-6 xl:grid-cols-[0.75fr_1.25fr]", children: [_jsxs(Panel, { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: editingGroupId ? "Edit Group" : "Create Group" }), _jsxs("div", { className: "mt-5 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "group-name", children: "Name" }), _jsx(Input, { id: "group-name", onChange: (event) => setForm((current) => ({ ...current, name: event.target.value })), value: form.name })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "group-slug", children: "Slug" }), _jsx(Input, { id: "group-slug", onChange: (event) => setForm((current) => ({ ...current, slug: event.target.value })), value: form.slug })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "group-order", children: "Sort order" }), _jsx(Input, { id: "group-order", onChange: (event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) })), type: "number", value: form.sortOrder })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { className: "flex-1", onClick: () => saveMutation.mutate(), type: "button", children: editingGroupId ? "Update group" : "Create group" }), editingGroupId ? (_jsx(Button, { className: "flex-1", onClick: () => {
                                                    setEditingGroupId(null);
                                                    setForm(emptyForm);
                                                }, type: "button", variant: "secondary", children: "Cancel" })) : null] })] })] }), _jsxs(Panel, { children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Catalog" }), _jsxs("h2", { className: "mt-2 text-xl font-semibold text-white", children: [groupsQuery.data?.length ?? 0, " group(s)"] })] }), _jsxs("div", { className: "rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300", children: [totalChannels, " mapped channels"] })] }), _jsx("div", { className: "mt-5 space-y-3", children: (groupsQuery.data ?? []).map((group) => (_jsxs("div", { className: "flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4 lg:flex-row lg:items-center lg:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold text-white", children: group.name }), _jsxs("p", { className: "mt-1 text-sm text-slate-400", children: [group.slug, " \u00B7 ", group._count?.channels ?? 0, " channel(s)"] })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { onClick: () => editGroup(group), variant: "secondary", children: "Edit" }), _jsx(Button, { onClick: () => deleteMutation.mutate(group.id), variant: "danger", children: "Delete" })] })] }, group.id))) })] })] })] }));
}
