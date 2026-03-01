export function sanitizeBannerHtml(rawHtml) {
  const html = String(rawHtml || "");
  return html
    .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*(iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
}

export function computeBannerStatus(banner, now = new Date()) {
  if (banner.active === false) return "expired";
  const startsAt = banner.startsAt ? new Date(banner.startsAt) : null;
  const endsAt = banner.endsAt ? new Date(banner.endsAt) : null;
  if (startsAt && startsAt > now) return "scheduled";
  if (endsAt && endsAt <= now) return "expired";
  return "active";
}

export function mapBannerToClient(banner, now = new Date()) {
  return {
    id: String(banner._id),
    title: banner.title,
    detail: banner.detail,
    kind: banner.kind,
    bannerType: banner.bannerType || "text",
    bannerHtml: sanitizeBannerHtml(banner.bannerHtml || ""),
    imageUrl: banner.imageUrl || "",
    active: banner.active !== false,
    pinned: Boolean(banner.pinned),
    startsAt: banner.startsAt,
    endsAt: banner.endsAt || null,
    createdAt: banner.createdAt,
    status: computeBannerStatus(banner, now)
  };
}
