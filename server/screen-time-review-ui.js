import { reviewPresentationStyle } from './review-presentation-style.js';
import { screenTimeReviewStyle } from './screen-time-review-style.js';
import { screenTimeReviewClient } from './screen-time-review-client.js';

export const legacyScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review.html';
export const previousScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v2.html';
export const heatmapScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v3.html';
export const attentionScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v4.html';
export const namedScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v5.html';
export const designedScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v6.html';
export const periodScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v7.html';
export const comparisonScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v8.html';
export const rangeScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v9.html';
export const comparisonFirstScreenTimeReviewUri =
  'ui://myself-md/weekly-screen-time-review-v10.html';
export const presetScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v11.html';
export const pairedHeatmapScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v12.html';
export const overviewScreenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v13.html';
export const screenTimeReviewUri = 'ui://myself-md/weekly-screen-time-review-v15.html';
export const screenTimeReviewHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly screen-time review</title><style>${screenTimeReviewStyle}${reviewPresentationStyle}</style></head><body><main id="review" aria-live="polite"><p>Waiting for your weekly review…</p></main>
<script>${screenTimeReviewClient}</script></body></html>`;
