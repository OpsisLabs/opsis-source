export type ImportDelay = (milliseconds: number) => Promise<void>;

const delay: ImportDelay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function retryImport<T>(importer: () => Promise<T>, wait: ImportDelay = delay): () => Promise<T> {
  return async () => {
    for (const milliseconds of [600, 1500]) {
      try {
        return await importer();
      } catch {
        await wait(milliseconds);
      }
    }
    return importer();
  };
}
