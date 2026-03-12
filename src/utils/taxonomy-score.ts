import type {
  DetectedEntity,
  DetectedEntityEvidence,
  DocumentTaxonomyClassification,
  DocumentTaxonomyInput,
  DomainKeywordConfig,
  EntityKeywordRule,
  EventTypeKeywordConfig,
  KeywordRule,
  NewsProvider,
  TaxonomyCategoryScore,
  TaxonomyKeywordMatch
} from '../types';

const LOW_SIGNAL_WEIGHT = 1.5;
const HIGH_CONFIDENCE_WEIGHT = 3.5;
const VERY_STRONG_WEIGHT = 4.5;
const DECISIVE_WEIGHT = 4.8;
const SUPPRESSED_MULTIPLIER = 0.2;
const MAX_ENTITY_SIGNAL_BONUS = 2.5;

type SourceField = 'title' | 'summary' | 'body';

interface MatchEvidence {
  matchedText: string | null;
  matchStart: number | null;
  matchEnd: number | null;
  sourceField: SourceField | null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toInputFields(input: string | DocumentTaxonomyInput): Record<SourceField, string> {
  if (typeof input === 'string') {
    return { title: '', summary: '', body: input };
  }

  return {
    title: (input.title || '').trim(),
    summary: (input.summary || '').trim(),
    body: (input.body || '').trim()
  };
}

function findRuleMatchInField(text: string, rule: KeywordRule): MatchEvidence | null {
  if (!text || !rule.keyword) return null;

  const normalizedKeyword = normalizeText(rule.keyword);
  if (!normalizedKeyword) return null;

  if (rule.matchType === 'regex') {
    try {
      const regex = new RegExp(rule.keyword, 'i');
      const match = regex.exec(text);
      if (!match) return null;
      return {
        matchedText: match[0] || null,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        sourceField: null
      };
    } catch {
      return null;
    }
  }

  const keywordTokens = normalizedKeyword.split(' ').filter(Boolean);

  if (rule.matchType === 'prefix') {
    const tokenRegex = /\b[\p{L}\p{N}_-]+\b/gu;
    let tokenMatch = tokenRegex.exec(text);
    while (tokenMatch) {
      const token = tokenMatch[0].toLowerCase();
      if (keywordTokens.some((keyword) => token.startsWith(keyword))) {
        return {
          matchedText: tokenMatch[0],
          matchStart: tokenMatch.index,
          matchEnd: tokenMatch.index + tokenMatch[0].length,
          sourceField: null
        };
      }
      tokenMatch = tokenRegex.exec(text);
    }
    return null;
  }

  if (keywordTokens.length === 1 || rule.matchType === 'exact') {
    const pattern = new RegExp(`\\b${escapeRegex(rule.keyword)}\\b`, 'i');
    const match = pattern.exec(text);
    if (!match) return null;
    return {
      matchedText: match[0] || null,
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
      sourceField: null
    };
  }

  const lowerText = text.toLowerCase();
  const lowerKeyword = rule.keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);
  if (index === -1) return null;
  return {
    matchedText: text.slice(index, index + rule.keyword.length),
    matchStart: index,
    matchEnd: index + rule.keyword.length,
    sourceField: null
  };
}

function findEntityRuleMatchInField(text: string, rule: EntityKeywordRule): MatchEvidence | null {
  return findRuleMatchInField(text, {
    id: rule.id,
    categoryId: -1,
    keyword: rule.keyword,
    matchType: rule.matchType,
    weight: rule.weight
  });
}

function findRuleMatch(fields: Record<SourceField, string>, rule: KeywordRule): MatchEvidence | null {
  for (const sourceField of ['title', 'summary', 'body'] as const) {
    const evidence = findRuleMatchInField(fields[sourceField], rule);
    if (evidence) {
      return { ...evidence, sourceField };
    }
  }

  return null;
}

function findEntityRuleMatch(fields: Record<SourceField, string>, rule: EntityKeywordRule): MatchEvidence | null {
  for (const sourceField of ['title', 'summary', 'body'] as const) {
    const evidence = findEntityRuleMatchInField(fields[sourceField], rule);
    if (evidence) {
      return { ...evidence, sourceField };
    }
  }

  return null;
}

function computeDiversityBonus(distinctMatches: number): number {
  if (distinctMatches >= 4) return 1.5;
  if (distinctMatches === 3) return 1;
  if (distinctMatches === 2) return 0.5;
  return 0;
}

function computeStrongSignalBonus(weights: number[]): number {
  const veryStrongCount = weights.filter((weight) => weight >= VERY_STRONG_WEIGHT).length;
  const strongCount = weights.filter((weight) => weight >= 4).length;

  if (strongCount >= 2) return 1;
  if (veryStrongCount >= 1) return 0.5;
  return 0;
}

