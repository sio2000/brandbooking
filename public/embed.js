/*! Hournook booking widget — https://hournook.com
 * Usage:
 *   <script src="https://YOUR-HOURNOOK-DOMAIN/embed.js" data-business="your-slug" async></script>
 *   Optional: data-label="Book now" data-color="#0f766e" data-mode="button|inline" data-target="#css-selector"
 *             data-lang="el" (language of the widget; otherwise the business's booking-page language)
 * The booking flow runs inside an isolated iframe on the Hournook domain, so it
 * never conflicts with your site's CSS and never exposes any API to your page.
 */
;(function () {
  'use strict'
  var script = document.currentScript
  if (!script) return
  var origin = new URL(script.src).origin
  var slug = (script.getAttribute('data-business') || '').replace(/[^a-z0-9-]/gi, '')
  if (!slug) return
  // The button's own words, in the widget's language (data-lang, else the host page's language).
  var TEXT = {
    en: ['Book an appointment', 'Close'],
    el: ['Κλείστε ραντεβού', 'Κλείσιμο'],
    es: ['Reservar cita', 'Cerrar'],
    fr: ['Prendre rendez-vous', 'Fermer'],
    de: ['Termin buchen', 'Schließen'],
    it: ['Prenota un appuntamento', 'Chiudi'],
    pt: ['Fazer marcação', 'Fechar'],
    ru: ['Записаться', 'Закрыть'],
    tr: ['Randevu al', 'Kapat'],
    pl: ['Zarezerwuj wizytę', 'Zamknij'],
    nl: ['Afspraak boeken', 'Sluiten'],
    zh: ['立即预约', '关闭'],
    ja: ['予約する', '閉じる'],
    hi: ['अपॉइंटमेंट बुक करें', 'बंद करें'],
    ar: ['احجز موعدًا', 'إغلاق'],
  }
  var asked = (script.getAttribute('data-lang') || '').toLowerCase()
  var pageLang = (document.documentElement.lang || '').toLowerCase().split('-')[0]
  var lang = TEXT[asked] ? asked : TEXT[pageLang] ? pageLang : 'en'
  var label = script.getAttribute('data-label') || TEXT[lang][0]
  var color = /^#[0-9a-f]{6}$/i.test(script.getAttribute('data-color') || '')
    ? script.getAttribute('data-color')
    : '#0f766e'
  var mode = script.getAttribute('data-mode') === 'inline' ? 'inline' : 'button'
  var src =
    origin +
    '/embed/' +
    encodeURIComponent(slug) +
    '?src=widget' +
    (TEXT[asked] ? '&lang=' + asked : '')

  function frame(height) {
    var f = document.createElement('iframe')
    f.src = src
    f.title = TEXT[lang][0]
    f.loading = 'lazy'
    f.style.cssText =
      'width:100%;border:0;border-radius:16px;background:transparent;height:' + height
    f.setAttribute('allow', 'clipboard-write')
    return f
  }

  if (mode === 'inline') {
    var target =
      document.querySelector(script.getAttribute('data-target') || '') || script.parentNode
    target.appendChild(frame('820px'))
    return
  }

  var btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = label
  btn.style.cssText =
    'all:initial;font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;background:' +
    color +
    ';color:#fff;padding:14px 20px;border-radius:12px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.15)'
  script.parentNode.insertBefore(btn, script)

  var overlay
  function close() {
    if (overlay) {
      overlay.remove()
      overlay = null
      document.body.style.overflow = ''
      btn.focus()
    }
  }
  btn.addEventListener('click', function () {
    overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', TEXT[lang][0])
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(20,18,16,.5);display:flex;align-items:center;justify-content:center;padding:16px'
    var box = document.createElement('div')
    box.style.cssText =
      'position:relative;width:100%;max-width:760px;height:min(88vh,860px);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3)'
    var x = document.createElement('button')
    x.type = 'button'
    x.setAttribute('aria-label', TEXT[lang][1])
    x.textContent = '×'
    x.style.cssText =
      'all:initial;position:absolute;top:8px;' +
      (lang === 'ar' ? 'left' : 'right') +
      ':10px;z-index:1;font:400 28px/1 system-ui;color:#444;cursor:pointer;padding:4px 8px'
    x.addEventListener('click', close)
    var f = frame('100%')
    f.style.borderRadius = '0'
    box.appendChild(x)
    box.appendChild(f)
    overlay.appendChild(box)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close()
    })
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        close()
        document.removeEventListener('keydown', onKey)
      }
    })
    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'
    x.focus()
  })
})()
