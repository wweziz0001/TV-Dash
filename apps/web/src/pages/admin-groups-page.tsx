import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type { ChannelGroup } from "@/types/api";

const emptyForm = {
  name: "",
  slug: "",
  sortOrder: 0,
};

export function AdminGroupsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
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
    mutationFn: async (id: string) => {
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

  const totalChannels = useMemo(
    () => (groupsQuery.data ?? []).reduce((total, group) => total + (group._count?.channels ?? 0), 0),
    [groupsQuery.data],
  );

  function editGroup(group: ChannelGroup) {
    setEditingGroupId(group.id);
    setForm({
      name: group.name,
      slug: group.slug,
      sortOrder: group.sortOrder,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Channel group management"
        description="Organize feeds into business-friendly categories for browse filters and operator workflows."
      />

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            {editingGroupId ? "Edit Group" : "Create Group"}
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-slate-400" htmlFor="group-name">
                Name
              </label>
              <Input
                id="group-name"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                value={form.name}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-400" htmlFor="group-slug">
                Slug
              </label>
              <Input
                id="group-slug"
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                value={form.slug}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-400" htmlFor="group-order">
                Sort order
              </label>
              <Input
                id="group-order"
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                type="number"
                value={form.sortOrder}
              />
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => saveMutation.mutate()} type="button">
                {editingGroupId ? "Update group" : "Create group"}
              </Button>
              {editingGroupId ? (
                <Button
                  className="flex-1"
                  onClick={() => {
                    setEditingGroupId(null);
                    setForm(emptyForm);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Catalog</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{groupsQuery.data?.length ?? 0} group(s)</h2>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
              {totalChannels} mapped channels
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(groupsQuery.data ?? []).map((group) => (
              <div
                key={group.id}
                className="flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">{group.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {group.slug} · {group._count?.channels ?? 0} channel(s)
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => editGroup(group)} variant="secondary">
                    Edit
                  </Button>
                  <Button onClick={() => deleteMutation.mutate(group.id)} variant="danger">
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
