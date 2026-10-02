export type ProductVerificationInput = {
  name?: string;
  category?: string;
  quantity?: string | number;
  unit?: string;
  sellingPrice?: string | number;
  harvestDate?: string;
  grade?: string;
  availableFrom?: string;
  location?: string;
  image?: string;
};

export type AiVerificationResult = {
  score: number;
  summary: string;
  textResponse?: string;
  productDescription?: string;
  ratingReason?: string;
  assessment?: {
    grade?: string;
    qualityAssessment?: string;
    matchesStatedDetails?: string;
    priceAssessment?: string;
    suggestionsForFarmer?: string;
  };
  source: 'n8n' | 'local';
};

export function calculateProductListingScore(input: ProductVerificationInput): number {
  let score = 30;

  if (input.name && input.name.trim().length >= 3) score += 12;
  if (input.category) score += 8;

  const quantity = Number(input.quantity);
  if (Number.isFinite(quantity) && quantity > 0) score += 12;

  if (input.unit) score += 4;

  const sellingPrice = Number(input.sellingPrice);
  if (Number.isFinite(sellingPrice) && sellingPrice > 0) score += 12;

  if (input.harvestDate) score += 6;
  if (input.grade) score += 6;
  if (input.availableFrom) score += 6;

  if (input.location && input.location.trim().length >= 3) score += 8;

  const hasImage = Boolean(input.image && (input.image.startsWith('data:image/') || input.image.startsWith('http')));
  if (hasImage) score += 16;

  return Math.min(100, score);
}

export function getAiVerificationSummary(score: number): string {
  if (score >= 85) return 'Excellent listing: AI verified the product data and image quality.';
  if (score >= 70) return 'Good listing: minor details may improve buyer confidence.';
  if (score >= 50) return 'Fair listing: add the missing details to improve verification.';
  return 'Needs attention: complete the required fields and upload a clear product image.';
}

export function getAiRatingLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs improvement';
}

export function buildProductDescription(input: ProductVerificationInput): string {
  const name = input.name?.trim() || 'Produce';
  const category = input.category || 'Uncategorized';
  const quantity = input.quantity || 'an unspecified quantity';
  const unit = input.unit || '';
  const price = input.sellingPrice ? `₹${input.sellingPrice}/${unit || 'unit'}` : 'an unspecified price';
  const location = input.location?.trim() || 'location not provided';
  const grade = input.grade ? `, listed as ${input.grade}` : '';

  return `${name} is listed in ${category} with ${quantity}${unit ? ` ${unit}` : ''} available at ${price} in ${location}${grade}.`;
}

export function extractAiVerificationResult(
  responseText: string | null | undefined,
  fallbackScore: number,
): AiVerificationResult {
  const safeFallback = Number.isFinite(fallbackScore) ? Math.min(100, Math.max(0, Number(fallbackScore))) : 0;
  const trimmedText = (responseText ?? '').trim();

  if (!trimmedText) {
    return {
      score: safeFallback,
      summary: `AI verification service is temporarily unavailable. Using local score: ${safeFallback}/100.`,
      source: 'local',
    };
  }

  if (/Unused Respond to Webhook node found|Internal Server Error|Webhook.*failed|not responding|\bHTTP\s+500\b|\bstatus(?:Code)?["'\s:=]+500\b/i.test(trimmedText)) {
    return {
      score: safeFallback,
      summary: `AI verification service is temporarily unavailable. Using local score: ${safeFallback}/100.`,
      textResponse: trimmedText,
      source: 'local',
    };
  }

  const directNumber = Number(trimmedText);
  if (Number.isFinite(directNumber)) {
    const normalizedScore = Math.min(100, Math.max(0, directNumber));
    return {
      score: normalizedScore,
      summary: `AI rating: ${normalizedScore}/100`,
      textResponse: trimmedText,
      source: 'n8n',
    };
  }

  let textResponse: string | undefined;

  try {
    let parsedResponse: unknown = JSON.parse(trimmedText);
    if (Array.isArray(parsedResponse)) parsedResponse = parsedResponse[0];
    if (typeof parsedResponse === 'string') {
      textResponse = parsedResponse.trim();
    }
    if (parsedResponse && typeof parsedResponse === 'object') {
      const outer = parsedResponse as Record<string, unknown>;
      const nested = outer.output ?? outer.data ?? outer.response;
      if (nested && typeof nested === 'object') {
        parsedResponse = nested;
      } else if (typeof nested === 'string') {
        try {
          parsedResponse = JSON.parse(nested);
        } catch {
          textResponse = nested.trim();
          parsedResponse = { ...outer, output: nested };
        }
      }
    }

    const record = parsedResponse && typeof parsedResponse === 'object'
      ? parsedResponse as Record<string, unknown>
      : {};
    const rawScore = record.score ?? record.rating ?? record.imageQualityScore ?? record.aiRating;
    const assessment = {
      grade: stringValue(record, ['grade']),
      qualityAssessment: stringValue(record, ['quality_assessment', 'qualityAssessment']),
      matchesStatedDetails: stringValue(record, ['matches_stated_details', 'matchesStatedDetails']),
      priceAssessment: stringValue(record, ['price_assessment', 'priceAssessment']),
      suggestionsForFarmer: stringValue(record, ['suggestions_for_farmer', 'suggestionsForFarmer']),
    };
    const numericScore = Number(rawScore);
    const extractedScore = Number.isFinite(numericScore)
      ? numericScore
      : Number(String(rawScore ?? '').match(/\d+(?:\.\d+)?/)?.[0] ?? safeFallback);
    const parsedScore = rawScore === undefined ? safeFallback : extractedScore;
    if (Number.isFinite(parsedScore)) {
      const normalizedScore = Math.min(100, Math.max(0, parsedScore));
      return {
        score: normalizedScore,
        summary: String(record.summary ?? record.message ?? record.result ?? record.imageQualitySummary ?? (assessment.grade ? `AI assessment: Grade ${assessment.grade}` : `AI rating: ${normalizedScore}/100`)),
        textResponse,
        productDescription: stringValue(record, ['productDescription', 'product_description', 'productSummary', 'product_summary', 'description']),
        ratingReason: stringValue(record, ['ratingReason', 'rating_reason', 'reason', 'justification', 'explanation', 'whyThisRating']),
        assessment: Object.values(assessment).some(Boolean) ? assessment : undefined,
        source: 'n8n',
      };
    }
  } catch {
    // Ignore JSON parsing errors and continue to text extraction.
  }

  const extractedNumber = Number(trimmedText.match(/\d+(?:\.\d+)?/)?.[0] ?? safeFallback);
  if (Number.isFinite(extractedNumber)) {
    const normalizedScore = Math.min(100, Math.max(0, extractedNumber));
    return {
      score: normalizedScore,
      summary: `AI rating: ${normalizedScore}/100`,
      textResponse: trimmedText,
      source: 'n8n',
    };
  }

  return {
    score: safeFallback,
    summary: textResponse ? `AI response received from n8n.` : trimmedText || `AI rating: ${safeFallback}/100`,
    textResponse: textResponse || trimmedText,
    source: 'n8n',
  };
}

function stringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
