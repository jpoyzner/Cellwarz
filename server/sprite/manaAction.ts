export interface ManaAction {
  activate(): void;
  deactivate(): void;
}

const noop = () => {};

export function createManaAction(overrides: Partial<ManaAction>): ManaAction {
  return { activate: noop, deactivate: noop, ...overrides };
}
