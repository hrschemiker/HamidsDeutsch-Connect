const nodeUriCache = new Map()

function replaceSubscriptionNodes(
  subscriptionId,
  records,
) {
  validateSubscriptionId(
    subscriptionId,
  )

  const nextNodes = new Map()

  for (const record of records) {
    if (
      !record ||
      typeof record.id !== 'string' ||
      typeof record.uri !== 'string'
    ) {
      continue
    }

    nextNodes.set(
      record.id,
      record.uri,
    )
  }

  nodeUriCache.set(
    subscriptionId,
    nextNodes,
  )
}

function getSubscriptionNodeUri(
  subscriptionId,
  nodeId,
) {
  validateSubscriptionId(
    subscriptionId,
  )

  if (
    typeof nodeId !== 'string' ||
    !nodeId.trim()
  ) {
    return null
  }

  return (
    nodeUriCache
      .get(subscriptionId)
      ?.get(nodeId) ?? null
  )
}

function removeSubscriptionNodes(
  subscriptionId,
) {
  if (
    typeof subscriptionId === 'string' &&
    subscriptionId.trim()
  ) {
    nodeUriCache.delete(
      subscriptionId,
    )
  }
}

function clearSubscriptionNodeCache() {
  nodeUriCache.clear()
}

function validateSubscriptionId(
  subscriptionId,
) {
  if (
    typeof subscriptionId !== 'string' ||
    !subscriptionId.trim()
  ) {
    throw new Error(
      'شناسه اشتراک معتبر نیست.',
    )
  }
}

module.exports = {
  replaceSubscriptionNodes,
  getSubscriptionNodeUri,
  removeSubscriptionNodes,
  clearSubscriptionNodeCache,
}
