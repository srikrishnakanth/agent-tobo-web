
const GST = 0.18

export function calculatePrice(featureCount: number) {
  const base = 10000
  const featureCost = featureCount * 2000
  const subtotal = base + featureCost
  const gst = subtotal * GST
  const total = subtotal + gst
  return { subtotal, gst, total }
}
