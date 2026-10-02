import { describe, expect, it } from 'vitest';
import { buildProductDescription, calculateProductListingScore, extractAiVerificationResult, getAiRatingLabel, getAiVerificationSummary } from './aiVerification';

describe('AI product verification', () => {
  it('scores a complete listing highly and explains the result', () => {
    const score = calculateProductListingScore({
      name: 'Fresh Red Tomato',
      category: 'Vegetables',
      quantity: '120',
      unit: 'kg',
      sellingPrice: '42',
      harvestDate: '2026-09-21',
      grade: 'Grade A',
      availableFrom: '2026-09-22',
      location: 'Nashik, Maharashtra',
      image: 'data:image/png;base64,abc',
    });

    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(100);
    expect(getAiVerificationSummary(score)).toContain('Excellent');
  });

  it('falls back to the local AI score when n8n is misconfigured', () => {
    const result = extractAiVerificationResult(
      '{"code":0,"message":"Unused Respond to Webhook node found in the workflow"}',
      82,
    );

    expect(result.score).toBe(82);
    expect(result.summary.toLowerCase()).toContain('temporarily unavailable');
    expect(result.textResponse).toContain('Unused Respond to Webhook node found');
  });

  it('extracts a numeric rating from a text response', () => {
    const result = extractAiVerificationResult('AI rating: 76/100', 50);

    expect(result.score).toBe(76);
    expect(result.summary).toContain('76');
    expect(result.textResponse).toBe('AI rating: 76/100');
  });

  it('preserves a plain-text n8n response, including when wrapped in output', () => {
    const response = 'Grade B: tomatoes look fresh. Recommended price: 42 per kg.';
    const directResult = extractAiVerificationResult(response, 50);
    const wrappedResult = extractAiVerificationResult(JSON.stringify({ output: response }), 50);

    expect(directResult.textResponse).toBe(response);
    expect(wrappedResult.textResponse).toBe(response);
  });

  it('keeps the product description and reason from a structured n8n response', () => {
    const result = extractAiVerificationResult(JSON.stringify({
      score: 88,
      productDescription: 'Fresh red tomatoes with Grade A appearance.',
      ratingReason: 'The image is clear and the listed grade matches the visible produce.',
    }), 50);

    expect(result.source).toBe('n8n');
    expect(result.score).toBe(88);
    expect(result.productDescription).toContain('Fresh red tomatoes');
    expect(result.ratingReason).toContain('image is clear');
  });

  it('reads a JSON response nested in the n8n output field', () => {
    const result = extractAiVerificationResult(JSON.stringify([{
      output: JSON.stringify({ score: 76, reason: 'The photo is clear and the listing is complete.' }),
    }]), 50);

    expect(result.score).toBe(76);
    expect(result.ratingReason).toContain('photo is clear');
  });

  it('extracts the complete farmer-facing produce assessment response', () => {
    const result = extractAiVerificationResult(JSON.stringify({
      grade: 'D',
      quality_assessment: 'The tomatoes show visible signs of spoilage and black spots.',
      matches_stated_details: 'The produce appears to be tomatoes, matching the stated vegetable category.',
      price_assessment: 'Expected value is very low for this batch.',
      suggestions_for_farmer: 'Sort damaged produce and improve post-harvest handling.',
    }), 100);

    expect(result.source).toBe('n8n');
    expect(result.assessment).toEqual({
      grade: 'D',
      qualityAssessment: 'The tomatoes show visible signs of spoilage and black spots.',
      matchesStatedDetails: 'The produce appears to be tomatoes, matching the stated vegetable category.',
      priceAssessment: 'Expected value is very low for this batch.',
      suggestionsForFarmer: 'Sort damaged produce and improve post-harvest handling.',
    });
    expect(result.summary).toBe('AI assessment: Grade D');
  });

  it('accepts the n8n grade assessment response when text includes a 5000 kg quantity', () => {
    const result = extractAiVerificationResult(JSON.stringify({
      grade: 'A',
      quality_assessment: 'The potatoes appear fresh, clean, and uniform in size.',
      matches_stated_details: 'The image clearly shows potatoes in the vegetables category.',
      price_assessment: 'For a 5000 kg lot, the estimated total is ₹60,000 to ₹90,000.',
      suggestions_for_farmer: 'Store the potatoes in a cool, dry, dark space.',
    }), 72);

    expect(result.source).toBe('n8n');
    expect(result.assessment).toEqual({
      grade: 'A',
      qualityAssessment: 'The potatoes appear fresh, clean, and uniform in size.',
      matchesStatedDetails: 'The image clearly shows potatoes in the vegetables category.',
      priceAssessment: 'For a 5000 kg lot, the estimated total is ₹60,000 to ₹90,000.',
      suggestionsForFarmer: 'Store the potatoes in a cool, dry, dark space.',
    });
  });

  it('builds a factual product description and rating label', () => {
    const description = buildProductDescription({
      name: 'Fresh Tomato',
      category: 'Vegetables',
      quantity: 120,
      unit: 'kg',
      sellingPrice: 42,
      grade: 'Grade A',
      location: 'Nashik',
    });

    expect(description).toContain('120 kg');
    expect(description).toContain('₹42/kg');
    expect(description).toContain('Nashik');
    expect(getAiRatingLabel(88)).toBe('Excellent');
  });
});
