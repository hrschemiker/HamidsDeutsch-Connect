export const DEFAULT_DIRECT_DOMAINS = [
  'nasr.irannsr.org',
  'irannsr.org',
  'okala.com',
  'hamidrezasaadati.com',
  'classinar.ir',
]

export type NormalizeDomainResult =
  | {
      success: true
      domain: string
    }
  | {
      success: false
      error: string
    }

export function normalizeDomainInput(
  rawInput: string,
): NormalizeDomainResult {
  let value = rawInput.trim().toLowerCase()

  if (!value) {
    return {
      success: false,
      error: 'لطفاً آدرس یک سایت را وارد کن.',
    }
  }

  // حذف پیشوند domain:
  value = value.replace(/^domain\s*:\s*/i, '')

  // اگر پروتکل ندارد، موقتاً https اضافه می‌کنیم
  // تا URL parser بتواند آن را درست تحلیل کند.
  const valueWithProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(value)
    ? value
    : `https://${value}`

  let parsedUrl: URL

  try {
    parsedUrl = new URL(valueWithProtocol)
  } catch {
    return {
      success: false,
      error: 'آدرس واردشده معتبر نیست.',
    }
  }

  if (
    parsedUrl.protocol !== 'http:' &&
    parsedUrl.protocol !== 'https:'
  ) {
    return {
      success: false,
      error: 'فقط آدرس‌های http و https پذیرفته می‌شوند.',
    }
  }

  let hostname = parsedUrl.hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')

  // حذف www برای جلوگیری از ثبت تکراری
  hostname = hostname.replace(/^www\./, '')

  if (!hostname) {
    return {
      success: false,
      error: 'نام دامنه از آدرس تشخیص داده نشد.',
    }
  }

  if (hostname === 'localhost') {
    return {
      success: false,
      error: 'localhost را نمی‌توان به این فهرست اضافه کرد.',
    }
  }

  if (isIpv4Address(hostname) || isIpv6Address(hostname)) {
    return {
      success: false,
      error: 'فعلاً فقط نام دامنه پذیرفته می‌شود، نه آدرس IP.',
    }
  }

  if (!isValidHostname(hostname)) {
    return {
      success: false,
      error: 'ساختار نام دامنه معتبر نیست.',
    }
  }

  return {
    success: true,
    domain: hostname,
  }
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length > 253) {
    return false
  }

  const labels = hostname.split('.')

  if (labels.length < 2) {
    return false
  }

  return labels.every((label) => {
    if (!label || label.length > 63) {
      return false
    }

    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  })
}

function isIpv4Address(value: string): boolean {
  const parts = value.split('.')

  if (parts.length !== 4) {
    return false
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false
    }

    const number = Number(part)

    return number >= 0 && number <= 255
  })
}

function isIpv6Address(value: string): boolean {
  return value.includes(':')
}