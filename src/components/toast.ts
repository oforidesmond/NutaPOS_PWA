type ToastMessage = {
  id: number;
  title: string;
  body?: string;
};

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(title: string, body?: string): void {
  const toast = { id: nextId, title, body };
  nextId += 1;
  for (const listener of listeners) listener(toast);
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
