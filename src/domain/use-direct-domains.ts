import {
  useCallback,
  useState,
} from 'react'

const STORAGE_KEY =
  'hamidsdeutsch:direct-domains:v2'

const LEGACY_STORAGE_KEYS = [
  'hamidsdeutsch:direct-domains',
  'hamidsDeutsch:directDomains',
  'directDomains',
]

const DEFAULT_DOMAINS = [
  'intrack.ir',
  'eghamat24.com',
  'aparatsport.ir',
  'open-platform-redirect.divar.ir',
  'trn.etooklms.com',
  'etooklms.com',
  'nasr.irannsr.org',
  'irannsr.org',
  'okala.com',
  'hamidrezasaadati.com',
  'classinar.ir',
]

type AddDomainResult =
  | {
      success: true
      domain: string
    }
  | {
      success: false
      error: string
    }

export type AddDomainsResult = {
  success: boolean
  added: string[]
  duplicates: string[]
  invalid: string[]
  total: number
  error: string | null
}

function normalizeDomain(
  rawInput: string,
): string | null {
  if (
    typeof rawInput !==
      'string'
  ) {
    return null
  }

  let value =
    rawInput
      .trim()
      .replace(
        /^[,\s]+|[,\s]+$/g,
        '',
      )
      .replace(
        /^domain:/i,
        '',
      )
      .trim()

  if (!value) {
    return null
  }

  try {
    if (
      /^[a-z][a-z0-9+.-]*:\/\//i.test(
        value,
      )
    ) {
      value =
        new URL(value)
          .hostname
    } else {
      value =
        new URL(
          `https://${value}`,
        ).hostname
    }
  } catch {
    return null
  }

  value =
    value
      .trim()
      .toLowerCase()
      .replace(/\.$/, '')

  if (
    value.length > 253 ||
    value === 'localhost' ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i.test(
      value,
    )
  ) {
    return null
  }

  return value
}

function parseBulkInput(
  rawInput: string,
) {
  return String(
    rawInput ?? '',
  )
    .split(
      /[\r\n,;]+/,
    )
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean)
}

function readDomains(): string[] {
  const candidates = [
    STORAGE_KEY,
    ...LEGACY_STORAGE_KEYS,
  ]

  for (const key of candidates) {
    try {
      const raw =
        window.localStorage.getItem(
          key,
        )

      if (!raw) {
        continue
      }

      const parsed =
        JSON.parse(raw)

      if (!Array.isArray(parsed)) {
        continue
      }

      const normalized =
        Array.from(
          new Set(
            parsed
              .map((item) =>
                normalizeDomain(
                  String(item),
                ),
              )
              .filter(
                (
                  item,
                ): item is string =>
                  Boolean(item),
              ),
          ),
        ).sort()

      if (
        normalized.length > 0
      ) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            normalized,
          ),
        )

        return normalized
      }
    } catch {
      // Try the next legacy key.
    }
  }

  return [...DEFAULT_DOMAINS]
    .map(
      (domain) =>
        normalizeDomain(domain),
    )
    .filter(
      (
        domain,
      ): domain is string =>
        Boolean(domain),
    )
    .sort()
}

function persist(
  domains: string[],
) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(domains),
  )
}

export function useDirectDomains() {
  const [domains, setDomains] =
    useState<string[]>(
      () => readDomains(),
    )

  const addDomain =
    useCallback(
      (
        rawInput: string,
      ): AddDomainResult => {
        const domain =
          normalizeDomain(
            rawInput,
          )

        if (!domain) {
          return {
            success: false,
            error:
              'آدرس دامنه معتبر نیست.',
          }
        }

        if (
          domains.includes(
            domain,
          )
        ) {
          return {
            success: false,
            error:
              'این دامنه قبلاً ثبت شده است.',
          }
        }

        const next = [
          ...domains,
          domain,
        ].sort()

        setDomains(next)
        persist(next)

        return {
          success: true,
          domain,
        }
      },
      [domains],
    )

  const addDomains =
    useCallback(
      (
        rawInput: string,
      ): AddDomainsResult => {
        const rawItems =
          parseBulkInput(
            rawInput,
          )

        if (
          rawItems.length === 0
        ) {
          return {
            success: false,
            added: [],
            duplicates: [],
            invalid: [],
            total: 0,
            error:
              'هیچ دامنه‌ای وارد نشده است.',
          }
        }

        const existing =
          new Set(domains)

        const seen =
          new Set<string>()

        const added: string[] = []
        const duplicates:
          string[] = []
        const invalid:
          string[] = []

        for (
          const rawItem of
            rawItems
        ) {
          const domain =
            normalizeDomain(
              rawItem,
            )

          if (!domain) {
            invalid.push(
              rawItem,
            )
            continue
          }

          if (
            existing.has(domain) ||
            seen.has(domain)
          ) {
            duplicates.push(
              domain,
            )
            continue
          }

          seen.add(domain)
          added.push(domain)
        }

        if (
          added.length > 0
        ) {
          const next = [
            ...domains,
            ...added,
          ].sort()

          setDomains(next)
          persist(next)
        }

        return {
          success:
            added.length > 0,
          added,
          duplicates:
            Array.from(
              new Set(
                duplicates,
              ),
            ),
          invalid:
            Array.from(
              new Set(
                invalid,
              ),
            ),
          total:
            rawItems.length,
          error:
            added.length > 0
              ? null
              : 'هیچ دامنه جدید و معتبری اضافه نشد.',
        }
      },
      [domains],
    )

  const removeDomain =
    useCallback(
      (domain: string) => {
        setDomains(
          (current) => {
            const next =
              current.filter(
                (item) =>
                  item !== domain,
              )

            persist(next)
            return next
          },
        )
      },
      [],
    )

  const resetDomains =
    useCallback(
      () => {
        const next =
          [...DEFAULT_DOMAINS]
            .map(
              (domain) =>
                normalizeDomain(
                  domain,
                ),
            )
            .filter(
              (
                domain,
              ): domain is string =>
                Boolean(domain),
            )
            .sort()

        setDomains(next)
        persist(next)
      },
      [],
    )

  return {
    domains,
    addDomain,
    addDomains,
    removeDomain,
    resetDomains,
  }
}
