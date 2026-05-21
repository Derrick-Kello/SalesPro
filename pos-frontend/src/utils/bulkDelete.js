/** Delete many rows when the API only exposes DELETE /resource/:id */
export async function bulkDeleteLoop(api, basePath, ids) {
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await api.delete(`${basePath}/${id}`)
  }
}
