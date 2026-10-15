import { verifyBlogHTTP } from './verify-blog.js';

// Allow brief deployment propagation; never claim success from the deploy command alone.
/** @param {number} attempt @returns {Promise<void>} */
async function verifyDeployment(attempt) {
  try {
    await verifyBlogHTTP('https://myself.md');
  } catch (error) {
    if (attempt === 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await verifyDeployment(attempt + 1);
  }
}
await verifyDeployment(0);
console.log('Live blog HTML, Markdown, RSS, sitemap and navigation match the built vault content.');
