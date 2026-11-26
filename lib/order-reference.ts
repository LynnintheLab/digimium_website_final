const orderReferencePattern = /^DG - \d{4}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2} - \d{3,20}$/;

export function isOrderReference(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && orderReferencePattern.test(value);
}

export function displayOrderReference(id: string, reference?: string | null): string {
  return isOrderReference(reference) ? reference : '#' + id.slice(0, 8).toUpperCase();
}
