# Wix Site Archive Project Plan

## Project Overview

Create a complete, pixel-perfect archive of qr646.com (a Wix-based travel blog) that preserves the site exactly as it appears today, suitable for static hosting on Vercel.

## Technical Stack

- **Runtime:** Node.js (v18+)
- **Browser Automation:** Playwright
- **Hosting Target:** Vercel (static)
- **Package Manager:** npm

## Project Goals

1. Perfect preservation of site appearance and functionality
2. Complete offline archive with all assets
3. Mobile and desktop viewport preservation
4. Remove Wix tracking/analytics while keeping fonts and styling
5. Maintain exact URL structure for backwards compatibility

## Implementation Phases

### Phase 1: Site Discovery & Mapping

**File:** `src/crawler.js`

- Start at homepage (qr646.com)
- Recursively discover all internal links
- Build complete sitemap with page relationships
- Identify page types (blog posts, galleries, static pages)
- Output: `data/sitemap.json` with all URLs and metadata

### Phase 2: Content Capture

**File:** `src/scraper.js`

- Use Playwright to visit each URL
- Capture both desktop (1920x1080) and mobile (375x812) viewports
- Wait for full page render including lazy-loaded content
- Save complete DOM after JavaScript execution
- Intercept all network requests to catalog assets
- Output: Raw HTML files in `temp/pages/`

### Phase 3: Asset Collection

**File:** `src/assetDownloader.js`

- Download all images at highest available resolution
- Parse Wix image URLs to get original quality (remove size parameters)
- Download Google Fonts and other external styling
- Save CSS files and any required JavaScript
- Maintain asset organization with meaningful names
- Output: All assets in `output/assets/`

### Phase 4: HTML Processing

**File:** `src/rewriter.js`

- Parse all saved HTML files
- Replace wixstatic.com URLs with local paths
- Remove Wix analytics, tracking scripts, and unnecessary JavaScript
- Keep Google Fonts and essential styling
- Update asset paths to local references
- Preserve all structural HTML and CSS classes
- Output: Clean HTML in `output/`

### Phase 5: Mobile/Desktop Handling

**File:** `src/responsiveHandler.js`

- Detect viewport-specific content
- Create separate mobile/desktop versions if needed
- Or implement CSS-based responsive switching
- Ensure both experiences are preserved

### Phase 6: Local Preview

**File:** `src/server.js`

- Simple Express server for local testing
- Serves the archived site exactly as it will appear
- Allows verification before deployment

### Phase 7: Deployment Prep

**File:** `src/deploy.js`

- Generate `vercel.json` configuration
- Set up proper routing for preserved URLs
- Create redirect rules if needed
- Output deployment-ready package

## Directory Structure

wix-archiver/
├── src/
│ ├── crawler.js # URL discovery
│ ├── scraper.js # Page capture
│ ├── assetDownloader.js # Asset collection
│ ├── rewriter.js # HTML processing
│ ├── responsiveHandler.js # Mobile/desktop handling
│ ├── server.js # Preview server
│ ├── deploy.js # Deployment prep
│ └── utils/
│ ├── urlParser.js # Wix URL handling
│ └── logger.js # Progress tracking
├── config/
│ └── settings.json # Configuration
├── data/
│ ├── sitemap.json # Discovered URLs
│ └── assets.json # Asset manifest
├── temp/ # Working directory
│ └── pages/ # Raw HTML
├── output/ # Final archive
│ ├── index.html
│ ├── single-post/ # Preserved structure
│ ├── assets/
│ │ ├── images/
│ │ ├── css/
│ │ └── fonts/
│ └── vercel.json
├── package.json
└── README.md

## Configuration File

`config/settings.json`:

```json
{
  "siteUrl": "https://www.qr646.com",
  "viewports": {
    "desktop": { "width": 1920, "height": 1080 },
    "mobile": { "width": 375, "height": 812 }
  },
  "preserveUrls": true,
  "downloadHighRes": true,
  "removeTracking": true,
  "keepFonts": true,
  "parallel": 3,
  "timeout": 30000
}
Key Technical Considerations
Wix-Specific Challenges

Dynamic Loading: Wait for all JavaScript rendering
Image URLs: Parse Wix image parameters to get originals
Lazy Loading: Scroll page to trigger all image loads
Font Loading: Capture dynamically loaded fonts
Route Structure: Preserve complex URL patterns

Asset Handling

Download images without Wix resizing parameters
Maintain image quality (download source files)
Create local asset manifest for URL rewriting
Handle both static and dynamic image URLs

URL Preservation

Keep exact paths: /single-post/2019/01/14/...
Maintain any query parameters that affect content
Set up Vercel routing to match original structure

Dependencies
json{
  "dependencies": {
    "playwright": "^1.40.0",
    "cheerio": "^1.0.0-rc.12",
    "express": "^4.18.2",
    "fs-extra": "^11.1.1",
    "p-limit": "^3.1.0",
    "chalk": "^4.1.2",
    "commander": "^11.0.0"
  }
}
Usage Commands
bash# Install dependencies
npm install

# Run full archive process
npm run archive

# Individual steps
npm run discover     # Map site structure
npm run capture      # Download pages
npm run assets       # Get all assets
npm run process      # Clean HTML
npm run preview      # Local preview
npm run deploy       # Prep for Vercel
Error Handling

Retry failed downloads (3 attempts)
Log all errors with context
Continue on non-critical failures
Generate report of any missing assets

Success Metrics

All pages accessible at original URLs
Images display at full quality
Site appears identical to original
Both mobile and desktop views preserved
No broken links or missing assets
No Wix tracking/analytics remain
Google Fonts and styling intact

Notes for Implementation

Start with a single blog post as proof of concept
Test mobile/desktop switching thoroughly
Verify image quality matches originals
Check that all navigation works
Test on local server before Vercel deployment
Keep detailed logs for debugging

This architecture prioritizes perfect preservation while removing unnecessary Wix overhead. The modular design allows testing each phase independently.
```
