// Resolves the branchId filter for a request.
// ADMIN: uses ?branchId= query param (undefined = all branches)
// MANAGER/CASHIER: always scoped to their assigned branch
function resolveBranchId(req) {
  if (req.user.role === 'ADMIN') {
    return req.query.branchId ? parseInt(req.query.branchId) : undefined
  }
  return req.user.branchId ?? undefined
}

module.exports = { resolveBranchId }
