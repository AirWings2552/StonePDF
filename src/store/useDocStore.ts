import { create } from "zustand";

export type Doc = { id: string; file: File; path?: string };

type DocStore = {
  docs: Record<string, Doc>;
  add: (file: File, path?: string) => Promise<string>;
};

export async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const useDocStore = create<DocStore>((set) => ({
  docs: {},
  add: async (file, path) => {
    const buf = await file.arrayBuffer();
    const id = await sha256Hex(buf);
    set((state) => ({ docs: { ...state.docs, [id]: { id, file, path } } }));
    return id;
  },
}));
