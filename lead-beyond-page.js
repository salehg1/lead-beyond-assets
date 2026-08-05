/* ==========================================================================
   LEAD BEYOND with AI — page behaviour
   Plain vanilla JavaScript. No framework, no external dependency.

   The markup ships fully built, so this file only wires up runtime behaviour.
   It exits immediately unless #lead-beyond-page is present, and every query is
   rooted at that element — Salla's global header, cart, checkout and all other
   pages are never touched.

   Modules
     1. Booking CTAs            6. Journey flip cards
     2. Language switch         7. Hero pointer field
     3. Smooth internal nav     8. Animated statistics
     4. Mobile nav sheet        9. Checkout dock
     5. FAQ accordion          10. Reserve form

   The FAQ uses native <details>/<summary> and the section reveals use CSS
   scroll-driven animations, so both work with JavaScript disabled.
   ========================================================================== */
(function () {
  'use strict';

  var ROOT_ID     = 'lead-beyond-page';
  var BOOK_URL    = 'https://lead.sbtleaders.com/payment/p598935633';
  var NAV_OFFSET  = 72;
  var STORAGE_KEY = 'lb_leads';

  function $(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.lbReady === '1') return false;
    root.dataset.lbReady = '1';
    init(root);
    return true;
  }

  function start() {
    if (boot()) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    }
    // Salla themes may inject page content after load; watch briefly for it.
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { if (boot()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 15000);
    }
  }

  function init(root) {
    var bookUrl = root.getAttribute('data-cta') || BOOK_URL;
    var panes = { ar: $('[data-lb-pane="ar"]', root), en: $('[data-lb-pane="en"]', root) };

    initBooking(root, bookUrl);
    initLanguage(root, panes);
    initSmoothNav(root);

    Object.keys(panes).forEach(function (lang) {
      var pane = panes[lang];
      if (!pane) return;
      initMobileStacks(pane, lang);
      initMobileNav(pane);
      initJourneyCards(pane, lang);
      // Hero pointer-tracking is disabled by request — see initHeroPointer.
      // initHeroPointer(pane);
      initStats(pane);
      initDock(pane);
      initForm(pane, lang, bookUrl);
    });
  }

  /* ---------------------------------------------------------------------
     1. Booking CTAs — every one goes straight to the payment page.
     --------------------------------------------------------------------- */
  function initBooking(root, bookUrl) {
    $$('[data-lb-book]', root).forEach(function (el) {
      el.setAttribute('href', bookUrl);
      el.setAttribute('rel', 'noopener');
    });
  }

  /* ---------------------------------------------------------------------
     2. Language switch
     --------------------------------------------------------------------- */
  function initLanguage(root, panes) {
    function setLang(lang) {
      if (!panes[lang]) return;
      Object.keys(panes).forEach(function (key) {
        if (!panes[key]) return;
        if (key === lang) panes[key].removeAttribute('hidden');
        else panes[key].setAttribute('hidden', '');
      });
      root.setAttribute('data-lang', lang);
      closeAllMobileNavs(root);

      var toggle = $('[data-lb-setlang]', panes[lang]);
      if (toggle) toggle.focus({ preventScroll: true });
      // The freshly shown pane was display:none, so anything that measured
      // itself while hidden needs a nudge.
      if (panes[lang].lbApplyStacks) panes[lang].lbApplyStacks();
      window.dispatchEvent(new Event('resize'));
    }

    $$('[data-lb-setlang]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(btn.getAttribute('data-lb-setlang'));
      });
    });
  }

  function closeAllMobileNavs(root) {
    $$('.mobile-nav-toggle', root).forEach(function (t) {
      if (t.lbSetOpen) t.lbSetOpen(false);
    });
  }

  /* ---------------------------------------------------------------------
     3. Smooth internal navigation
     --------------------------------------------------------------------- */
  function initSmoothNav(root) {
    root.addEventListener('click', function (event) {
      var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (!link || !root.contains(link)) return;

      var id = link.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target || !root.contains(target)) return;

      event.preventDefault();
      scrollToTarget(target);

      var had = target.hasAttribute('tabindex');
      if (!had) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (!had) {
        target.addEventListener('blur', function h() {
          target.removeAttribute('tabindex');
          target.removeEventListener('blur', h);
        });
      }
    });
  }

  function scrollToTarget(target) {
    var top = target.getBoundingClientRect().top + window.pageYOffset - NAV_OFFSET;
    if (reducedMotion()) { window.scrollTo(0, top); return; }

    var from = window.pageYOffset;
    try {
      window.scrollTo({ top: top, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, top);
      return;
    }
    // Some embedded webviews accept the options object but never animate.
    setTimeout(function () {
      if (Math.abs(window.pageYOffset - from) < 2 && Math.abs(top - from) > 2) {
        window.scrollTo(0, top);
      }
    }, 240);
  }

  /* ---------------------------------------------------------------------
     3b. Mobile card stacks

     On phones the card rows stop being side-swipe tracks and become a single
     column, so nothing sits off-screen waiting to be discovered. Any row that
     scrolls horizontally gets .mobile-stack, which the design layer styles as
     a grid. This has to run at runtime because it depends on the viewport.
     --------------------------------------------------------------------- */
  function initMobileStacks(pane, lang) {
    function apply() {
      if (!window.matchMedia('(max-width: 600px)').matches) return;
      if (pane.hasAttribute('hidden')) return;

      $$('section div', pane).forEach(function (node) {
        if (node.classList.contains('mobile-stack')) return;
        if (node.children.length < 2) return;
        var style = window.getComputedStyle(node);
        var scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll';
        if (!scrolls || node.scrollWidth <= node.clientWidth + 8) return;
        node.classList.add('mobile-stack');
      });

      // A stacked column is tapped, not swiped.
      var hint = $('.journey-interaction-hint', pane);
      if (hint && !hint.dataset.lbMobileCopy) {
        hint.dataset.lbMobileCopy = '1';
        var swap = function (text) {
          return text.replace('مرّر أو اضغط', 'اضغط').replace(/Swipe or tap/i, 'Tap')
                     .replace(/Hover or click/i, 'Tap');
        };
        var leaves = $$('*', hint).filter(function (n) { return !n.children.length; });
        if (leaves.length) leaves.forEach(function (n) { n.textContent = swap(n.textContent || ''); });
        else hint.textContent = swap(hint.textContent || '');
      }
    }

    apply();
    window.addEventListener('resize', apply);
    // The pane is display:none until its language is picked, so widths read as
    // zero; re-run once it becomes visible.
    pane.lbApplyStacks = apply;
  }

  /* ---------------------------------------------------------------------
     4. Mobile navigation sheet
     --------------------------------------------------------------------- */
  function initMobileNav(pane) {
    var toggle = $('.mobile-nav-toggle', pane);
    var panel  = $('.mobile-nav-panel', pane);
    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.classList.toggle('mobile-nav-panel--open', open);
      toggle.classList.toggle('mobile-nav-toggle--open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.lbSetOpen = setOpen;

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) setOpen(false);
    });
    window.addEventListener('scroll', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
    }, { passive: true });

    setOpen(false);
  }

  /* ---------------------------------------------------------------------
     6. Journey flip cards
     --------------------------------------------------------------------- */
  function initJourneyCards(pane, lang) {
    $$('.journey-flip-card', pane).forEach(function (card) {
      if (card.dataset.lbFlip === '1') return;
      card.dataset.lbFlip = '1';

      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');

      function toggle() {
        var active = card.classList.toggle('is-flipped');
        card.setAttribute('aria-expanded', String(active));
      }
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     7. Hero pointer field — DISABLED

     This made the hero's glow follow the cursor and lifted its saturation on
     hover. Turned off by request: the call in init() is commented out, and the
     CSS pins the glow to its resting position (72% / 30%), so the hero keeps
     its look but no longer reacts to the pointer.

     To restore: uncomment the initHeroPointer call in init(), and remove the
     "hero pointer field disabled" block at the end of the CSS.
     --------------------------------------------------------------------- */
  function initHeroPointer(pane) {   /* eslint-disable-line no-unused-vars */
    var hero = $('.story-hero', pane);
    if (!hero || hero.dataset.lbPointer === '1') return;
    hero.dataset.lbPointer = '1';

    var frame = 0;
    function setPointer(x, y) {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        hero.style.setProperty('--pointer-x', x + '%');
        hero.style.setProperty('--pointer-y', y + '%');
      });
    }

    hero.addEventListener('pointerenter', function () {
      if (!reducedMotion() && window.innerWidth >= 781) hero.classList.add('is-pointer-active');
    }, { passive: true });

    hero.addEventListener('pointermove', function (event) {
      if (reducedMotion() || window.innerWidth < 781) return;
      hero.classList.add('is-pointer-active');
      var b = hero.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, (event.clientX - b.left) / b.width * 100));
      var y = Math.max(0, Math.min(100, (event.clientY - b.top) / b.height * 100));
      setPointer(x, y);
    }, { passive: true });

    hero.addEventListener('pointerleave', function () {
      hero.classList.remove('is-pointer-active');
      setPointer(72, 30);
    }, { passive: true });
  }

  /* ---------------------------------------------------------------------
     8. Animated statistics — count up once, when scrolled into view.
     --------------------------------------------------------------------- */
  function initStats(pane) {
    var nodes = $$('.story-hero .hero-figure__value, .evidence-stat, .story-dark .impact-figure__value', pane);

    // Fall back to the original structural lookups when the design's helper
    // classes are absent.
    if (!nodes.length) {
      nodes = $$('.story-hero > div:not(.hero-motion-field) > div:last-child > div > div:first-child', pane)
        .concat($$('.story-dark > div > div:last-child > div > div:first-child', pane))
        .concat($$('.evidence-stat', pane));
    }

    nodes.forEach(observeNumber);
  }

  function observeNumber(node) {
    if (!node || node.dataset.lbCount === '1') return;
    node.dataset.lbCount = '1';

    if (typeof IntersectionObserver !== 'function') { animateNumber(node); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateNumber(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.45 });
    io.observe(node);
  }

  function animateNumber(node) {
    var raw = (node.textContent || '').trim();
    if (!/\d/.test(raw)) return;
    if (reducedMotion()) return;

    var originalHTML = node.innerHTML;
    var textNode = Array.prototype.slice.call(node.childNodes).filter(function (c) {
      return c.nodeType === 3 && /\d/.test(c.nodeValue || '');
    })[0];

    var range  = raw.match(/(\d+)\s*[–-]\s*(\d+)/);
    var single = raw.match(/(\d[\d,]*)/);
    var duration = 1250;
    var started = 0;

    function write(value) {
      if (textNode && textNode.parentNode === node) textNode.nodeValue = value;
      else node.textContent = value;
    }

    function frame(now) {
      if (!started) started = now;
      var progress = Math.min(1, (now - started) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);

      if (range) {
        write(Math.round(Number(range[1]) * eased) + '–' + Math.round(Number(range[2]) * eased));
      } else if (single) {
        var target = Number(single[1].replace(/,/g, ''));
        var value = Math.round(target * eased).toLocaleString('en-US');
        write((raw.indexOf('+') > -1 ? '+' : '') + value +
              (!textNode && raw.indexOf('%') > -1 ? '%' : ''));
      }

      if (progress < 1) requestAnimationFrame(frame);
      else node.innerHTML = originalHTML;
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------------
     9. Checkout dock — hides once the contact chapter is reached.
     --------------------------------------------------------------------- */
  function initDock(pane) {
    var dock = $('.checkout-dock', pane);
    if (!dock || dock.dataset.lbDock === '1') return;
    dock.dataset.lbDock = '1';

    dock.classList.add('checkout-dock--visible');

    var frame = 0;
    function update() {
      frame = 0;
      if (pane.hasAttribute('hidden')) return;
      var contact = $('.contact-chapter', pane) || $('[id^="lb-reserve"]', pane);
      if (!contact) return;
      var arrived = contact.getBoundingClientRect().top <= window.innerHeight * 0.9;
      dock.classList.toggle('checkout-dock--hidden', arrived);
      dock.setAttribute('aria-hidden', arrived ? 'true' : 'false');
    }
    function request() { if (!frame) frame = requestAnimationFrame(update); }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------------
     10. Reserve form — validate, keep a local copy, then hand off to checkout.
     --------------------------------------------------------------------- */
  function initForm(pane, lang, bookUrl) {
    var form = $('form', pane);
    if (!form || form.dataset.lbForm === '1') return;
    if (!form.querySelector('[name="fullname"], [name="name"]')) return;
    form.dataset.lbForm = '1';

    var MESSAGES = {
      ar: 'يرجى تعبئة الحقول المطلوبة.',
      en: 'Please complete the required fields.'
    };

    var error = document.createElement('p');
    error.setAttribute('role', 'alert');
    error.style.cssText = 'font-size:14px;color:#c0392b;margin:8px 0 0;';
    error.hidden = true;
    form.appendChild(error);

    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        error.textContent = MESSAGES[lang] || MESSAGES.en;
        error.hidden = false;
        var bad = form.querySelector(':invalid');
        if (bad) bad.focus();
        return;
      }
      error.hidden = true;

      var get = function (name) {
        var f = form.querySelector('[name="' + name + '"]');
        return f ? f.value.trim() : '';
      };
      var data = {
        name:    get('fullname') || get('name'),
        company: get('company'),
        role:    get('role'),
        phone:   get('phone'),
        message: get('message'),
        lang:    lang,
        at:      Date.now()
      };

      try {
        var stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        stored.push(data);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch (err) { /* storage unavailable — not fatal */ }

      window.location.href = bookUrl;
    });
  }

  /* --------------------------------------------------------------------- */
  start();

})();