function isKeywordSuppressed(rule: KeywordRule, matchedRules: KeywordRule[]): boolean {
  const normalizedKeyword = normalizeText(rule.keyword);
  if (!normalizedKeyword) return false;

  return matchedRules.some((candidate) => {
    if (candidate.id === rule.id) return false;
    if (candidate.weight < rule.weight) return false;

    const normalizedCandidate = normalizeText(candidate.keyword);
    if (!normalizedCandidate || normalizedCandidate === normalizedKeyword) return false;

    return normalizedCandidate.includes(normalizedKeyword);
  });
}

export function detectDocumentEntities(input: string | DocumentTaxonomyInput, rules: EntityKeywordRule[]): DetectedEntity[] {
  const fields = toInputFields(input);
  const combinedText = [fields.title, fields.summary, fields.body].filter(Boolean).join(' ');
  if (!combinedText || rules.length === 0) return [];

  const uniqueRules = new Map<string, EntityKeywordRule>();
  for (const rule of rules) {
    const normalizedKeyword = normalizeText(rule.keyword);
    if (!normalizedKeyword) continue;
    const dedupeKey = `${rule.entityType}::${rule.canonicalName.trim().toLowerCase()}::${normalizedKeyword}::${rule.matchType}`;
    const current = uniqueRules.get(dedupeKey);
    if (!current || current.weight < rule.weight || (current.weight === rule.weight && current.id > rule.id)) {
      uniqueRules.set(dedupeKey, rule);
    }
  }

  const grouped = new Map<string, { entityType: EntityKeywordRule['entityType']; canonicalName: string; evidence: DetectedEntityEvidence[] }>();

  for (const rule of uniqueRules.values()) {
    const evidence = findEntityRuleMatch(fields, rule);
    if (!evidence) continue;

    const key = `${rule.entityType}::${rule.canonicalName.trim().toLowerCase()}`;
    const current = grouped.get(key) ?? {
      entityType: rule.entityType,
      canonicalName: rule.canonicalName.trim(),
      evidence: []
    };

    current.evidence.push({
      entityKeywordId: rule.id,
      matchedKeyword: rule.keyword,
      matchType: rule.matchType,
      weight: rule.weight,
      matchedText: evidence.matchedText,
      matchStart: evidence.matchStart,
      matchEnd: evidence.matchEnd,
      sourceField: evidence.sourceField
    });
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => {
      const sortedEvidence = [...group.evidence].sort((left, right) => right.weight - left.weight || left.entityKeywordId - right.entityKeywordId);
      const totalWeight = Number(sortedEvidence.reduce((sum, item) => sum + item.weight, 0).toFixed(3));
      const maxWeight = Number(Math.max(...sortedEvidence.map((item) => item.weight)).toFixed(3));
      const sourceFields = [...new Set(sortedEvidence.map((item) => item.sourceField).filter((field): field is SourceField => field !== null))];
      const matchedKeywords = [...new Set(sortedEvidence.map((item) => item.matchedKeyword))];
      const keywordIds = [...new Set(sortedEvidence.map((item) => item.entityKeywordId))];

      return {
        entityType: group.entityType,
        canonicalName: group.canonicalName,
        totalWeight,
        maxWeight,
        matchCount: sortedEvidence.length,
        keywordIds,
        matchedKeywords,
        sourceFields,
        evidence: sortedEvidence
      };
    })
    .sort(
      (left, right) =>
        right.totalWeight - left.totalWeight ||
        right.maxWeight - left.maxWeight ||
        left.canonicalName.localeCompare(right.canonicalName) ||
        left.entityType.localeCompare(right.entityType)
    );
}

function computeEntitySignal(entities: DetectedEntity[]): number {
  if (entities.length === 0) return 0;

  const weightComponent = entities.reduce((sum, entity) => sum + Math.min(entity.totalWeight, 3), 0) * 0.2;
  const diversityComponent = Math.min(entities.length, 4) * 0.15;
  const prominenceComponent = entities.some((entity) => entity.sourceFields.includes('title'))
    ? 0.35
    : entities.some((entity) => entity.sourceFields.includes('summary'))
      ? 0.2
      : 0;

  return Number(Math.min(MAX_ENTITY_SIGNAL_BONUS, weightComponent + diversityComponent + prominenceComponent).toFixed(3));
}

