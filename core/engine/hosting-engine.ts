
export function recommendHosting(featureCount: number) {
  if (featureCount <= 5) return "Shared Hosting"
  if (featureCount <= 15) return "VPS"
  return "Dedicated Server"
}
