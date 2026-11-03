// What search engines may crawl: the landing page, and the stylesheet and icons it renders with. The web app, sign-in,
// the API and /mcp are for signed-in members and assistants (IMPLEMENTATION.md §6).
export function robotsTxt(origin: string): string {
  return `User-agent: *
Allow: /$
Allow: /app/site.css
Allow: /app/icon.svg
Allow: /app/apple-touch-icon.png
Disallow: /app/
Disallow: /oauth/
Disallow: /api/
Disallow: /mcp
Disallow: /language

Sitemap: ${origin}/sitemap.xml
`
}

export function sitemapXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
</urlset>
`
}
