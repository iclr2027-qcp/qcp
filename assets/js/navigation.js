// Academic project page : sticky header on scroll + auto-generated floating TOC.
(function () {
  'use strict';

  // ── Sticky header: show once the hero is scrolled past ──────────────
  var sticky = document.getElementById('sticky-header');
  var hero = document.querySelector('.hero');
  if (sticky && hero) {
    var onScroll = function () {
      if (document.documentElement.classList.contains('qcp-editor-open')) return;
      var past = window.scrollY > hero.offsetHeight - 40;
      sticky.classList.toggle('visible', past);
      sticky.inert = !past;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Dynamic TOC built from every <section> with an id + heading ─────
  var toc = document.getElementById('dynamic-toc');
  if (toc) {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll('section[id] h2')
    );
    if (sections.length) {
      var html = '<span class="toc-title">Contents</span><ul>';
      sections.forEach(function (h) {
        var sec = h.closest('section');
        var id = sec.id;
        var label = h.dataset.tocLabel || (h.textContent || '').trim();
        html += '<li><a href="#' + id + '" data-id="' + id + '">' + label + '</a></li>';
      });
      html += '</ul>';
      toc.innerHTML = html;

      var links = Array.prototype.slice.call(toc.querySelectorAll('a'));
      var byId = {};
      links.forEach(function (a) { byId[a.getAttribute('data-id')] = a; });

      var spy = function () {
        if (document.documentElement.classList.contains('qcp-editor-open')) return;
        var pos = window.scrollY + window.innerHeight * 0.3;
        var current = null;
        sections.forEach(function (h) {
          var sec = h.closest('section');
          if (sec && sec.getBoundingClientRect().top + window.scrollY <= pos) current = sec.id;
        });
        links.forEach(function (a) { a.classList.remove('active'); });
        if (current && byId[current]) byId[current].classList.add('active');
      };
      window.addEventListener('scroll', spy, { passive: true });
      spy();
    }
  }
})();