function buildCategoryScore(
  input: string | DocumentTaxonomyInput,
  rules: KeywordRule[],
  detectedEntities: DetectedEntity[],
  categoryMeta: {
    categoryId: number;
    categorySlug: string;
    categoryLabel: string;
  }
): TaxonomyCategoryScore {
  const fields = toInputFields(input);
  const combinedText = [fields.title, fields.summary, fields.body].filter(Boolean).join(' ');
  if (!combinedText || rules.length === 0) {
    return {
      ...categoryMeta,
      rawScore: 0,
      finalScore: 0,
      entitySignalScore: 0,
      detectedEntitiesCount: detectedEntities.length,
      matchedKeywordsCount: 0,
      strongKeywordsCount: 0,
      hasVeryStrongKeyword: false,
      assigned: false,
      matches: []
    };
  }

  const uniqueRules = new Map<string, KeywordRule>();
  for (const rule of rules) {
    const normalizedKeyword = normalizeText(rule.keyword);
    if (!normalizedKeyword) continue;
    const dedupeKey = `${normalizedKeyword}::${rule.matchType}`;
    const current = uniqueRules.get(dedupeKey);
    if (!current || current.weight < rule.weight || (current.weight === rule.weight && current.id > rule.id)) {
      uniqueRules.set(dedupeKey, rule);
    }
  }

  const matchedPairs = [...uniqueRules.values()]
    .map((rule) => ({ rule, evidence: findRuleMatch(fields, rule) }))
    .filter((pair): pair is { rule: KeywordRule; evidence: MatchEvidence } => pair.evidence !== null);

  const matchedRules = matchedPairs.map((pair) => pair.rule);
  const matches: TaxonomyKeywordMatch[] = matchedPairs.map(({ rule, evidence }) => {
    const wasSuppressed = isKeywordSuppressed(rule, matchedRules);
    return {
      keywordId: rule.id,
      keyword: rule.keyword,
      matchType: rule.matchType,
      weight: rule.weight,
      effectiveWeight: wasSuppressed ? Number((rule.weight * SUPPRESSED_MULTIPLIER).toFixed(3)) : rule.weight,
      categoryId: rule.categoryId,
      wasSuppressed,
      matchedText: evidence.matchedText,
      matchStart: evidence.matchStart,
      matchEnd: evidence.matchEnd,
      sourceField: evidence.sourceField
    };
  });

  const rawScore = Number(matches.reduce((sum, match) => sum + match.weight, 0).toFixed(3));
  const filteredScore = matches.reduce((sum, match) => sum + match.effectiveWeight, 0);
  const distinctMatches = matches.length;
  const diversityBonus = computeDiversityBonus(distinctMatches);
  const strongSignalBonus = computeStrongSignalBonus(matches.map((match) => match.weight));
  const entitySignalScore = distinctMatches > 0 ? computeEntitySignal(detectedEntities) : 0;
  const finalScore = Number((filteredScore + diversityBonus + strongSignalBonus + entitySignalScore).toFixed(3));
  const strongKeywordsCount = matches.filter((match) => match.weight >= HIGH_CONFIDENCE_WEIGHT).length;
  const hasVeryStrongKeyword = matches.some((match) => match.weight >= VERY_STRONG_WEIGHT);
  const hasDecisiveKeyword = matches.some((match) => match.weight >= DECISIVE_WEIGHT);
  const allSignalsWeak = matches.length > 0 && matches.every((match) => match.weight <= LOW_SIGNAL_WEIGHT);
  const assigned =
    !allSignalsWeak &&
    ((finalScore >= 5 && strongKeywordsCount >= 1) ||
      (finalScore >= 7 && distinctMatches >= 2) ||
      (finalScore >= 4.5 && distinctMatches >= 1 && detectedEntities.length > 0 && entitySignalScore >= 0.75) ||
      hasDecisiveKeyword);

  return {
    ...categoryMeta,
    rawScore,
    finalScore,
    entitySignalScore,
    detectedEntitiesCount: detectedEntities.length,
    matchedKeywordsCount: distinctMatches,
    strongKeywordsCount,
    hasVeryStrongKeyword,
    assigned,
    matches
  };
}

export function classifyDocumentTaxonomy(
  input: string | DocumentTaxonomyInput,
  config: DomainKeywordConfig,
  provider: NewsProvider = 'rss'
): DocumentTaxonomyClassification {
  const eventTypeScores = scoreEventTypeConfigs(input, config.eventTypes, provider, config.entityKeywordRules);
  const assignedScores = eventTypeScores.filter((score) => score.assigned);
  const primary = assignedScores[0] ?? null;
  const domainScore = Number(assignedScores.reduce((sum, score) => sum + score.finalScore, 0).toFixed(3));
  const detectedEntities = detectDocumentEntities(input, config.entityKeywordRules);

  return {
    primaryCategoryId: primary?.categoryId ?? null,
    primaryCategorySlug: primary?.categorySlug ?? null,
    domainScore,
    assigned: assignedScores.length > 0,
    detectedEntities,
    eventTypeScores
  };
}

export function scoreEventTypeConfigs(
  input: string | DocumentTaxonomyInput,
  eventTypes: EventTypeKeywordConfig[],
  provider: 'rss' | 'gdelt' = 'rss',
  entityKeywordRules?: EntityKeywordRule[]
): TaxonomyCategoryScore[] {
  const detectedEntities = detectDocumentEntities(input, entityKeywordRules ?? eventTypes[0]?.entityKeywordRules ?? []);
  return eventTypes
    .map((eventType) =>
      buildCategoryScore(
        input,
        provider === 'gdelt' ? eventType.gdeltKeywordRules : eventType.rssKeywordRules,
        detectedEntities,
        {
          categoryId: eventType.category.id,
          categorySlug: eventType.category.slug,
          categoryLabel: eventType.category.label
        }
      )
    )
    .sort((left, right) => right.finalScore - left.finalScore || right.rawScore - left.rawScore || left.categoryId - right.categoryId);
}
