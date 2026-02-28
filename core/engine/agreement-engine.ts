
export function generateAgreement(scope: any, total: number) {
  return `
PROJECT AGREEMENT

Business: ${scope.businessName}
Platforms: ${scope.platforms?.join(", ")}
Features: ${scope.features?.join(", ")}

Total Cost (incl GST): ₹${total}

Ownership transfers after full payment.
`
}
