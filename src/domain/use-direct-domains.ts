import { useEffect, useState } from 'react'
import {
  DEFAULT_DIRECT_DOMAINS,
  normalizeDomainInput,
} from './domain-utils'

const STORAGE_KEY = 'hamidsdeutsch-connect.direct-domains'

type AddDomainResult =
  | {
      success: true
      domain: string
    }
  | {
      success: false
      error: string
    }

function loadStoredDomains(): string[] {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return DEFAULT_DIRECT_DOMAINS
    }

    const parsedValue: unknown = JSON.parse(storedValue)

    if (!Array.isArray(parsedValue)) {
      return DEFAULT_DIRECT_DOMAINS
    }

    const validDomains = parsedValue.filter(
      (item): item is string =>
        typeof item === 'string' && item.length > 0,
    )

    return Array.from(new Set(validDomains))
  } catch {
    return DEFAULT_DIRECT_DOMAINS
  }
}

export function useDirectDomains() {
  const [domains, setDomains] = useState<string[]>(loadStoredDomains)

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(domains),
    )
  }, [domains])

  function addDomain(rawInput: string): AddDomainResult {
    const normalizedResult = normalizeDomainInput(rawInput)

    if (!normalizedResult.success) {
      return normalizedResult
    }

    if (domains.includes(normalizedResult.domain)) {
      return {
        success: false,
        error: 'این دامنه قبلاً در فهرست ثبت شده است.',
      }
    }

    setDomains((currentDomains) => [
      ...currentDomains,
      normalizedResult.domain,
    ])

    return {
      success: true,
      domain: normalizedResult.domain,
    }
  }

  function removeDomain(domain: string) {
    setDomains((currentDomains) =>
      currentDomains.filter(
        (currentDomain) => currentDomain !== domain,
      ),
    )
  }

  function resetDomains() {
    setDomains(DEFAULT_DIRECT_DOMAINS)
  }

  return {
    domains,
    addDomain,
    removeDomain,
    resetDomains,
  }
}