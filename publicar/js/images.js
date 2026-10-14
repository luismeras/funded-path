/* Imágenes de Pre Market Analysis y Entry.
   Los Blobs viven en IndexedDB (base "tj_images"); los registros solo guardan el id ("img_…").
   Interfaz para poder cambiar luego a Supabase Storage sin tocar la app:
     saveImage(blob) → id · getImage(id) → Blob|null · deleteImage(id) · listImageIds() → [id]
   Además: url(id) / load(id) / release(keep) manejan las URLs de objeto para mostrar las imágenes,
   y space() informa el espacio libre del navegador. */
(function (TJ) {
  const DB = 'tj_images', STORE = 'images';
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
  // Runs one request in a transaction; resolves with its result once the transaction commits.
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = t.onabort = () => rej(t.error || (req && req.error));
  }));
  const newId = () => 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const urls = new Map(); // id → object URL currently in use

  TJ.images = {
    isId: v => typeof v === 'string' && v.startsWith('img_'),
    // Creation time encoded in the id (used to leave very recent orphans alone).
    idTime: id => parseInt(String(id).split('_')[1], 36) || 0,

    async saveImage(blob) { const id = newId(); await run('readwrite', s => s.put(blob, id)); return id; },
    // Restore under a known id (importing a backup keeps record ↔ image links intact).
    async putImage(id, blob) { await run('readwrite', s => s.put(blob, id)); },
    async getImage(id) { return (await run('readonly', s => s.get(id))) || null; },
    async deleteImage(id) {
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
      await run('readwrite', s => s.delete(id));
    },
    async listImageIds() { return (await run('readonly', s => s.getAllKeys())) || []; },

    // Object URL if already loaded (lets views render synchronously), else null.
    url: id => urls.get(id) || null,
    async load(id) {
      if (urls.has(id)) return urls.get(id);
      const b = await TJ.images.getImage(id);
      if (!b) return null;
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(b));
      return urls.get(id);
    },
    // Revoke URLs of images no longer on screen (the "unmount" of this app's string views).
    release(keep) {
      for (const [id, u] of urls) if (!keep.has(id)) { URL.revokeObjectURL(u); urls.delete(id); }
    },

    async space() {
      try {
        const e = await navigator.storage.estimate();
        return { used: e.usage || 0, quota: e.quota || 0, free: Math.max(0, (e.quota || 0) - (e.usage || 0)) };
      } catch (x) { return null; }
    },

    dataUrlToBlob(src) {
      const [head, b64] = src.split(','), bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/png' });
    }
  };

  // Ask the browser not to evict this site's storage under pressure (best effort, silent).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (x) {}
})(window.TJ = window.TJ || {});
