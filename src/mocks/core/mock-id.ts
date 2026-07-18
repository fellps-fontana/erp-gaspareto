export function generateMockId(prefix: string): string {
  const uuid = crypto.randomUUID();
  return `${prefix}_${uuid}`;
}
