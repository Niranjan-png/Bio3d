export interface StructureCoordinateLoader {
  (url: string): Promise<string>;
  invalidate(url: string): void;
}

export function createStructureCoordinateLoader(
  fetchCoordinates: typeof fetch = fetch,
): StructureCoordinateLoader {
  const cache = new Map<string, Promise<string>>();

  const load = ((url: string) => {
    let request = cache.get(url);
    if (!request) {
      request = (async () => {
        const response = await fetchCoordinates(url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(`RCSB returned HTTP ${response.status}.`);
        }
        const data = await response.text();
        if (!data.includes("_atom_site.") || !data.startsWith("data_")) {
          throw new Error("RCSB returned an unreadable mmCIF coordinate file.");
        }
        return data;
      })();
      cache.set(url, request);
    }

    return request.catch((error: unknown) => {
      if (cache.get(url) === request) cache.delete(url);
      throw error;
    });
  }) as StructureCoordinateLoader;
  load.invalidate = (url) => {
    cache.delete(url);
  };
  return load;
}
