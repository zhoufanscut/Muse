const sampleCache = new Map();

// Malformed JSON dropped silently with console.error — does NOT crash the caller.
export async function loadLanguageManifests(ids) {
  const results = [];
  for (const id of ids) {
    try {
      const res = await fetch(`./data/languages/${id}.json`);
      const manifest = await res.json();
      results.push(manifest);
    } catch (e) {
      console.error(e);
    }
  }
  return results;
}

// Manifest's sample field stores "data/samples/python.txt" (no ./ prefix).
// Prepend './' so the fetch works on GH Pages project sites.
// Cache by manifest.id — don't re-fetch on tab re-activation.
export async function loadSample(manifest) {
  if (sampleCache.has(manifest.id)) {
    return sampleCache.get(manifest.id);
  }
  try {
    const res = await fetch('./' + manifest.sample);
    const text = await res.text();
    sampleCache.set(manifest.id, text);
    return text;
  } catch (e) {
    console.error(e);
    return '';
  }
}
