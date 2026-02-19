import type {
  BenchmarkPerModelSummary,
  BenchmarkRunSnapshot,
  CompareResult,
  CompareWeights,
  ExpectedOutcome,
  PredictedOutcome,
} from "@/lib/comparator/types"

type SnapshotCaseInput = {
  id: string
  label: string
  status: "idle" | "running" | "done" | "error"
  expectedOutcome: ExpectedOutcome
  result: CompareResult | null
  error: string | null
  durationMs: number | null
}

type BuildSnapshotOptions = {
  cases: SnapshotCaseInput[]
  threshold: number
  weights: CompareWeights
  modelIds: string[]
}

export function predictedOutcomeFromScore(
  score: number,
  threshold: number
): PredictedOutcome {
  return score >= threshold ? "match" : "non-match"
}

export function isCorrectOutcome(
  expected: ExpectedOutcome,
  predicted: PredictedOutcome
) {
  return expected === predicted
}

export function buildBenchmarkRunSnapshot({
  cases,
  threshold,
  weights,
  modelIds,
}: BuildSnapshotOptions): BenchmarkRunSnapshot {
  const finalized = cases.filter((item) => item.status === "done" || item.status === "error")
  const caseOutcomes: BenchmarkRunSnapshot["caseOutcomes"] = finalized.map((item) => {
    if (item.status === "error" || !item.result) {
      return {
        caseId: item.id,
        label: item.label,
        status: "error",
        expectedOutcome: item.expectedOutcome,
        predictedOutcome: null,
        correct: null,
        hybridSimilarity: null,
        totalLatencyMs: item.durationMs,
        error: item.error,
        failingModels: [],
        perModelOutcomes: [],
      }
    }

    const predicted = predictedOutcomeFromScore(item.result.hybridSimilarity, threshold)
    const correct = isCorrectOutcome(item.expectedOutcome, predicted)
    const perModelOutcomes = item.result.perModelScores.map((model) => {
      const modelPredicted = predictedOutcomeFromScore(model.hybridSimilarity, threshold)
      return {
        modelId: model.modelId,
        predictedOutcome: modelPredicted,
        correct: isCorrectOutcome(item.expectedOutcome, modelPredicted),
        hybridSimilarity: model.hybridSimilarity,
        latencyMs: model.latencyMs,
      }
    })

    return {
      caseId: item.id,
      label: item.label,
      status: "done",
      expectedOutcome: item.expectedOutcome,
      predictedOutcome: predicted,
      correct,
      hybridSimilarity: item.result.hybridSimilarity,
      totalLatencyMs: item.result.timingsMs.total || item.durationMs,
      error: null,
      failingModels: perModelOutcomes
        .filter((model) => !model.correct)
        .map((model) => model.modelId),
      perModelOutcomes,
    }
  })

  const correctCount = caseOutcomes.filter((item) => item.correct === true).length
  const incorrectCount = caseOutcomes.filter((item) => item.correct === false).length
  const perModelMap = new Map<
    string,
    { total: number; correct: number; incorrect: number; latencySum: number; latencyCount: number }
  >()

  for (const caseOutcome of caseOutcomes) {
    for (const modelOutcome of caseOutcome.perModelOutcomes) {
      const existing = perModelMap.get(modelOutcome.modelId) ?? {
        total: 0,
        correct: 0,
        incorrect: 0,
        latencySum: 0,
        latencyCount: 0,
      }
      existing.total += 1
      if (modelOutcome.correct) {
        existing.correct += 1
      } else {
        existing.incorrect += 1
      }
      existing.latencySum += modelOutcome.latencyMs
      existing.latencyCount += 1
      perModelMap.set(modelOutcome.modelId, existing)
    }
  }

  const orderedModelIds = Array.from(
    new Set([...modelIds, ...Array.from(perModelMap.keys())])
  )
  const perModelSummary: BenchmarkPerModelSummary[] = orderedModelIds.map((modelId) => {
    const stats = perModelMap.get(modelId) ?? {
      total: 0,
      correct: 0,
      incorrect: 0,
      latencySum: 0,
      latencyCount: 0,
    }
    return {
      modelId,
      total: stats.total,
      correct: stats.correct,
      incorrect: stats.incorrect,
      correctnessRate: stats.total ? stats.correct / stats.total : 0,
      avgLatencyMs: stats.latencyCount
        ? Math.round(stats.latencySum / stats.latencyCount)
        : null,
    }
  })

  return {
    savedAt: Date.now(),
    threshold,
    weights,
    modelIds: Array.from(new Set(modelIds)),
    totalCases: cases.length,
    processedCases: finalized.length,
    correctCount,
    incorrectCount,
    caseOutcomes,
    perModelSummary,
  }
}
