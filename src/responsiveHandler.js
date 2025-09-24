const cheerio = require('cheerio');

const RESPONSIVE_CSS = `/* injected responsive helpers */
@media (max-width: 767px){ .only-desktop{display:none !important;} }
@media (min-width: 768px){ .only-mobile{display:none !important;} }
`;

function mergeDesktopMobile(desktopHtml, mobileHtml) {
  const $d = cheerio.load(desktopHtml, { decodeEntities: false });
  const $m = cheerio.load(mobileHtml, { decodeEntities: false });

  // Build index of desktop elements by id
  const desktopIds = new Set();
  $d('[id]').each((_i, el) => desktopIds.add($d(el).attr('id')));

  // Append mobile-only top-level sections at the end of body inside a wrapper
  const wrapper = $d('<div class="mobile-only-wrapper only-mobile"></div>');
  $m('body').children().each((_i, el) => {
    const $el = $m(el);
    const id = $el.attr('id');
    if (id && desktopIds.has(id)) return; // already present in desktop
    // Heuristic: skip scripts and noscript
    if (['script', 'noscript'].includes(el.tagName)) return;
    wrapper.append($el.clone());
  });
  if (wrapper.children().length) $d('body').append(wrapper);

  // Inject helper CSS into head if not present
  const styleTag = `<style id="responsive-helpers">${RESPONSIVE_CSS}</style>`;
  if ($d('#responsive-helpers').length === 0) {
    $d('head').append(styleTag);
  }

  return $d.html();
}

module.exports = {
  mergeDesktopMobile,
  RESPONSIVE_CSS,
};

