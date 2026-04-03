import { getResolvedGuideForChannel } from "../epg/epg.service.js";
import {
  createManyRecordingJobs,
  listActiveRecordingRules,
  listRecordingJobsForRulesInWindow,
} from "./recording.repository.js";
import { listRecordingRuleOccurrences } from "./recording-recurrence.js";

const RECURRING_JOB_LOOKAHEAD_MS = 7 * 24 * 60 * 60_000;
const RECURRING_JOB_BACKFILL_MS = 2 * 60 * 60_000;
const RECURRING_MATCH_WINDOW_PADDING_MS = 15 * 60_000;

function buildOccurrenceKey(recordingRuleId: string, startAt: Date) {
  return `${recordingRuleId}:${startAt.toISOString()}`;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

async function findGuideProgrammeMatch(params: {
  channelId: string;
  occurrenceStartAt: Date;
  occurrenceEndAt: Date;
  matchProgramTitle: string | null;
}) {
  if (!params.matchProgramTitle) {
    return null;
  }

  const guide = await getResolvedGuideForChannel(
    params.channelId,
    new Date(params.occurrenceStartAt.getTime() - RECURRING_MATCH_WINDOW_PADDING_MS),
    new Date(params.occurrenceEndAt.getTime() + RECURRING_MATCH_WINDOW_PADDING_MS),
  );

  if (!guide) {
    return null;
  }

  const expectedTitle = normalizeText(params.matchProgramTitle);

  return (
    guide.programmes.find((programme) => {
      if (normalizeText(programme.title) !== expectedTitle) {
        return false;
      }

      const startAt = Date.parse(programme.start);
      const endAt = programme.stop ? Date.parse(programme.stop) : Number.POSITIVE_INFINITY;

      return startAt < params.occurrenceEndAt.getTime() && endAt > params.occurrenceStartAt.getTime();
    }) ?? null
  );
}

export async function syncRecurringRecordingJobs(now = new Date()) {
  const rules = await listActiveRecordingRules();

  if (rules.length === 0) {
    return {
      ruleCount: 0,
      createdCount: 0,
    };
  }

  const rangeStart = new Date(now.getTime() - RECURRING_JOB_BACKFILL_MS);
  const rangeEnd = new Date(now.getTime() + RECURRING_JOB_LOOKAHEAD_MS);
  const existingJobs = await listRecordingJobsForRulesInWindow(
    rules.map((rule) => rule.id),
    new Date(rangeStart.getTime() - 24 * 60 * 60_000),
    rangeEnd,
  );
  const existingKeys = new Set(
    existingJobs
      .filter((job) => job.recordingRuleId)
      .map((job) => buildOccurrenceKey(job.recordingRuleId ?? "", job.startAt)),
  );
  const jobsToCreate: Parameters<typeof createManyRecordingJobs>[0] = [];

  for (const rule of rules) {
    const occurrences = listRecordingRuleOccurrences(rule, {
      rangeStart,
      rangeEnd,
    });

    for (const occurrence of occurrences) {
      if (occurrence.endAt.getTime() <= now.getTime()) {
        continue;
      }

      const occurrenceKey = buildOccurrenceKey(rule.id, occurrence.startAt);

      if (existingKeys.has(occurrenceKey)) {
        continue;
      }

      const matchedProgramme = await findGuideProgrammeMatch({
        channelId: rule.channelId,
        occurrenceStartAt: occurrence.scheduledStartAt,
        occurrenceEndAt: occurrence.scheduledEndAt,
        matchProgramTitle: rule.matchProgramTitle,
      });

      jobsToCreate.push({
        channelId: rule.channel.id,
        channelNameSnapshot: rule.channel.name,
        channelSlugSnapshot: rule.channel.slug,
        programEntryId: matchedProgramme?.id ?? null,
        programTitleSnapshot: matchedProgramme?.title ?? rule.originProgramTitleSnapshot ?? null,
        programStartAt: matchedProgramme ? new Date(matchedProgramme.start) : rule.originProgramStartAt,
        programEndAt: matchedProgramme?.stop ? new Date(matchedProgramme.stop) : rule.originProgramEndAt,
        recordingRuleId: rule.id,
        recordingRuleNameSnapshot: rule.titleTemplate,
        createdByUserId: rule.createdByUserId,
        title: matchedProgramme?.title ?? rule.titleTemplate,
        requestedQualitySelector: rule.requestedQualitySelector,
        requestedQualityLabel: rule.requestedQualityLabel,
        mode: "RECURRING_RULE",
        status: occurrence.startAt.getTime() > now.getTime() ? "SCHEDULED" : "PENDING",
        paddingBeforeMinutes: rule.paddingBeforeMinutes,
        paddingAfterMinutes: rule.paddingAfterMinutes,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
      });
      existingKeys.add(occurrenceKey);
    }
  }

  const result = await createManyRecordingJobs(jobsToCreate);

  return {
    ruleCount: rules.length,
    createdCount: result.count,
  };
}
