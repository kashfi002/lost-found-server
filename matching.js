export function extractKeywords(text = '') {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2)
}

// Used for claim verification — compares claimant's answers against the item's real data.
export function computeClaimMatchScore(item, claim) {
  let score = 0
  let weighted = 0

  const exactField = (itemVal, claimVal, weight) => {
    if (!itemVal) return
    weighted += weight
    if (itemVal.trim().toLowerCase() === (claimVal || '').trim().toLowerCase()) {
      score += weight
    }
  }

  exactField(item.color, claim.color, 20)
  exactField(item.brand, claim.brand, 20)
  exactField(item.model, claim.model, 15)

  const descWeight = 100 - weighted
  weighted = 100

  const itemKeywords = [...new Set(extractKeywords(item.description || ''))]
  const claimKeywords = [...new Set(extractKeywords(claim.description || ''))]

  if (itemKeywords.length > 0) {
    const shared = itemKeywords.filter(k => claimKeywords.includes(k))
    const recall = shared.length / itemKeywords.length
    score += Math.round(recall * descWeight)
  } else {
    score += descWeight
  }

  return Math.min(100, Math.round((score / weighted) * 100))
}

// Used for lost/found item matching — same logic your DataContext already runs client-side.
export function computeItemMatchScore(newItem, existingItem) {
  let score = 0
  const sharedKeywords = []

  const sameCategory = existingItem.category === newItem.category
  const hasSubcategories = !!(newItem.subCategory || existingItem.subCategory)

  const subA = (newItem.subCategory || '').toLowerCase().trim()
  const subB = (existingItem.subCategory || '').toLowerCase().trim()
  const isVagueA = subA === '' || subA === 'other'
  const isVagueB = subB === '' || subB === 'other'
  const subCategoryMatch = subA && subB && subA === subB && !isVagueA && !isVagueB

  if (sameCategory) {
    if (!hasSubcategories) {
      // Categories with no subcategories at all (documents, keys, etc.)
      // — category match alone is meaningful here
      score += 40
    } else if (subCategoryMatch) {
      // Same category AND same specific subcategory (e.g. both "Laptop")
      score += 40
    } else if (isVagueA || isVagueB) {
      // One or both marked "Other" — too vague to auto-match, small nudge only,
      // real signal has to come from keyword overlap below
      score += 10
    } else {
      // Same broad category but different subcategory (calculator vs laptop)
      // — not the same kind of item, no bonus
      score += 0
    }
  }

  const extract = (item) => extractKeywords(
    [item.description, item.brand, item.model, item.color, item.subCategory, item.product_type]
      .filter(Boolean).join(' ')
  )

  const newKeywords = extract(newItem)
  const existingKeywords = extract(existingItem)
  for (const kw of newKeywords) {
    if (existingKeywords.includes(kw)) {
      score += 8
      if (!sharedKeywords.includes(kw)) sharedKeywords.push(kw)
    }
  }

  if (existingItem.latitude && existingItem.longitude && newItem.latitude && newItem.longitude) {
    const R = 6371
    const dLat = (existingItem.latitude - newItem.latitude) * Math.PI / 180
    const dLng = (existingItem.longitude - newItem.longitude) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(newItem.latitude * Math.PI / 180) * Math.cos(existingItem.latitude * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (distKm <= 0.5) score += 20
    else if (distKm <= 1.5) score += 12
    else if (distKm <= 5) score += 5
  }

  return { score: Math.min(100, score), sharedKeywords }
}