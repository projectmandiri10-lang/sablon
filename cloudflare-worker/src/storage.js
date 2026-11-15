// Lapisan storage R2 pengganti Supabase Storage. Objek disimpan dengan key
// `${bucket}/${path}` agar struktur bucket lama (example-jobs) tetap sama.

function requireAssets(env) {
  if (!env?.ASSETS) throw new Error('Worker belum dikonfigurasi: binding R2 ASSETS kosong.');
  return env.ASSETS;
}

export function objectKey(bucket, path) {
  return `${bucket}/${String(path || '').replace(/^\/+/, '')}`;
}

export async function putObject(env, bucket, path, bytes, contentType) {
  return requireAssets(env).put(objectKey(bucket, path), bytes, {
    httpMetadata: {
      contentType: contentType || 'application/octet-stream',
      cacheControl: 'public, max-age=3600'
    }
  });
}

export async function getObject(env, bucket, path) {
  return requireAssets(env).get(objectKey(bucket, path));
}

export async function deleteObjects(env, bucket, prefixes) {
  const filtered = [...new Set((prefixes || []).filter(Boolean))];
  if (filtered.length === 0) return null;
  const assets = requireAssets(env);
  for (const prefix of filtered) {
    let cursor;
    do {
      const listed = await assets.list({ prefix: objectKey(bucket, prefix), cursor });
      const keys = (listed?.objects || []).map((object) => object.key);
      if (keys.length > 0) await assets.delete(keys);
      cursor = listed?.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  return { deleted: true };
}

export async function copyObject(env, bucket, sourceKey, destinationKey) {
  const assets = requireAssets(env);
  const source = await assets.get(objectKey(bucket, sourceKey));
  if (!source) throw new Error('File sumber tidak ditemukan di storage.');
  return assets.put(objectKey(bucket, destinationKey), source.body, {
    httpMetadata: source.httpMetadata
  });
}