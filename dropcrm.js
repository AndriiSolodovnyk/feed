const fs = require('node:fs/promises');

const FEED_URL = 'https://drop-crm.com/api/v1/feeds/yml';
const OUTPUT_FILE = 'feed.yml';

async function main() {
  const token = process.env.DROPCRM_BEARER_TOKEN;

  if (!token) {
    throw new Error('GitHub Secret DROPCRM_BEARER_TOKEN is not configured');
  }

  const response = await fetch(FEED_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/xml, text/xml;q=0.9, */*;q=0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`DropCRM returned HTTP ${response.status}`);
  }

  const feed = await response.text();
  const trimmedFeed = feed.trimStart();

  if (!trimmedFeed.startsWith('<?xml') && !trimmedFeed.startsWith('<yml_catalog')) {
    throw new Error('DropCRM response does not look like a YML/XML feed');
  }

  await fs.writeFile(OUTPUT_FILE, feed, 'utf8');
  console.log(`Updated ${OUTPUT_FILE} (${Buffer.byteLength(feed)} bytes)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
