const languageButton = document.querySelector('#language-toggle');
function setLanguage(language) {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-vi][data-en]').forEach(element => {
    element.textContent = element.dataset[language];
  });
  languageButton.textContent = language === 'vi' ? 'EN' : 'VI';
  languageButton.setAttribute('aria-label', language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt');
  try { localStorage.setItem('dt.language', language); } catch {}
}
let language = 'vi';
try { if (localStorage.getItem('dt.language') === 'en') language = 'en'; } catch {}
setLanguage(language);
languageButton.addEventListener('click', () => setLanguage(document.documentElement.lang === 'vi' ? 'en' : 'vi'));
